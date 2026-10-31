import { createApp } from './app';
import { env } from './config';
import { logger } from './logger';
import { prisma } from './lib/prisma';
import { disconnectRedis } from './lib/redis';
import { emailQueue } from './lib/queue';
import { closeElasticsearch, ensureEmailIndex } from './lib/elasticsearch';

async function main() {
  await ensureEmailIndex().catch((error) => {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'elasticsearch setup failed');
  });
  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info({ port: env.port }, 'api listening');
  });

  const shutdown = async () => {
    server.close();
    await closeElasticsearch();
    await emailQueue.close();
    disconnectRedis();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, 'api crashed');
  process.exit(1);
});
