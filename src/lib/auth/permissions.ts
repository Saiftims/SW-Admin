import type { Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function getTenantRoleOrNull(params: {
  userId: string;
  tenantId: string;
}) {
  const member = await prisma.tenantMember.findUnique({
    where: {
      tenantId_userId: {
        tenantId: params.tenantId,
        userId: params.userId
      }
    },
    select: {
      role: true
    }
  });

  return member?.role ?? null;
}

export function canAccessTenant(user: Pick<User, "globalRole">, tenantRole: string | null) {
  // Super admin bypasses tenant scoping.
  if (user.globalRole === "SUPER_ADMIN") return true;
  // Otherwise, require explicit membership.
  return !!tenantRole;
}

export async function requireTenantAccessOrThrow(params: { user: Pick<User, "id" | "globalRole">; tenantId: string }) {
  const tenantRole = await getTenantRoleOrNull({
    userId: params.user.id,
    tenantId: params.tenantId
  });
  if (!canAccessTenant(params.user, tenantRole)) {
    const err = new Error("Forbidden");
    (err as any).code = "FORBIDDEN";
    throw err;
  }
  return tenantRole;
}

export async function requireGlobalOrThrow(params: { user: Pick<User, "globalRole"> }) {
  if (params.user.globalRole !== "SUPER_ADMIN") {
    const err = new Error("Forbidden");
    (err as any).code = "FORBIDDEN";
    throw err;
  }
}

