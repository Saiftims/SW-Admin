import { Queue } from "bullmq";
import { buildQueue } from "@/lib/queue/connection";
import { JOBS, QUEUE_NAME } from "@/lib/queue/queues";

let queue: Queue | null = null;

function getQueue() {
  if (queue) return queue;
  queue = buildQueue(QUEUE_NAME);
  return queue;
}

type BaseJobInput = {
  tenantId: string;
  correlationId: string;
};

export async function enqueueProvisionClawdbotJob(input: BaseJobInput) {
  const jobId = `provision:${input.tenantId}`;
  return getQueue().add(
    JOBS.PROVISION_CLAWDBOT,
    input,
    {
      jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500
    }
  );
}

export async function enqueueGenerateMemoryMarkdownJob(input: BaseJobInput) {
  const jobId = `memory:${input.tenantId}`;
  return getQueue().add(
    JOBS.GENERATE_MEMORY,
    input,
    {
      jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500
    }
  );
}

