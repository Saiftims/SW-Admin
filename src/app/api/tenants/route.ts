import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuthedUser } from "@/lib/auth/requireAuthedUser";

const CreateTenantSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  counselorType: z.string().min(1),
  lawFirmName: z.string().min(1),
  billingEmail: z.string().email(),
  phoneNumber: z.string().min(1),
  streetAddress: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  zipCode: z.string().min(1),
  country: z.string().min(1),
});

export async function GET() {
  try {
    const user = await requireAuthedUser();

    const tenants =
      user.globalRole === "SUPER_ADMIN"
        ? await prisma.tenant.findMany({
            select: {
              id: true,
              name: true,
              onboardingStatus: true,
              firm: true,
              clawdbotInstance: true,
              memoryDocument: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
          })
        : await prisma.tenant.findMany({
            where: {
              tenantMembers: { some: { userId: user.id } },
            },
            select: {
              id: true,
              name: true,
              onboardingStatus: true,
              firm: true,
              clawdbotInstance: true,
              memoryDocument: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
          });

    return NextResponse.json({ tenants });
  } catch (e: any) {
    console.error("[API /tenants GET]", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: e?.status ?? 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser();

    const body = await req.json().catch(() => null);
    const parsed = CreateTenantSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsed.data;

    const tenant = await prisma.tenant.create({
      data: {
        name: input.lawFirmName,
        onboardingStatus: "PENDING",
        firm: {
          create: {
            counselorType: input.counselorType,
            lawFirmName: input.lawFirmName,
            billingEmail: input.billingEmail,
            phoneNumber: input.phoneNumber,
            streetAddress: input.streetAddress,
            city: input.city,
            state: input.state,
            zipCode: input.zipCode,
            country: input.country,
          },
        },
        clawdbotInstance: {
          create: { provisioningState: "NOT_STARTED" },
        },
        defaultAnalysisStrategy: "analyze_all_and_aggregate",
        subscriptions: {
          create: {
            plan: "trial",
            billingEmail: input.billingEmail,
            status: "trial",
          },
        },
        tenantMembers: {
          create: {
            userId: user.id,
            role: "OPS_ADMIN",
          },
        },
      },
    });

    // Provision inline (serverless-compatible — no Redis needed)
    try {
      const { provisionTenantInline } = await import("@/lib/services/provisioner");
      await provisionTenantInline(tenant.id);
    } catch (provErr) {
      console.warn("[API /tenants POST] Provisioning error (non-fatal):", provErr);
    }

    return NextResponse.json({ tenantId: tenant.id });
  } catch (e: any) {
    console.error("[API /tenants POST] Error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to create tenant." },
      { status: e?.status ?? 500 }
    );
  }
}
