import '../config';
import { prisma } from '../lib/prisma';
import { appRedis } from '../lib/redis';
import { refreshEmailIndex } from '../lib/elasticsearch';

async function cleanup() {
  console.log('--- POST-TESTING SAFE CLEANUP ---');
  
  // 1. Delete test users (keep bhavdeepsolanki16@gmail.com)
  const deletedUsers = await prisma.user.deleteMany({
    where: {
      email: {
        not: 'bhavdeepsolanki16@gmail.com'
      }
    }
  });
  console.log(`Cleaned temporary test users: ${deletedUsers.count}`);

  // 2. Delete test campaigns created during QA
  const deletedCampaigns = await prisma.campaign.deleteMany({
    where: {
      OR: [
        { subject: { contains: 'QA' } },
        { subject: { contains: 'Test' } },
        { subject: { contains: 'Demo' } },
        { subject: { contains: 'Smoke' } },
        { subject: { contains: 'Orphan' } },
        { subject: { contains: 'Reconcile' } }
      ]
    }
  });
  console.log(`Cleaned temporary test campaigns: ${deletedCampaigns.count}`);

  // 3. Clear transient rate-limit testing keys from Redis
  const keys = await appRedis.keys('rl:*test*');
  const deferKeys = await appRedis.keys('defer-seq:*test*');
  const slackKeys = await appRedis.keys('slack-notified:*');
  const allTestKeys = [...keys, ...deferKeys, ...slackKeys];
  if (allTestKeys.length) {
    await appRedis.del(...allTestKeys);
    console.log(`Cleared transient Redis keys: ${allTestKeys.length}`);
  }

  // 4. Refresh Elasticsearch index
  await refreshEmailIndex();

  // 5. Verify remaining data
  const users = await prisma.user.findMany({ select: { email: true, name: true } });
  console.log('Remaining User in PostgreSQL:', users);

  await prisma.$disconnect();
  console.log('Safe cleanup complete.');
}

cleanup().catch(console.error);
