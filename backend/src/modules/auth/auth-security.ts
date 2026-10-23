export const SESSION_SECONDS = 12 * 60 * 60;
export const JWT_ISSUER = "wattstatus";
export const JWT_AUDIENCE = "wattstatus-api";
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const AUTH_COOKIE_NAME = process.env.NODE_ENV === "production"
  ? "__Host-wattstatus_token" : "wattstatus_token";
export const CSRF_COOKIE_NAME = process.env.NODE_ENV === "production"
  ? "__Host-wattstatus_csrf" : "wattstatus_csrf";
export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
