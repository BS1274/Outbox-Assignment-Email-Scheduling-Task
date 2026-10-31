import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { appRedis } from '../src/lib/redis';
import {
  nextHourStart,
  rateLimitKey,
  releaseSlot,
  reserveSendSlot,
  tryConsume,
} from '../src/lib/rateLimit';

const senderId = `test-sender-${Date.now()}`;

describe('redis rate limit', () => {
  after(async () => {
    const keys = await appRedis.keys(`rl:*${senderId}*`);
    const gap = await appRedis.keys(`send-gap:${senderId}`);
    const all = [...keys, ...gap];
    if (all.length) await appRedis.del(...all);
    await appRedis.quit();
  });

  it('stops at the hourly cap and frees a slot when a send fails', async () => {
    const now = Date.UTC(2026, 9, 30, 9, 15, 0);
    const key = rateLimitKey('sender', senderId, now);
    assert.equal(await tryConsume(appRedis, key, 2, now), true);
    assert.equal(await tryConsume(appRedis, key, 2, now), true);
    assert.equal(await tryConsume(appRedis, key, 2, now), false);
    await releaseSlot(appRedis, key);
    assert.equal(await tryConsume(appRedis, key, 2, now), true);
    assert.equal(nextHourStart(now), Date.UTC(2026, 9, 30, 10, 0, 0));
  });

  it('reserves send times at least one gap apart', async () => {
    const first = await reserveSendSlot(appRedis, senderId, 2000, 1_000_000);
    const second = await reserveSendSlot(appRedis, senderId, 2000, 1_000_000);
    assert.equal(second - first, 2000);
  });
});
