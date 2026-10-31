import { Router } from 'express';
import { asyncRoute } from '../middleware/asyncRoute';
import { getUser, requireAuth } from '../middleware/requireAuth';
import { createSender, listSenders } from '../services/senderService';

export const senderRouter = Router();

senderRouter.use(requireAuth);

senderRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const senders = await listSenders(getUser(req).id);
    res.json({ senders });
  }),
);

senderRouter.post(
  '/',
  asyncRoute(async (req, res) => {
    const sender = await createSender(getUser(req).id);
    res.status(201).json({ sender });
  }),
);

senderRouter.post(
  '/ensure',
  asyncRoute(async (req, res) => {
    const { ensureSenders } = await import('../services/senderService');
    const senders = await ensureSenders(getUser(req).id);
    res.json({ senders });
  }),
);
