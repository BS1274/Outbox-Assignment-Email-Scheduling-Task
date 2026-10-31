import '../src/config';
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { closeElasticsearch, refreshEmailIndex, searchEmailIds } from '../src/lib/elasticsearch';
import { prisma } from '../src/lib/prisma';
import { emailQueue } from '../src/lib/queue';
import { disconnectRedis } from '../src/lib/redis';
import { scheduleCampaign } from '../src/services/scheduleService';

const stamp = Date.now();

describe('schedule campaign', () => {
  let userId = '';
  const jobIds: string[] = [];

  after(async () => {
    if (jobIds.length) {
      const jobs = await emailQueue.getJobs(['delayed', 'waiting', 'paused']);
      await Promise.all(jobs.filter((job) => job && jobIds.includes(job.id || '')).map((job) => job.remove()));
    }
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await closeElasticsearch();
    await emailQueue.close();
    disconnectRedis();
    await prisma.$disconnect();
  });

  it('stores rows, queues delayed jobs once, and replays an idempotency key', async () => {
    const user = await prisma.user.create({
      data: {
        googleSub: `schedule-test-${stamp}`,
        email: `schedule-test-${stamp}@example.com`,
        name: 'Schedule Test',
      },
    });
    userId = user.id;
    const sender = await prisma.sender.create({
      data: {
        userId,
        label: 'Test sender',
        fromName: 'Test',
        fromEmail: `sender-${stamp}@ethereal.email`,
        smtpHost: 'smtp.ethereal.email',
        smtpPort: 587,
        smtpUser: 'user',
        smtpPass: 'pass',
      },
    });

    const startAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const input = {
      subject: 'Hello from the scheduler',
      body: 'This is a queued message.',
      leadsText: 'one@example.com\ntwo@example.com',
      recipients: [],
      startAt,
      delayBetweenSeconds: 2,
      hourlyLimit: 10,
      senderId: sender.id,
      idempotencyKey: `idem-${stamp}`,
    };

    const first = await scheduleCampaign(userId, input);
    const second = await scheduleCampaign(userId, input);
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(first.campaignId, second.campaignId);

    const rows = await prisma.emailJob.findMany({ where: { campaignId: first.campaignId } });
    assert.equal(rows.length, 2);
    jobIds.push(...rows.map((row) => row.id));

    for (const row of rows) {
      const job = await emailQueue.getJob(row.id);
      assert.ok(job, `missing bull job for ${row.id}`);
      assert.equal(job.id, row.id);
    }

    if (await refreshEmailIndex()) {
      const ids = await searchEmailIds(userId, 'scheduler');
      assert.ok(ids?.includes(rows[0].id), 'elasticsearch should find the scheduled subject');
    }
  });
});
