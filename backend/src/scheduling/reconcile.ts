import type { EmailStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { emailQueue, enqueueEmail } from '../lib/queue';
import { appRedis } from '../lib/redis';
import { logger } from '../logger';

const STALE_SENDING_MS = 2 * 60 * 1000;

// Postgres is the list of what should be sent. Redis is the timer.
// If Redis is emptied, this puts the unfinished rows back on the queue.
// It will not requeue a row that already has a provider message id.
export async function reconcileScheduledEmails(): Promise<number> {
  const lock = await appRedis.set('lock:reconcile-emails', '1', 'EX', 60, 'NX');
  if (lock !== 'OK') return 0;

  try {
    const staleBefore = new Date(Date.now() - STALE_SENDING_MS);
    await prisma.emailJob.updateMany({
      where: {
        status: 'sending',
        providerMessageId: null,
        updatedAt: { lt: staleBefore },
      },
      data: { status: 'scheduled' },
    });

    const pending = await prisma.emailJob.findMany({
      where: {
        providerMessageId: null,
        status: { in: ['scheduled', 'rescheduled', 'sending'] satisfies EmailStatus[] },
      },
      select: { id: true, scheduledAt: true },
    });

    let restored = 0;
    for (const email of pending) {
      const existing = await emailQueue.getJob(email.id);
      if (existing) continue;
      await enqueueEmail(email.id, email.scheduledAt.getTime());
      restored += 1;
    }

    if (restored > 0) {
      logger.info({ restored }, 'restored email jobs from postgres');
    }
    return restored;
  } finally {
    await appRedis.del('lock:reconcile-emails');
  }
}
