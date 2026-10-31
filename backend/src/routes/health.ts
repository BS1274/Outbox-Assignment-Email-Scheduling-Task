import { Router } from 'express';
import { appRedis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { elasticsearchEnabled, pingElasticsearch } from '../lib/elasticsearch';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const checks: Record<string, string> = {
    postgres: 'down',
    redis: 'down',
    elasticsearch: elasticsearchEnabled() ? 'down' : 'not-configured',
  };
  if (elasticsearchEnabled()) {
    checks.elasticsearch = (await pingElasticsearch()) ? 'up' : 'down';
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = 'up';
  } catch {
    checks.postgres = 'down';
  }
  try {
    const pong = await appRedis.ping();
    checks.redis = pong === 'PONG' ? 'up' : 'down';
  } catch {
    checks.redis = 'down';
  }
  const ok = checks.postgres === 'up' && checks.redis === 'up';
  res.status(ok ? 200 : 503).json({ ok, checks });
});
