import { Worker } from 'bullmq';
import { env } from './config';
import { logger } from './logger';
import { EMAIL_QUEUE_NAME, type SendJobData } from './lib/queue';
import { createRedis, disconnectRedis } from './lib/redis';
import { prisma } from './lib/prisma';
import { ensureEmailIndex } from './lib/elasticsearch';
import { reconcileScheduledEmails } from './scheduling/reconcile';
import { processSendJob } from './worker/processor';

const workerRedis = createRedis('worker');

async function main(): Promise<void> {
  await ensureEmailIndex().catch((error) => {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'elasticsearch setup failed');
  });
  const restored = await reconcileScheduledEmails();
  logger.info(
    {
      concurrency: env.workerConcurrency,
      minSendDelayMs: env.minSendDelayMs,
      maxEmailsPerHourPerSender: env.maxEmailsPerHourPerSender,
      restored,
    },
    'email worker started',
  );

  const worker = new Worker<SendJobData>(
    EMAIL_QUEUE_NAME,
    async (job, token) => {
      if (!token) throw new Error('BullMQ did not provide a worker lock token.');
      await processSendJob(job, token);
    },
    {
      connection: workerRedis,
      concurrency: env.workerConcurrency,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error({ emailId: job?.data.emailId, err: error.message }, 'email job failed');
  });

  const shutdown = async () => {
    logger.info('email worker shutting down');
    await worker.close();
    disconnectRedis();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch(async (error) => {
  logger.error({ err: error instanceof Error ? error.message : String(error) }, 'worker crashed');
  await prisma.$disconnect();
  process.exit(1);
});
