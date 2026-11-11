// Tuya Cloud OpenAPI request signing (HMAC-SHA256, "new" signature algorithm).
// stringToSign = METHOD \n sha256(body) \n signedHeaders \n path?sortedQuery
// token calls:    sign(clientId + t + nonce + stringToSign)
// business calls: sign(clientId + accessToken + t + nonce + stringToSign)
import { createHash, createHmac, randomUUID } from "crypto";

export interface TuyaSignInput {
  clientId: string;
  secret: string;
  method: string;
  path: string;
  query?: Record<string, string | number>;
  body?: string;
  accessToken?: string;
  t?: string;
  nonce?: string;
}

export const buildTuyaUrl = (path: string, query?: Record<string, string | number>) => {
  const keys = Object.keys(query ?? {}).sort();
  if (!keys.length) return path;
  return `${path}?${keys.map((key) => `${key}=${query![key]}`).join("&")}`;
};

export const signTuyaRequest = (input: TuyaSignInput) => {
  const t = input.t ?? String(Date.now());
  const nonce = input.nonce ?? randomUUID();
  const bodyHash = createHash("sha256").update(input.body ?? "").digest("hex");
  const url = buildTuyaUrl(input.path, input.query);
  const stringToSign = [input.method.toUpperCase(), bodyHash, "", url].join("\n");
  const payload = input.clientId + (input.accessToken ?? "") + t + nonce + stringToSign;
  const sign = createHmac("sha256", input.secret).update(payload).digest("hex").toUpperCase();
  const headers: Record<string, string> = {
    client_id: input.clientId,
    sign,
    t,
    nonce,
    sign_method: "HMAC-SHA256",
  };
  if (input.accessToken) headers.access_token = input.accessToken;
  return { url, headers };
};
