import { cookies } from "next/headers";
import { signSessionToken, verifySessionToken } from "@/lib/auth/jwt";
import { getEnv } from "@/lib/env";

function getSessionCookieName() {
  return getEnv().SESSION_COOKIE_NAME;
}

export function createSessionCookie(value: string) {
  // Note: Route handlers will set cookie explicitly using Next Response APIs.
  // This helper exists for consistency if we later move to a shared cookie util.
  return value;
}

export async function getSessionTokenFromCookies() {
  const cookieStore = await cookies();
  return cookieStore.get(getSessionCookieName())?.value;
}

export async function getClaimsOrNull() {
  const token = await getSessionTokenFromCookies();
  if (!token) return null;
  try {
    return verifySessionToken(token);
  } catch {
    return null;
  }
}

export function createSession(claims: { sub: string; email?: string; role: string }) {
  return signSessionToken(claims);
}

