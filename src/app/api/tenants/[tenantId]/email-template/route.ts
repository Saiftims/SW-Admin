import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuthedUser } from "@/lib/auth/requireAuthedUser";
import { requireTenantAccessOrThrow } from "@/lib/auth/permissions";
import { getDefaultTemplate, renderTemplate, detectPlaceholders } from "@/lib/services/email-template";
import { buildTemplatePlaceholders } from "@/lib/services/silent-witness-client";

const MOCK_RESULT = {
  deltaV: { min: 18.5, max: 31.2, unit: "mph" },
  impact: {
    pdofDegrees: 12.4,
    pdofDirection: "Front Right",
    peakAccelerationGs: 12.4,
    crashPulseMs: 104,
    impactType: "frontal-center",
    collisionType: "rear-end",
  },
  confidence: "high",
  aisDistribution: [
    { level: 0, label: "No Injury", description: "No injury", probability: 0.12 },
    { level: 1, label: "Minor", description: "Sprain/strain, minor contusion", probability: 0.34 },
    { level: 2, label: "Moderate", description: "Rib fracture, disc herniation", probability: 0.28 },
    { level: 3, label: "Serious", description: "Minor TBI, disc herniation with radicular symptoms", probability: 0.15 },
    { level: 4, label: "Severe", description: "Partial spinal cord injury", probability: 0.07 },
    { level: 5, label: "Critical", description: "Complete spinal cord injury, major TBI", probability: 0.03 },
    { level: 6, label: "Fatal", description: "Non-survivable injuries", probability: 0.01 },
  ],
  disclaimer: "Population-based distribution. Does not account for age, pre-existing conditions, seating position, restraint usage, or intrusion.",
  raw: null,
};

export async function GET(
  _req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  const user = await requireAuthedUser();
  const params = await context.params;
  await requireTenantAccessOrThrow({ user, tenantId: params.tenantId });

  let template = await prisma.emailTemplate.findFirst({
    where: { tenantId: params.tenantId },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 5,
      },
    },
  });

  const defaultHtml = getDefaultTemplate();

  // If no template exists, return default
  const latestVersion = template?.versions?.[0];
  const currentHtml = latestVersion?.htmlBody ?? defaultHtml;
  const placeholders = detectPlaceholders(currentHtml);

  // Render preview with mock data
  const mockPlaceholders = buildTemplatePlaceholders(MOCK_RESULT as any, {
    customerName: "Johnson & Associates",
    lawFirmName: "Johnson & Associates",
    caseReference: " — Case #2024-0847",
  });
  const previewHtml = renderTemplate(currentHtml, mockPlaceholders);

  return NextResponse.json({
    templateId: template?.id ?? null,
    currentHtml,
    previewHtml,
    placeholders,
    versions: template?.versions?.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      status: v.status,
      createdAt: v.createdAt,
    })) ?? [],
  });
}

const SaveTemplateSchema = z.object({
  htmlBody: z.string().min(1),
  publish: z.boolean().default(false),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  const user = await requireAuthedUser();
  const params = await context.params;
  await requireTenantAccessOrThrow({ user, tenantId: params.tenantId });

  const body = await req.json().catch(() => null);
  const parsed = SaveTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { htmlBody, publish } = parsed.data;

  // Ensure template record exists
  let template = await prisma.emailTemplate.findFirst({
    where: { tenantId: params.tenantId },
  });

  if (!template) {
    template = await prisma.emailTemplate.create({
      data: {
        tenantId: params.tenantId,
        name: "default",
      },
    });
  }

  // Get next version number
  const latestVersion = await prisma.emailTemplateVersion.findFirst({
    where: { templateId: template.id },
    orderBy: { versionNumber: "desc" },
  });

  const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

  // If publishing, un-publish all previous versions
  if (publish) {
    await prisma.emailTemplateVersion.updateMany({
      where: { templateId: template.id, status: "PUBLISHED" },
      data: { status: "DRAFT" },
    });
  }

  const version = await prisma.emailTemplateVersion.create({
    data: {
      templateId: template.id,
      versionNumber: nextVersionNumber,
      htmlBody,
      status: publish ? "PUBLISHED" : "DRAFT",
      placeholdersDetected: detectPlaceholders(htmlBody),
      createdByUserId: user.id,
    },
  });

  return NextResponse.json({
    ok: true,
    versionId: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
  });
}
