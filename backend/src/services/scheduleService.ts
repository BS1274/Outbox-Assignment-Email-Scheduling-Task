import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { enqueueEmail } from '../lib/queue';
import { indexEmails } from '../lib/elasticsearch';
import { env } from '../config';
import { HttpError } from '../errors';
import { extractEmails } from '../scheduling/extractEmails';
import { planSendSlots } from '../scheduling/planSlots';
import { ensureSenders } from './senderService';

export const scheduleSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required.').max(200),
  body: z.string().trim().min(1, 'Body is required.').max(20000),
  leadsText: z.string().max(2_000_000).optional().default(''),
  recipients: z.array(z.string()).max(5000).optional().default([]),
  startAt: z.string().min(1, 'Start time is required.'),
  delayBetweenSeconds: z.number().int().min(0).max(24 * 60 * 60),
  hourlyLimit: z.number().int().min(1).max(100_000),
  senderId: z.string().optional(),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

export type ScheduleInput = z.infer<typeof scheduleSchema>;

export async function scheduleCampaign(userId: string, input: ScheduleInput) {
  const startAtMs = Date.parse(input.startAt);
  if (Number.isNaN(startAtMs)) {
    throw new HttpError(400, 'Start time is not a valid date.');
  }

  const fromText = extractEmails(input.leadsText);
  const fromList = extractEmails(input.recipients.join('\n'));
  const recipients = extractEmails([...fromText, ...fromList].join('\n'));
  if (recipients.length === 0) {
    throw new HttpError(400, 'No email addresses were found in the lead list.');
  }
  if (recipients.length > 5000) {
    throw new HttpError(400, 'A single schedule can contain at most 5000 leads.');
  }

  if (input.idempotencyKey) {
    const existing = await prisma.campaign.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
      include: { emails: { select: { id: true, scheduledAt: true } } },
    });
    if (existing) {
      return summarize(existing, recipients.length, false, false);
    }
  }

  const senders = await ensureSenders(userId);
  const ordered = input.senderId
    ? [...senders.filter((sender) => sender.id === input.senderId), ...senders.filter((s) => s.id !== input.senderId)]
    : senders;
  if (input.senderId && ordered[0]?.id !== input.senderId) {
    throw new HttpError(400, 'That sender does not belong to this account.');
  }

  const hourlyLimit = Math.min(input.hourlyLimit, env.maxEmailsPerHourPerSender);
  const capped = hourlyLimit !== input.hourlyLimit;
  const delayBetweenMs = Math.max(input.delayBetweenSeconds * 1000, env.minSendDelayMs);
  const nowMs = Date.now();
  const slots = planSendSlots({
    count: recipients.length,
    senderCount: ordered.length,
    startAtMs,
    nowMs,
    delayBetweenMs,
    minDelayMs: env.minSendDelayMs,
    hourlyLimitPerSender: hourlyLimit,
  });

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        userId,
        idempotencyKey: input.idempotencyKey,
        subject: input.subject,
        body: input.body,
        startAt: new Date(startAtMs),
        delayBetweenMs,
        hourlyLimit,
      },
    });

    const rows = slots.map((slot) => {
      const sender = ordered[slot.senderIndex];
      return {
        userId,
        campaignId: campaign.id,
        senderId: sender.id,
        toEmail: recipients[slot.index],
        subject: input.subject,
        body: input.body,
        scheduledAt: new Date(slot.sendAtMs),
        idempotencyKey: `${campaign.id}:${recipients[slot.index]}`,
      };
    });

    const emails = await tx.emailJob.createManyAndReturn({ data: rows });
    return { campaign, emails };
  });
  } catch (error) {
    if (
      input.idempotencyKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await prisma.campaign.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
        include: { emails: { select: { id: true, scheduledAt: true } } },
      });
      if (existing) return summarize(existing, recipients.length, false, capped);
    }
    throw error;
  }

  for (const email of created.emails) {
    await enqueueEmail(email.id, email.scheduledAt.getTime());
  }

  const senderById = new Map(ordered.map((sender) => [sender.id, sender.fromEmail]));
  await indexEmails(
    created.emails.map((email) => ({
      ...email,
      senderEmail: senderById.get(email.senderId) || '',
    })),
  );

  return summarize(
    { ...created.campaign, emails: created.emails },
    recipients.length,
    true,
    capped,
  );
}

function summarize(
  campaign: {
    id: string;
    hourlyLimit: number;
    delayBetweenMs: number;
    emails: { id: string; scheduledAt: Date }[];
  },
  total: number,
  created: boolean,
  hourlyLimitCapped: boolean,
) {
  const times = campaign.emails.map((email) => email.scheduledAt.getTime());
  return {
    created,
    campaignId: campaign.id,
    total,
    hourlyLimit: campaign.hourlyLimit,
    hourlyLimitCapped,
    delayBetweenMs: campaign.delayBetweenMs,
    firstSendAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
    lastSendAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}
