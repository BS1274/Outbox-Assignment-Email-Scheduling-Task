import { HOUR_MS } from '../lib/rateLimit';

export type SendSlot = {
  index: number;
  senderIndex: number;
  sendAtMs: number;
};

export type PlanInput = {
  count: number;
  senderCount: number;
  startAtMs: number;
  nowMs: number;
  delayBetweenMs: number;
  minDelayMs: number;
  hourlyLimitPerSender: number;
};

// Build the send times before anything is queued.
// Senders are used round-robin. Each sender keeps a gap between its own
// messages and cannot take more than hourlyLimitPerSender in one clock hour.
// When the hour is full, that sender's next message moves to the next hour.
// Nothing is dropped.
export function planSendSlots(input: PlanInput): SendSlot[] {
  if (input.senderCount < 1) {
    throw new Error('At least one sender is required.');
  }
  if (input.hourlyLimitPerSender < 1) {
    throw new Error('Hourly limit must be at least 1.');
  }
  if (input.count < 0) {
    throw new Error('Recipient count cannot be negative.');
  }

  const gap = Math.max(input.delayBetweenMs, input.minDelayMs, 0);
  const start = Math.max(input.startAtMs, input.nowMs);
  const nextAt = Array.from({ length: input.senderCount }, () => start);
  const usedInHour = Array.from({ length: input.senderCount }, () => new Map<number, number>());
  const slots: SendSlot[] = [];

  for (let index = 0; index < input.count; index += 1) {
    const senderIndex = index % input.senderCount;
    let sendAt = nextAt[senderIndex];

    for (;;) {
      const hour = Math.floor(sendAt / HOUR_MS);
      const used = usedInHour[senderIndex].get(hour) ?? 0;
      if (used < input.hourlyLimitPerSender) {
        usedInHour[senderIndex].set(hour, used + 1);
        slots.push({ index, senderIndex, sendAtMs: sendAt });
        nextAt[senderIndex] = sendAt + gap;
        break;
      }
      sendAt = (hour + 1) * HOUR_MS;
    }
  }

  return slots;
}
