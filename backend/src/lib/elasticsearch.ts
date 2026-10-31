import { Client } from '@elastic/elasticsearch';
import type { EmailJob, Sender } from '@prisma/client';
import { env } from '../config';
import { logger } from '../logger';

export const EMAIL_INDEX = 'reachinbox-emails';

let client: Client | null = null;

export function elasticsearchEnabled(): boolean {
  return Boolean(env.elasticsearchUrl);
}

function getClient(): Client {
  if (!client) {
    client = new Client({
      node: env.elasticsearchUrl,
      maxRetries: 1,
      requestTimeout: 2000,
      pingTimeout: 1000,
    });
  }
  return client;
}

export async function pingElasticsearch(): Promise<boolean> {
  if (!elasticsearchEnabled()) return false;
  try {
    await getClient().ping();
    return true;
  } catch {
    return false;
  }
}

export async function refreshEmailIndex(): Promise<boolean> {
  if (!elasticsearchEnabled()) return false;
  try {
    await ensureEmailIndex();
    await getClient().indices.refresh({ index: EMAIL_INDEX });
    return true;
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'elasticsearch refresh failed');
    return false;
  }
}

export async function closeElasticsearch(): Promise<void> {
  if (!client) return;
  await client.close();
  client = null;
}

export async function ensureEmailIndex(): Promise<void> {
  if (!elasticsearchEnabled()) return;
  const es = getClient();
  const exists = await es.indices.exists({ index: EMAIL_INDEX });
  if (exists) return;
  await es.indices.create({
    index: EMAIL_INDEX,
    mappings: {
      properties: {
        userId: { type: 'keyword' },
        emailId: { type: 'keyword' },
        toEmail: { type: 'text', fields: { raw: { type: 'keyword' } } },
        subject: { type: 'text' },
        body: { type: 'text' },
        status: { type: 'keyword' },
        senderEmail: { type: 'keyword' },
        scheduledAt: { type: 'date' },
        sentAt: { type: 'date' },
      },
    },
  });
}

export type IndexableEmail = Pick<
  EmailJob,
  'id' | 'userId' | 'toEmail' | 'subject' | 'body' | 'status' | 'scheduledAt' | 'sentAt'
> & { sender?: Pick<Sender, 'fromEmail'> | null; senderEmail?: string };

function toDocument(email: IndexableEmail) {
  return {
    userId: email.userId,
    emailId: email.id,
    toEmail: email.toEmail,
    subject: email.subject,
    body: email.body,
    status: email.status,
    senderEmail: email.senderEmail || email.sender?.fromEmail || '',
    scheduledAt: email.scheduledAt.toISOString(),
    sentAt: email.sentAt ? email.sentAt.toISOString() : null,
  };
}

export async function indexEmails(emails: IndexableEmail[]): Promise<void> {
  if (!elasticsearchEnabled() || emails.length === 0) return;
  try {
    await ensureEmailIndex();
    const operations = emails.flatMap((email) => [
      { index: { _index: EMAIL_INDEX, _id: email.id } },
      toDocument(email),
    ]);
    const result = await getClient().bulk({ operations, refresh: false });
    if (result.errors) {
      logger.error('elasticsearch bulk index reported item errors');
    }
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'elasticsearch index failed');
  }
}

export async function searchEmailIds(userId: string, query: string): Promise<string[] | null> {
  if (!elasticsearchEnabled()) return null;
  try {
    await ensureEmailIndex();
    const result = await getClient().search({
      index: EMAIL_INDEX,
      size: 100,
      query: {
        bool: {
          filter: [{ term: { userId } }],
          must: [
            {
              multi_match: {
                query,
                fields: ['toEmail^2', 'subject^2', 'body', 'senderEmail'],
                fuzziness: 'AUTO',
              },
            },
          ],
        },
      },
    });
    return result.hits.hits.map((hit) => hit._id).filter((id): id is string => Boolean(id));
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'elasticsearch search failed');
    return null;
  }
}
