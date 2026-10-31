import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planSendSlots } from '../src/scheduling/planSlots';
import { HOUR_MS } from '../src/lib/rateLimit';

const start = Date.UTC(2026, 9, 30, 8, 0, 0);

describe('planSendSlots', () => {
  it('spaces one sender and rolls into the next hour when the cap is full', () => {
    const slots = planSendSlots({
      count: 5,
      senderCount: 1,
      startAtMs: start,
      nowMs: start,
      delayBetweenMs: 2000,
      minDelayMs: 2000,
      hourlyLimitPerSender: 3,
    });

    assert.equal(slots.length, 5);
    assert.deepEqual(
      slots.map((slot) => slot.sendAtMs),
      [start, start + 2000, start + 4000, start + HOUR_MS, start + HOUR_MS + 2000],
    );
  });

  it('keeps 1000 emails inside the per-sender hourly cap and preserves sender order', () => {
    const slots = planSendSlots({
      count: 1000,
      senderCount: 2,
      startAtMs: start,
      nowMs: start - 60_000,
      delayBetweenMs: 2000,
      minDelayMs: 2000,
      hourlyLimitPerSender: 200,
    });

    assert.equal(slots.length, 1000);
    const perSenderHour = new Map<string, number>();
    const previous = new Map<number, number>();

    for (const slot of slots) {
      const hour = Math.floor(slot.sendAtMs / HOUR_MS);
      const key = `${slot.senderIndex}:${hour}`;
      perSenderHour.set(key, (perSenderHour.get(key) ?? 0) + 1);
      const last = previous.get(slot.senderIndex);
      if (last != null) assert.ok(slot.sendAtMs >= last + 2000);
      previous.set(slot.senderIndex, slot.sendAtMs);
      assert.ok(slot.sendAtMs >= start);
    }

    for (const count of perSenderHour.values()) {
      assert.ok(count <= 200);
    }

    // 500 emails each, 200 per hour => sender 0's last mail is in the third hour.
    const sender0 = slots.filter((slot) => slot.senderIndex === 0);
    assert.equal(sender0.length, 500);
    assert.equal(Math.floor(sender0[499].sendAtMs / HOUR_MS), Math.floor(start / HOUR_MS) + 2);
  });

  it('does not start in the past', () => {
    const slots = planSendSlots({
      count: 1,
      senderCount: 1,
      startAtMs: start - HOUR_MS,
      nowMs: start,
      delayBetweenMs: 0,
      minDelayMs: 0,
      hourlyLimitPerSender: 10,
    });
    assert.equal(slots[0].sendAtMs, start);
  });
});
