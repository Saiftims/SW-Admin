import { NextResponse } from "next/server";
import { requireAuthedUser } from "@/lib/auth/requireAuthedUser";
import { requireTenantAccessOrThrow } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  const user = await requireAuthedUser();
  const params = await context.params;
  await requireTenantAccessOrThrow({ user, tenantId: params.tenantId });

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: {
      id: true,
      name: true,
      onboardingStatus: true,
      defaultAnalysisStrategy: true,
      createdAt: true,
      updatedAt: true,
      firm: true,
      clawdbotInstance: true,
      memoryDocument: {
        select: {
          id: true,
          currentVersionId: true
        }
      },
      slackConfigs: true,
      emailConfigs: true,
      twilioConfig: {
        select: {
          id: true,
          phoneNumber: true,
          verificationStatus: true,
        },
      }
    }
  });

  if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  return NextResponse.json({ tenant });
}

