import IORedis from 'ioredis';
import { env } from '../config';
import { logger } from '../logger';

const clients = new Set<IORedis>();

// BullMQ uses Redis commands that must be allowed to wait, so
// maxRetriesPerRequest has to be null. Each caller gets its own connection
// because a worker's blocking pop must not stall the API's commands.
export function createRedis(name: string): IORedis {
  const client = new IORedis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  clients.add(client);
  client.on('error', (err) => {
    logger.error({ name, err: err.message }, 'redis connection error');
  });
  client.on('end', () => {
    clients.delete(client);
  });
  return client;
}

// disconnect() drops the socket immediately. quit() waits for a reply that
// BullMQ's extra clients sometimes never send, which keeps the process alive.
export function disconnectRedis(): void {
  for (const client of clients) {
    client.disconnect();
  }
  clients.clear();
}

export const appRedis = createRedis('app');
