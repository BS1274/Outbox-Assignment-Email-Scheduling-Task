import { planSendSlots } from '../scheduling/planSlots';
import { HOUR_MS } from '../lib/rateLimit';

const start = Date.UTC(2026, 9, 30, 8, 0, 0);
const slots = planSendSlots({
  count: 1000,
  senderCount: 2,
  startAtMs: start,
  nowMs: start,
  delayBetweenMs: 2000,
  minDelayMs: 2000,
  hourlyLimitPerSender: 200,
});

const hours = new Set(slots.map((slot) => Math.floor(slot.sendAtMs / HOUR_MS)));
const last = Math.max(...slots.map((slot) => slot.sendAtMs));
console.log(
  JSON.stringify(
    {
      recipients: slots.length,
      senders: 2,
      hourlyLimitPerSender: 200,
      minGapMs: 2000,
      distinctHours: hours.size,
      firstSendAt: new Date(start).toISOString(),
      lastSendAt: new Date(last).toISOString(),
      spanHours: (last - start) / HOUR_MS,
    },
    null,
    2,
  ),
);
