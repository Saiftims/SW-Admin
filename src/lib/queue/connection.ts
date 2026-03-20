import { Queue, type QueueOptions } from "bullmq";
import IORedis from "ioredis";
import { getEnv } from "@/lib/env";

// BullMQ uses ioredis under the hood. We keep a single shared connection in-process.
let redisConnection: IORedis | null = null;

export function getRedisConnection() {
  if (redisConnection) return redisConnection;
  redisConnection = new IORedis(getEnv().REDIS_URL, { maxRetriesPerRequest: null });
  return redisConnection;
}

export function buildQueue(name: string, options?: Omit<QueueOptions, "connection">) {
  return new Queue(name, {
    // BullMQ has its own ioredis dependency; the runtime object is compatible,
    // but TS types can diverge due to duplicate ioredis versions.
    connection: getRedisConnection() as any,
    ...options
  });
}

