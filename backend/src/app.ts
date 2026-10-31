import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config';
import { authRouter } from './routes/auth';
import { slackRouter } from './routes/slack';
import { senderRouter } from './routes/senders';
import { campaignRouter, emailRouter, maintenanceRouter } from './routes/emails';
import { healthRouter } from './routes/health';
import { bullBoardRouter } from './bullboard';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: env.frontendUrl,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      if (req.path.startsWith('/admin/queues')) return;
      // Keep request logs free of tokens. The cookie header is not printed.
      console.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`);
    });
    next();
  });

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/slack', slackRouter);
  app.use('/api/senders', senderRouter);
  app.use('/api/emails', emailRouter);
  app.use('/api/campaigns', campaignRouter);
  app.use('/api/maintenance', maintenanceRouter);
  app.use('/admin/queues', bullBoardRouter());

  app.use(errorHandler);
  return app;
}
