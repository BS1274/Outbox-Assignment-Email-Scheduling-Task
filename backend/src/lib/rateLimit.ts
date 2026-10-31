import type IORedis from 'ioredis';

export const HOUR_MS = 60 * 60 * 1000;

// The counter key includes the sender and the hour, so every worker process
// shares one number. INCR inside Redis is atomic: two workers cannot both
// read 199 and both send a 201st email.
const CONSUME_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
if current >= limit then
  return -1
end
local n = redis.call('INCR', KEYS[1])
if redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ttl)
end
if n > limit then
  redis.call('DECR', KEYS[1])
  return -1
end
return n
`;

const RELEASE_LUA = `
local n = tonumber(redis.call('GET', KEYS[1]) or '0')
if n > 0 then
  return redis.call('DECR', KEYS[1])
end
return 0
`;

// Reserve the next legal start time for this sender. The write happens in the
// same Redis command as the read, so parallel workers queue up instead of
// sending at the same instant.
const RESERVE_SLOT_LUA = `
local now = tonumber(ARGV[1])
local gap = tonumber(ARGV[2])
local nextAllowed = tonumber(redis.call('GET', KEYS[1]) or '0')
local startAt = now
if nextAllowed > now then
  startAt = nextAllowed
end
redis.call('SET', KEYS[1], tostring(startAt + gap))
redis.call('PEXPIRE', KEYS[1], tostring(math.max(gap * 20, 120000)))
return tostring(startAt)
`;

export function hourBucket(nowMs: number): number {
  return Math.floor(nowMs / HOUR_MS);
}

export function nextHourStart(nowMs: number): number {
  return (hourBucket(nowMs) + 1) * HOUR_MS;
}

export function rateLimitKey(kind: 'sender' | 'campaign', id: string, nowMs: number): string {
  return `rl:${kind}:${id}:${hourBucket(nowMs)}`;
}

function ttlUntilHourEnds(nowMs: number): number {
  return nextHourStart(nowMs) - nowMs + 120_000;
}

export async function tryConsume(
  redis: IORedis,
  key: string,
  limit: number,
  nowMs: number,
): Promise<boolean> {
  const result = await redis.eval(CONSUME_LUA, 1, key, String(limit), String(ttlUntilHourEnds(nowMs)));
  return Number(result) >= 0;
}

export async function releaseSlot(redis: IORedis, key: string): Promise<void> {
  await redis.eval(RELEASE_LUA, 1, key);
}

export async function reserveSendSlot(
  redis: IORedis,
  senderId: string,
  gapMs: number,
  nowMs: number,
): Promise<number> {
  const key = `send-gap:${senderId}`;
  const result = await redis.eval(RESERVE_SLOT_LUA, 1, key, String(nowMs), String(gapMs));
  return Number(result);
}

// Jobs that miss the cap are spaced a few seconds apart inside the next hour
// so they keep their order instead of waking up as one stampede.
export async function nextDeferredStart(
  redis: IORedis,
  senderId: string,
  campaignId: string,
  nowMs: number,
  gapMs: number,
): Promise<number> {
  const hour = hourBucket(nextHourStart(nowMs));
  const key = `defer-seq:${senderId}:${campaignId}:${hour}`;
  const seq = await redis.incr(key);
  if (seq === 1) {
    await redis.pexpire(key, 2 * HOUR_MS);
  }
  return nextHourStart(nowMs) + (seq - 1) * Math.max(gapMs, 0);
}
