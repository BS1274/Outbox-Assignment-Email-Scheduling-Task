import { prisma } from '../lib/prisma';
import { appRedis } from '../lib/redis';
import { hourBucket } from '../lib/rateLimit';
import { logger } from '../logger';

// One Slack message per sender per hour. The Redis SET NX is the lock that
// stops five parallel jobs from posting five identical alerts.
export async function notifySenderRateLimit(input: {
  userId: string;
  senderId: string;
  senderEmail: string;
  toEmail: string;
  subject: string;
  limit: number;
  retryAtMs: number;
}): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { slackWebhookUrl: true, slackChannel: true },
  });
  if (!user?.slackWebhookUrl) return;

  const dedupeKey = `slack-notified:${input.senderId}:${hourBucket(Date.now())}`;
  const first = await appRedis.set(dedupeKey, '1', 'EX', 2 * 60 * 60, 'NX');
  if (first !== 'OK') return;

  const waiting = await prisma.emailJob.count({
    where: {
      senderId: input.senderId,
      status: { in: ['scheduled', 'rescheduled', 'sending'] },
    },
  });

  const retry = new Date(input.retryAtMs).toISOString();
  const text = [
    `ReachInbox rate limit reached for ${input.senderEmail}.`,
    `Hourly cap: ${input.limit} emails. About ${waiting} job(s) are still waiting.`,
    `The send to ${input.toEmail} ("${input.subject}") was not dropped.`,
    `It was moved to ${retry}.`,
  ].join('\n');

  try {
    const response = await fetch(user.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      logger.error({ status: response.status }, 'slack webhook rejected the rate-limit notice');
    }
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'slack webhook failed');
  }
}
