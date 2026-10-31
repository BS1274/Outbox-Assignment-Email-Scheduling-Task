import { prisma } from '../lib/prisma';
import { createEtherealMailbox } from '../lib/mailer';
import { env } from '../config';
import { HttpError } from '../errors';

const MAX_SENDERS = 5;

export async function listSenders(userId: string) {
  return prisma.sender.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, label: true, fromName: true, fromEmail: true, createdAt: true },
  });
}

export async function ensureSenders(userId: string) {
  const existing = await listSenders(userId);
  if (existing.length > 0) return existing;

  for (let index = 0; index < env.etherealAccountsPerUser; index += 1) {
    await createSender(userId, index + 1);
  }
  return listSenders(userId);
}

export async function createSender(userId: string, labelNumber?: number) {
  const count = await prisma.sender.count({ where: { userId } });
  if (count >= MAX_SENDERS) {
    throw new HttpError(400, `A user can have at most ${MAX_SENDERS} Ethereal senders.`);
  }
  let mailbox;
  try {
    mailbox = await createEtherealMailbox();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ethereal did not respond.';
    throw new HttpError(502, `Could not create an Ethereal mailbox: ${message}`);
  }
  const number = labelNumber ?? count + 1;
  return prisma.sender.create({
    data: {
      userId,
      label: `Sender ${number}`,
      fromName: `ReachInbox Sender ${number}`,
      fromEmail: mailbox.fromEmail,
      smtpHost: mailbox.smtpHost,
      smtpPort: mailbox.smtpPort,
      smtpUser: mailbox.smtpUser,
      smtpPass: mailbox.smtpPass,
    },
    select: { id: true, label: true, fromName: true, fromEmail: true, createdAt: true },
  });
}
