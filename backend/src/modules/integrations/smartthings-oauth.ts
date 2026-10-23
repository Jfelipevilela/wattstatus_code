import axios from "axios";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { env } from "../../config/env";
import { ApiError } from "../../middleware/error-handler";
import { getErrorFields, logger } from "../../logging/logger";

// SmartThings OAuth-In (API_ONLY SmartApp). Stored credentials are kept in the
// existing encrypted integration token column: a personal access token is
// stored as-is, OAuth credentials as "oauth:" + JSON.

const OAUTH_PREFIX = "oauth:";
const STATE_TTL_MS = 10 * 60_000;
const REFRESH_MARGIN_MS = 5 * 60_000;
export const SMARTTHINGS_SCOPES = ["r:devices:*", "x:devices:*", "r:locations:*"];

export interface OAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  installedAppId?: string;
}

interface TokenStore {
  getIntegrationToken(userId: string, provider: string): Promise<string | null>;
  saveIntegrationToken(userId: string, provider: string, token: string): Promise<void>;
}

export const isOAuthConfigured = () =>
  Boolean(env.smartThingsClientId && env.smartThingsClientSecret && env.smartThingsRedirectUri);

export const serializeCredentials = (credentials: OAuthCredentials) =>
  OAUTH_PREFIX + JSON.stringify(credentials);

export const parseStoredToken = (
  stored: string
): { kind: "pat"; token: string } | { kind: "oauth"; credentials: OAuthCredentials } => {
  if (!stored.startsWith(OAUTH_PREFIX)) return { kind: "pat", token: stored };
  const credentials = JSON.parse(stored.slice(OAUTH_PREFIX.length)) as OAuthCredentials;
  return { kind: "oauth", credentials };
};

const sign = (payload: string) =>
  createHmac("sha256", env.jwtSecret).update(`smartthings-oauth:${payload}`).digest("base64url");

// The state binds the Samsung redirect to the user who started it, so a code
// cannot be replayed into another account.
export const createState = (userId: string, now = Date.now()) => {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, n: randomBytes(12).toString("base64url"), e: now + STATE_TTL_MS })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
};

export const verifyState = (state: string, userId: string, now = Date.now()) => {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.u === userId && typeof data.e === "number" && data.e > now;
  } catch {
    return false;
  }
};

export const buildAuthorizeUrl = (state: string) => {
  const url = new URL(env.smartThingsAuthorizeUrl);
  url.searchParams.set("client_id", env.smartThingsClientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", env.smartThingsRedirectUri);
  url.searchParams.set("scope", SMARTTHINGS_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
};

const requestToken = async (params: Record<string, string>): Promise<OAuthCredentials> => {
  try {
    const { data } = await axios.post(
      env.smartThingsTokenUrl,
      new URLSearchParams({ client_id: env.smartThingsClientId, ...params }).toString(),
      {
        timeout: 10000,
        auth: { username: env.smartThingsClientId, password: env.smartThingsClientSecret },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    if (typeof data?.access_token !== "string" || typeof data?.refresh_token !== "string") {
      throw new Error("invalid token response");
    }
    const expiresIn = Number(data.expires_in);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 86400) * 1000,
      installedAppId: typeof data.installed_app_id === "string" ? data.installed_app_id : undefined,
    };
  } catch (error) {
    logger.error("smartthings.oauth_token_failed", {
      grantType: params.grant_type,
      ...getErrorFields(error),
    });
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 400 || status === 401) {
      throw new ApiError(424, "Token SmartThings expirado ou revogado. Conecte novamente.");
    }
    throw new ApiError(503, "SmartThings indisponível. Tente novamente.");
  }
};

export const exchangeCode = (code: string) =>
  requestToken({ grant_type: "authorization_code", code, redirect_uri: env.smartThingsRedirectUri });

const refreshes = new Map<string, Promise<string>>();

// Returns a usable access token, refreshing OAuth credentials shortly before
// they expire. Refresh tokens rotate, so concurrent refreshes for one user
// share a single request.
export const resolveAccessToken = async (store: TokenStore, userId: string) => {
  const stored = await store.getIntegrationToken(userId, "smartthings");
  if (!stored) return null;
  const parsed = parseStoredToken(stored);
  if (parsed.kind === "pat") return parsed.token;
  const { credentials } = parsed;
  if (credentials.expiresAt - Date.now() > REFRESH_MARGIN_MS) return credentials.accessToken;
  const running = refreshes.get(userId);
  if (running) return running;
  const refresh = requestToken({ grant_type: "refresh_token", refresh_token: credentials.refreshToken })
    .then(async (next) => {
      await store.saveIntegrationToken(
        userId,
        "smartthings",
        serializeCredentials({ ...next, installedAppId: next.installedAppId ?? credentials.installedAppId })
      );
      logger.info("smartthings.oauth_token_refreshed");
      return next.accessToken;
    })
    .finally(() => refreshes.delete(userId));
  refreshes.set(userId, refresh);
  return refresh;
};
