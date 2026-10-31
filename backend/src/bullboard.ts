import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { bullBoardConfigured, env } from './config';
import { emailQueue } from './lib/queue';

function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function requireBoardAuth(req: Request, res: Response, next: NextFunction) {
  if (!bullBoardConfigured) {
    res.status(503).json({ error: 'Set BULL_BOARD_USER and BULL_BOARD_PASSWORD in .env.' });
    return;
  }
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    if (sameSecret(user, env.bullBoardUser) && sameSecret(password, env.bullBoardPassword)) {
      next();
      return;
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="BullMQ"');
  res.status(401).send('Sign in to view the queue.');
}

export function bullBoardRouter(): Router {
  const adapter = new ExpressAdapter();
  adapter.setBasePath('/admin/queues');
  createBullBoard({
    queues: [new BullMQAdapter(emailQueue)],
    serverAdapter: adapter,
  });
  const router = Router();
  router.use(requireBoardAuth);
  router.use(adapter.getRouter());
  return router;
}
