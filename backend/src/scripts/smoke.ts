import { Worker } from 'bullmq';
import { prisma } from '../lib/prisma';
import { appRedis, disconnectRedis } from '../lib/redis';
import { EMAIL_QUEUE_NAME, emailQueue, type SendJobData } from '../lib/queue';
import { closeElasticsearch } from '../lib/elasticsearch';
import { createRedis } from '../lib/redis';
import { tryConsume, rateLimitKey } from '../lib/rateLimit';
import { scheduleCampaign } from '../services/scheduleService';
import { ensureSenders } from '../services/senderService';
import { processSendJob } from '../worker/processor';
import { env } from '../config';

// Proves two real behaviors:
// 1. An Ethereal mailbox accepts a message and returns a preview URL.
// 2. Once the Redis hourly counter is full, the next job is kept and moved
//    forward instead of being failed or deleted.
async function main() {
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: {
      googleSub: `smoke-${stamp}`,
      email: `smoke-${stamp}@example.com`,
      name: 'Smoke Test',
    },
  });

  const workerRedis = createRedis('smoke-worker');
  const worker = new Worker<SendJobData>(
    EMAIL_QUEUE_NAME,
    async (job, token) => {
      if (!token) throw new Error('Missing worker token.');
      await processSendJob(job, token);
    },
    { connection: workerRedis, concurrency: env.workerConcurrency },
  );

  try {
    const senders = await ensureSenders(user.id);
    const sender = senders[0];
    console.log(`Ethereal sender: ${sender.fromEmail}`);

    const soon = await scheduleCampaign(user.id, {
      subject: `ReachInbox smoke ${stamp}`,
      body: 'If you can open the Ethereal preview, SMTP delivery worked.',
      leadsText: 'smoke.recipient@example.com',
      recipients: [],
      startAt: new Date(Date.now() + 1000).toISOString(),
      delayBetweenSeconds: Math.ceil(env.minSendDelayMs / 1000),
      hourlyLimit: 10,
      senderId: sender.id,
    });

    const sent = await waitForStatus(soon.campaignId, 'sent', 50_000);
    if (!sent.previewUrl || !sent.providerMessageId) {
      throw new Error('Ethereal did not return a preview URL.');
    }
    console.log(`Sent preview: ${sent.previewUrl}`);

    const now = Date.now();
    const key = rateLimitKey('sender', sender.id, now);
    while (await tryConsume(appRedis, key, env.maxEmailsPerHourPerSender, now)) {
      // Fill this sender's hour so the next job has to wait.
    }

    const blocked = await scheduleCampaign(user.id, {
      subject: `ReachInbox held ${stamp}`,
      body: 'This message must stay in the queue until the next hour.',
      leadsText: 'held.recipient@example.com',
      recipients: [],
      startAt: new Date().toISOString(),
      delayBetweenSeconds: Math.ceil(env.minSendDelayMs / 1000),
      hourlyLimit: 10,
      senderId: sender.id,
    });

    const held = await waitForStatus(blocked.campaignId, 'rescheduled', 30_000);
    if (held.previewUrl || held.status === 'sent') {
      throw new Error('The rate-limited email was sent instead of being deferred.');
    }
    if (held.scheduledAt.getTime() < now + 10 * 60 * 1000) {
      throw new Error(`Deferred time is too soon: ${held.scheduledAt.toISOString()}`);
    }
    console.log(`Deferred until ${held.scheduledAt.toISOString()} without sending.`);
    console.log('Smoke passed.');
  } finally {
    await closeElasticsearch();
    await worker.close();
    await emailQueue.close();
    disconnectRedis();
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

async function waitForStatus(campaignId: string, status: 'sent' | 'rescheduled', timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const row = await prisma.emailJob.findFirst({ where: { campaignId, status } });
    if (row) return row;
    const failed = await prisma.emailJob.findFirst({ where: { campaignId, status: 'failed' } });
    if (failed) throw new Error(`Send failed: ${failed.lastError}`);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  const current = await prisma.emailJob.findMany({
    where: { campaignId },
    select: { toEmail: true, status: true, scheduledAt: true, lastError: true },
  });
  throw new Error(`Timed out waiting for ${status}. Current rows: ${JSON.stringify(current)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
