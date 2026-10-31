import { Queue } from 'bullmq';
import { env } from '../config';
import { createRedis } from './redis';

export const EMAIL_QUEUE_NAME = 'email-send';

export type SendJobData = {
  emailId: string;
  // The minute we reserved for the minimum gap between sends.
  reservedStart?: number;
};

export const queueRedis = createRedis('queue');

export const emailQueue = new Queue<SendJobData>(EMAIL_QUEUE_NAME, {
  connection: queueRedis,
  defaultJobOptions: {
    attempts: env.emailMaxAttempts,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 7 * 24 * 3600, count: 10000 },
    removeOnFail: { age: 14 * 24 * 3600 },
  },
});

export async function enqueueEmail(emailId: string, scheduledAtMs: number): Promise<void> {
  const delay = Math.max(0, scheduledAtMs - Date.now());
  try {
    await emailQueue.add(
      'send-email',
      { emailId },
      {
        jobId: emailId,
        delay,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The job id is the email id, so a second add is a no-op, not a second send.
    if (!/already exists/i.test(message)) throw error;
  }
}
