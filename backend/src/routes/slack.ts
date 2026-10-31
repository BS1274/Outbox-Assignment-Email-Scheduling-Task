import { Router } from 'express';
import { randomBytes } from 'crypto';
import { env, slackOAuthConfigured } from '../config';
import { prisma } from '../lib/prisma';
import { appRedis } from '../lib/redis';
import { asyncRoute } from '../middleware/asyncRoute';
import { getUser, requireAuth } from '../middleware/requireAuth';
import { HttpError } from '../errors';

export const slackRouter = Router();

function frontendRedirect(query: string): string {
  const url = new URL(env.frontendUrl);
  const extra = new URL(`/?${query}`, env.frontendUrl);
  extra.searchParams.forEach((value, key) => url.searchParams.set(key, value));
  return url.toString();
}

slackRouter.get(
  '/status',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = getUser(req);
    res.json({
      configured: slackOAuthConfigured,
      connected: user.slackConnected,
      teamName: user.slackTeamName,
      channel: user.slackChannel,
    });
  }),
);

slackRouter.get(
  '/connect',
  requireAuth,
  asyncRoute(async (req, res) => {
    if (!slackOAuthConfigured) {
      throw new HttpError(
        503,
        'Slack OAuth is not configured. Add SLACK_CLIENT_ID and SLACK_CLIENT_SECRET to .env.',
      );
    }
    const user = getUser(req);
    const state = randomBytes(24).toString('hex');
    await appRedis.set(`oauth:slack:${state}`, user.id, 'EX', 600);
    const url = new URL('https://slack.com/oauth/v2/authorize');
    url.searchParams.set('client_id', env.slackClientId);
    url.searchParams.set('scope', 'incoming-webhook');
    url.searchParams.set('redirect_uri', env.slackCallbackUrl);
    url.searchParams.set('state', state);
    res.redirect(url.toString());
  }),
);

slackRouter.get(
  '/callback',
  asyncRoute(async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (req.query.error) {
      res.redirect(frontendRedirect('slack=cancelled'));
      return;
    }
    const userId = state ? await appRedis.getdel(`oauth:slack:${state}`) : null;
    if (!code || !userId) {
      res.redirect(frontendRedirect('slack=error'));
      return;
    }

    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.slackClientId,
        client_secret: env.slackClientSecret,
        redirect_uri: env.slackCallbackUrl,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await tokenResponse.json()) as {
      ok?: boolean;
      access_token?: string;
      team?: { id?: string; name?: string };
      incoming_webhook?: { url?: string; channel?: string };
      error?: string;
    };
    if (!body.ok || !body.incoming_webhook?.url) {
      res.redirect(frontendRedirect('slack=error'));
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        slackAccessToken: body.access_token || null,
        slackTeamId: body.team?.id || null,
        slackTeamName: body.team?.name || null,
        slackWebhookUrl: body.incoming_webhook.url,
        slackChannel: body.incoming_webhook.channel || null,
        slackConnectedAt: new Date(),
      },
    });
    res.redirect(frontendRedirect('slack=connected'));
  }),
);

slackRouter.post(
  '/disconnect',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = getUser(req);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        slackAccessToken: null,
        slackTeamId: null,
        slackTeamName: null,
        slackWebhookUrl: null,
        slackChannel: null,
        slackConnectedAt: null,
      },
    });
    res.json({ connected: false });
  }),
);
