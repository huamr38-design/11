import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function secret() {
  return process.env.APP_AUTH_SECRET || process.env.ADMIN_PASSWORD || process.env.AI_API_KEY || "dev-only-secret";
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(username: string) {
  const payload = base64url(JSON.stringify({ u: username, exp: Date.now() + TOKEN_TTL_MS }));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | null | undefined) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: string; exp?: number };
    if (!data.u || !data.exp || data.exp < Date.now()) return null;
    return data.u;
  } catch {
    return null;
  }
}

export function bearerUser(request: Request) {
  const header = request.headers.get("authorization") || "";
  return verifySessionToken(header.replace(/^Bearer\s+/i, ""));
}
