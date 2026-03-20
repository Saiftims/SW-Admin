import { prisma } from "@/lib/db";
import { getClaimsOrNull } from "@/lib/auth/session";

export class HttpAuthError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function requireAuthedUser() {
  const claims = await getClaimsOrNull();
  if (!claims?.sub) {
    throw new HttpAuthError(401, "UNAUTHORIZED", "Missing or invalid session.");
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, email: true, globalRole: true }
  });
  if (!user) {
    throw new HttpAuthError(401, "UNAUTHORIZED", "Session user not found.");
  }

  return user;
}

