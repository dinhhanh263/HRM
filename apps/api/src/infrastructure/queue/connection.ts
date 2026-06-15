import IORedis, { type Redis } from 'ioredis';

/**
 * BullMQ requires its (blocking) connections to set `maxRetriesPerRequest: null`,
 * which differs from the app's cache client. We therefore mint dedicated
 * connections for the queue rather than reusing `infrastructure/cache/redis`.
 * A factory (not a singleton) is used because BullMQ recommends separate
 * connections for the Queue and each Worker.
 */
export function createQueueConnection(): Redis {
  return new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
}
