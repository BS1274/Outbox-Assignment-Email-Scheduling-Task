import { Router } from 'express';
import type { EmailStatus } from '@prisma/client';
import { asyncRoute } from '../middleware/asyncRoute';
import { getUser, requireAuth } from '../middleware/requireAuth';
import { scheduleCampaign, scheduleSchema } from '../services/scheduleService';
import { emailSummary, getEmail, listEmails, type EmailBucket } from '../services/emailQueryService';
import { HttpError } from '../errors';
import { requireBoardAuth } from '../bullboard';
import { reconcileScheduledEmails } from '../scheduling/reconcile';

export const emailRouter = Router();

const BUCKETS = new Set<EmailBucket>(['all', 'scheduled', 'sent']);
const STATUSES = new Set<EmailStatus>(['scheduled', 'sending', 'rescheduled', 'sent', 'failed']);

emailRouter.use(requireAuth);

emailRouter.get(
  '/summary',
  asyncRoute(async (req, res) => {
    res.json(await emailSummary(getUser(req).id));
  }),
);

emailRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const bucketRaw = typeof req.query.bucket === 'string' ? req.query.bucket : 'all';
    if (!BUCKETS.has(bucketRaw as EmailBucket)) {
      throw new HttpError(400, 'bucket must be all, scheduled, or sent.');
    }
    const statusRaw = typeof req.query.status === 'string' ? req.query.status : '';
    if (statusRaw && !STATUSES.has(statusRaw as EmailStatus)) {
      throw new HttpError(400, 'Unknown status filter.');
    }
    const sort = req.query.sort === 'oldest' ? 'oldest' : 'newest';
    const result = await listEmails({
      userId: getUser(req).id,
      bucket: bucketRaw as EmailBucket,
      status: statusRaw ? (statusRaw as EmailStatus) : undefined,
      senderId: typeof req.query.senderId === 'string' ? req.query.senderId : undefined,
      query: typeof req.query.q === 'string' ? req.query.q : undefined,
      sort,
    });
    res.json(result);
  }),
);

emailRouter.get(
  '/:id',
  asyncRoute(async (req, res) => {
    const email = await getEmail(getUser(req).id, req.params.id);
    if (!email) throw new HttpError(404, 'Email not found.');
    res.json({ email });
  }),
);

export const campaignRouter = Router();
campaignRouter.use(requireAuth);
campaignRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const headerKey = req.get('Idempotency-Key');
    const input = scheduleSchema.parse({
      ...req.body,
      idempotencyKey: headerKey || req.body?.idempotencyKey,
    });
    const result = await scheduleCampaign(getUser(req).id, input);
    res.status(result.created ? 201 : 200).json(result);
  }),
);

export const maintenanceRouter = Router();
maintenanceRouter.post(
  '/reconcile',
  requireBoardAuth,
  asyncRoute(async (_req, res) => {
    const restored = await reconcileScheduledEmails();
    res.json({ restored });
  }),
);
