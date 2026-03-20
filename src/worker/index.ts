process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err?.message, err?.stack);
});
process.on("unhandledRejection", (err: any) => {
  console.error("[FATAL] Unhandled rejection:", err?.message, err?.stack);
});

import { Worker } from "bullmq";
import { QUEUE_NAME, JOBS } from "../lib/queue/queues.js";
import { getRedisConnection } from "../lib/queue/connection.js";
import { prisma } from "../lib/db.js";
import { startAllSlackBots } from "../lib/services/slack-handler.js";
import { pollAndProcessEmails } from "../lib/services/gmail-service.js";
import { getEnv } from "../lib/env.js";

type JobInput = {
  tenantId: string;
  correlationId: string;
};

async function recordJobEvent(params: {
  tenantId?: string | null;
  correlationId?: string | null;
  entityType: string;
  entityId?: string | null;
  eventType: any;
  detailsJson?: any;
}) {
  await prisma.jobEventHistory.create({
    data: {
      tenantId: params.tenantId ?? undefined,
      correlationId: params.correlationId ?? undefined,
      entityType: params.entityType,
      entityId: params.entityId ?? undefined,
      eventType: params.eventType,
      detailsJson: params.detailsJson ?? undefined,
    },
  });
}

async function provisionBotJob(input: JobInput) {
  const { tenantId, correlationId } = input;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);

  await prisma.clawdbotInstance.update({
    where: { tenantId },
    data: { provisioningState: "PROVISIONING", errorMessage: null, lastStateChangeAt: new Date() },
  });

  // Simulate provisioning (replaced by real Slack bot start when config exists)
  await new Promise((r) => setTimeout(r, 300));

  const externalInstanceId = `bot-${tenantId.slice(0, 8)}`;
  await prisma.clawdbotInstance.update({
    where: { tenantId },
    data: { externalInstanceId, provisioningState: "LIVE", errorMessage: null, lastStateChangeAt: new Date() },
  });

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { onboardingStatus: "ACTIVE" },
  });

  await recordJobEvent({
    tenantId,
    correlationId,
    entityType: "botInstance",
    entityId: tenantId,
    eventType: "JOB_SUCCEEDED",
    detailsJson: { externalInstanceId },
  });
}

async function generateMemoryMarkdownJob(input: JobInput) {
  const { tenantId, correlationId } = input;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);

  let memoryDoc = await prisma.memoryDocument.findUnique({ where: { tenantId } });
  if (!memoryDoc) {
    memoryDoc = await prisma.memoryDocument.create({ data: { tenantId, currentVersionId: null } });
  }

  const latestVersion = await prisma.memoryDocumentVersion.findFirst({
    where: { memoryDocumentId: memoryDoc.id },
    orderBy: { versionNumber: "desc" },
  });

  const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

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
      versionNumber: nextVersionNumber,
      contentMarkdown,
      sourceProvenance: {
        sources: ["https://www.silentwitness.ai"],
        generatedAt: new Date().toISOString(),
        algorithm: "scaffold_v2",
      },
      createdByUserId: null,
    },
  });

  await prisma.memoryDocument.update({
    where: { tenantId },
    data: { currentVersionId: version.id },
  });

  await recordJobEvent({
    tenantId,
    correlationId,
    entityType: "memoryDocument",
    entityId: memoryDoc.id,
    eventType: "JOB_SUCCEEDED",
    detailsJson: { versionId: version.id, versionNumber: nextVersionNumber },
  });
}

// ─── Gmail polling loop ─────────────────────────────────────────────

async function startGmailPolling() {
  const env = getEnv();
  const intervalMs = parseInt(env.GMAIL_POLL_INTERVAL_MS, 10) || 15000;

  if (!env.GMAIL_USER || env.GMAIL_APP_PASSWORD === "xxxx-xxxx-xxxx-xxxx") {
    console.log("[Gmail] Skipping polling — credentials not configured.");
    return;
  }

  console.log(`[Gmail] Starting email polling (every ${intervalMs / 1000}s)...`);

  let pollCount = 0;
  async function poll() {
    pollCount++;
    try {
      const processed = await pollAndProcessEmails();
      if (processed > 0) {
        console.log(`[Gmail] ✅ Processed ${processed} email(s).`);
      } else if (pollCount % 4 === 1) {
        console.log(`[Gmail] Poll #${pollCount} — no new emails.`);
      }
    } catch (err: any) {
      console.error(`[Gmail] Polling error: ${err?.message}`);
      console.error(err?.stack);
    }
  }

  // Start recurring poll (don't await — let it run in background)
  setInterval(poll, intervalMs);
  // Fire initial poll without blocking
  poll();
}

// ─── Main ───────────────────────────────────────────────────────────

async function startWorker() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Silent Witness Worker — starting...");
  console.log("═══════════════════════════════════════════════════\n");

  // 1. Start BullMQ worker for provisioning / memory jobs
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const input = job.data as JobInput;
      if (!input?.tenantId) throw new Error("Missing tenantId in job data.");

      console.log(`[Queue] Processing job: ${job.name} for tenant ${input.tenantId}`);

      if (job.name === JOBS.PROVISION_CLAWDBOT) return provisionBotJob(input);
      if (job.name === JOBS.GENERATE_MEMORY) return generateMemoryMarkdownJob(input);
      throw new Error(`Unhandled job type: ${job.name}`);
    },
    { connection: getRedisConnection() as any, concurrency: 2 }
  );

  worker.on("completed", (job) => console.log(`[Queue] ✅ Job ${job?.name} completed.`));
  worker.on("failed", (job, err) => console.error(`[Queue] ❌ Job ${job?.name} failed:`, err.message));

  console.log("[Queue] Worker listening for jobs.\n");

  // 2. Start Slack bots for all tenants that have config
  try {
    await startAllSlackBots();
  } catch (err) {
    console.error("[Slack] Failed to start bots:", err);
  }

  // 3. Start Gmail polling
  try {
    await startGmailPolling();
  } catch (err) {
    console.error("[Gmail] Failed to start polling:", err);
  }

  console.log("\n[Worker] All services started. Waiting for events...\n");

  // Keep process alive
  await new Promise(() => undefined);
}

startWorker().catch((e) => {
  console.error("Worker crashed:", e);
  process.exit(1);
});
