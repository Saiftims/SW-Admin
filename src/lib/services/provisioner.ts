import { prisma } from "@/lib/db";

export async function provisionTenantInline(tenantId: string) {
  // 1. Update bot instance to LIVE
  await prisma.clawdbotInstance.update({
    where: { tenantId },
    data: {
      provisioningState: "LIVE",
      externalInstanceId: `bot-${tenantId.slice(0, 8)}`,
      errorMessage: null,
      lastStateChangeAt: new Date(),
    },
  });

  // 2. Generate memory.md
  let memoryDoc = await prisma.memoryDocument.findUnique({ where: { tenantId } });
  if (!memoryDoc) {
    memoryDoc = await prisma.memoryDocument.create({ data: { tenantId, currentVersionId: null } });
  }

  const latestVersion = await prisma.memoryDocumentVersion.findFirst({
    where: { memoryDocumentId: memoryDoc.id },
    orderBy: { versionNumber: "desc" },
  });

  const nextVersion = (latestVersion?.versionNumber ?? 0) + 1;

  const contentMarkdown = `# Silent Witness — Bot Knowledge Base

You are the Silent Witness crash analysis assistant. You help personal injury attorneys understand car crash evidence.

## About Silent Witness
Silent Witness uses computer vision and physics-based analysis to evaluate car crash photographs. When photos are uploaded, they're processed through the Silent Witness API to produce:
- **Delta-V** estimates (change in velocity during impact, in mph)
- **Impact direction** and principal direction of force (PDOF)
- **G-force** estimates (peak acceleration)
- **Crash pulse** duration
- **AIS injury probabilities** (Abbreviated Injury Scale, population-based estimates)

## How to respond
- Always be professional and legally cautious
- Present analysis results clearly with proper context
- Never make definitive medical diagnoses
- Always include the disclaimer when sharing AIS probabilities
- Suggest next steps (additional photos, expert review, etc.) when appropriate
- Use simple language that attorneys can relay to clients

## Key terms
- **Delta-V (mph)**: velocity change during collision. Higher values = more severe impact
- **PDOF**: direction the force came from (e.g., "Front Right" at 12.4°)
- **G-force**: peak acceleration in multiples of gravity
- **AIS 0-6**: injury severity scale from No Injury (0) to Fatal (6)
- **Crash Pulse**: time window of the acceleration event (milliseconds)

## Important disclaimers
AIS probabilities are population-based statistical distributions. They do NOT account for:
- Occupant age or physical condition
- Pre-existing conditions
- Seating position
- Restraint usage (seatbelt, airbag)
- Vehicle intrusion

Always present this context when sharing injury probability data.`;

  const version = await prisma.memoryDocumentVersion.create({
    data: {
      memoryDocumentId: memoryDoc.id,
      tenantId,
      versionNumber: nextVersion,
      contentMarkdown,
      sourceProvenance: {
        sources: ["https://www.silentwitness.ai"],
        generatedAt: new Date().toISOString(),
        algorithm: "inline_v1",
      },
    },
  });

  await prisma.memoryDocument.update({
    where: { tenantId },
    data: { currentVersionId: version.id },
  });

  // 3. Mark tenant as active
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { onboardingStatus: "ACTIVE" },
  });

  console.log(`[Provisioner] Tenant ${tenantId} provisioned inline.`);
}
