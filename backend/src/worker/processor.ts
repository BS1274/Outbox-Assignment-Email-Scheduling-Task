import { DelayedError, type Job } from 'bullmq';
import { env } from '../config';
import { prisma } from '../lib/prisma';
import { appRedis } from '../lib/redis';
import type { SendJobData } from '../lib/queue';
import {
  nextDeferredStart,
  rateLimitKey,
  releaseSlot,
  reserveSendSlot,
  tryConsume,
} from '../lib/rateLimit';
import { indexEmails } from '../lib/elasticsearch';
import { sendWithSender, toHtml, toPlainText } from '../lib/mailer';
import { notifySenderRateLimit } from '../services/slackNotify';
import { logger } from '../logger';

const SKEW_MS = 250;

async function pushToLater(job: Job<SendJobData>, token: string, whenMs: number): Promise<never> {
  await job.updateData({ emailId: job.data.emailId });
  await job.moveToDelayed(whenMs, token);
  // DelayedError tells BullMQ this is a planned delay, not a failed attempt.
  throw new DelayedError();
}

export async function processSendJob(job: Job<SendJobData>, token: string): Promise<void> {
  const email = await prisma.emailJob.findUnique({
    where: { id: job.data.emailId },
    include: { sender: true, campaign: true },
  });
  if (!email) return;
  if (email.status === 'sent' || email.providerMessageId) return;

  const now = Date.now();
  if (email.scheduledAt.getTime() > now + SKEW_MS) {
    await pushToLater(job, token, email.scheduledAt.getTime());
  }

  const gap = Math.max(env.minSendDelayMs, email.campaign.delayBetweenMs);
  let reserved = job.data.reservedStart;
  if (reserved == null || now > reserved + gap) {
    reserved = await reserveSendSlot(appRedis, email.senderId, env.minSendDelayMs, now);
    await job.updateData({ emailId: email.id, reservedStart: reserved });
  }
  if (reserved > now + SKEW_MS) {
    await job.moveToDelayed(reserved, token);
    throw new DelayedError();
  }

  const senderKey = rateLimitKey('sender', email.senderId, now);
  const campaignKey = rateLimitKey('campaign', email.campaignId, now);
  const senderAllowed = await tryConsume(
    appRedis,
    senderKey,
    env.maxEmailsPerHourPerSender,
    now,
  );
  if (!senderAllowed) {
    const retryAtMs = await nextDeferredStart(
      appRedis,
      email.senderId,
      email.campaignId,
      now,
      env.minSendDelayMs,
    );
    await prisma.emailJob.update({
      where: { id: email.id },
      data: { status: 'rescheduled', scheduledAt: new Date(retryAtMs) },
    });
    await indexEmails([{ ...email, status: 'rescheduled', scheduledAt: new Date(retryAtMs) }]);
    await notifySenderRateLimit({
      userId: email.userId,
      senderId: email.senderId,
      senderEmail: email.sender.fromEmail,
      toEmail: email.toEmail,
      subject: email.subject,
      limit: env.maxEmailsPerHourPerSender,
      retryAtMs,
    });
    await pushToLater(job, token, retryAtMs);
  }

  const campaignAllowed = await tryConsume(appRedis, campaignKey, email.campaign.hourlyLimit, now);
  if (!campaignAllowed) {
    await releaseSlot(appRedis, senderKey);
    const retryAtMs = await nextDeferredStart(
      appRedis,
      email.senderId,
      email.campaignId,
      now,
      env.minSendDelayMs,
    );
    await prisma.emailJob.update({
      where: { id: email.id },
      data: { status: 'rescheduled', scheduledAt: new Date(retryAtMs) },
    });
    await indexEmails([{ ...email, status: 'rescheduled', scheduledAt: new Date(retryAtMs) }]);
    await pushToLater(job, token, retryAtMs);
  }

  const claimed = await prisma.emailJob.updateMany({
    where: {
      id: email.id,
      providerMessageId: null,
      status: { in: ['scheduled', 'rescheduled', 'sending'] },
    },
    data: { status: 'sending', attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    await releaseSlot(appRedis, senderKey);
    await releaseSlot(appRedis, campaignKey);
    return;
  }

  try {
    const sent = await sendWithSender(email.sender, {
      to: email.toEmail,
      subject: email.subject,
      text: toPlainText(email.body),
      html: toHtml(email.body),
    });
    const updated = await prisma.emailJob.update({
      where: { id: email.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        providerMessageId: sent.messageId,
        previewUrl: sent.previewUrl,
        lastError: null,
      },
    });
    await indexEmails([updated]);
    logger.info({ emailId: email.id, to: email.toEmail }, 'email sent');
  } catch (error) {
    await releaseSlot(appRedis, senderKey);
    await releaseSlot(appRedis, campaignKey);
    const message = error instanceof Error ? error.message : 'SMTP send failed.';
    const maxAttempts = job.opts.attempts ?? env.emailMaxAttempts;
    const isLast = job.attemptsMade >= maxAttempts;
    const updated = await prisma.emailJob.update({
      where: { id: email.id },
      data: {
        status: isLast ? 'failed' : 'scheduled',
        lastError: message.slice(0, 500),
      },
    });
    await indexEmails([updated]);
    throw error;
  }
}
