import type { EmailStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { emailQueue } from '../lib/queue';
import { searchEmailIds } from '../lib/elasticsearch';

const SCHEDULED_STATUSES: EmailStatus[] = ['scheduled', 'sending', 'rescheduled'];
const SENT_STATUSES: EmailStatus[] = ['sent', 'failed'];

const emailSelect = {
  id: true,
  toEmail: true,
  subject: true,
  body: true,
  status: true,
  scheduledAt: true,
  sentAt: true,
  attempts: true,
  lastError: true,
  previewUrl: true,
  sender: { select: { id: true, label: true, fromEmail: true, fromName: true } },
} satisfies Prisma.EmailJobSelect;

export type EmailBucket = 'all' | 'scheduled' | 'sent';

export async function listEmails(input: {
  userId: string;
  bucket: EmailBucket;
  status?: EmailStatus;
  senderId?: string;
  query?: string;
  sort: 'newest' | 'oldest';
}) {
  const where: Prisma.EmailJobWhereInput = { userId: input.userId };
  if (input.senderId) where.senderId = input.senderId;
  if (input.status) where.status = input.status;
  else if (input.bucket === 'scheduled') where.status = { in: SCHEDULED_STATUSES };
  else if (input.bucket === 'sent') where.status = { in: SENT_STATUSES };

  let engine: 'postgres' | 'elasticsearch' = 'postgres';
  const query = input.query?.trim();
  if (query) {
    const ids = await searchEmailIds(input.userId, query);
    if (ids && ids.length >= 0 && ids !== null) {
      engine = 'elasticsearch';
      where.id = { in: ids };
    } else {
      where.OR = [
        { toEmail: { contains: query, mode: 'insensitive' } },
        { subject: { contains: query, mode: 'insensitive' } },
        { body: { contains: query, mode: 'insensitive' } },
      ];
    }
  }

  const emails = await prisma.emailJob.findMany({
    where,
    select: emailSelect,
    orderBy: { scheduledAt: input.sort === 'oldest' ? 'asc' : 'desc' },
    take: 200,
  });

  return { emails, engine };
}

export async function emailSummary(userId: string) {
  const [all, scheduled, sent, counts] = await Promise.all([
    prisma.emailJob.count({ where: { userId } }),
    prisma.emailJob.count({ where: { userId, status: { in: SCHEDULED_STATUSES } } }),
    prisma.emailJob.count({ where: { userId, status: { in: SENT_STATUSES } } }),
    emailQueue.getJobCounts('waiting', 'delayed', 'active', 'failed', 'completed'),
  ]);

  return {
    counts: { all, scheduled, sent },
    queue: {
      waiting: counts.waiting ?? 0,
      delayed: counts.delayed ?? 0,
      active: counts.active ?? 0,
      failed: counts.failed ?? 0,
      completed: counts.completed ?? 0,
    },
  };
}

export async function getEmail(userId: string, emailId: string) {
  return prisma.emailJob.findFirst({
    where: { id: emailId, userId },
    select: emailSelect,
  });
}
