import { Router } from 'express';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { googleOAuthConfigured, env } from '../config';
import { prisma } from '../lib/prisma';
import { appRedis } from '../lib/redis';
import { sessionCookieName, sessionCookieOptions, signSession } from '../lib/jwt';
import { asyncRoute } from '../middleware/asyncRoute';
import { requireAuth, getUser } from '../middleware/requireAuth';
import { HttpError } from '../errors';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').max(200),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .max(128)
    .regex(/[A-Za-z]/, 'Password must contain at least one letter.')
    .regex(/[0-9]/, 'Password must contain at least one number.'),
  name: z.string().trim().max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

function frontendRedirect(path: string): string {
  const url = new URL(env.frontendUrl);
  const extra = new URL(path, env.frontendUrl);
  extra.searchParams.forEach((value, key) => url.searchParams.set(key, value));
  return url.toString();
}

authRouter.get('/config', (_req, res) => {
  res.json({
    google: googleOAuthConfigured,
    googleConfigured: googleOAuthConfigured,
    slack: Boolean(env.slackClientId && env.slackClientSecret),
  });
});

// Email and Password Registration
authRouter.post(
  '/register',
  asyncRoute(async (req, res) => {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new HttpError(400, parseResult.error.errors[0]?.message || 'Invalid input.');
    }
    const { email, password, name } = parseResult.data;
    const normalizedEmail = email.toLowerCase();

    // Check duplicate
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      if (existing.passwordHash) {
        throw new HttpError(409, 'An account with this email address already exists. Please sign in.');
      }
      // User registered with Google earlier and is now setting a password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      const user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          name: name?.trim() || existing.name,
        },
      });
      res.cookie(sessionCookieName, signSession(user.id), sessionCookieOptions());
      return res.status(200).json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          slackConnected: Boolean(user.slackWebhookUrl || user.slackAccessToken),
          slackTeamName: user.slackTeamName,
          slackChannel: user.slackChannel,
        },
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const displayName = name?.trim() || normalizedEmail.split('@')[0];

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: displayName,
      },
    });

    res.cookie(sessionCookieName, signSession(user.id), sessionCookieOptions());
    res.status(201).json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        slackConnected: Boolean(user.slackWebhookUrl || user.slackAccessToken),
        slackTeamName: user.slackTeamName,
        slackChannel: user.slackChannel,
      },
    });
  }),
);

// Email and Password Login
authRouter.post(
  '/login',
  asyncRoute(async (req, res) => {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new HttpError(400, parseResult.error.errors[0]?.message || 'Invalid email or password format.');
    }
    const { email, password } = parseResult.data;
    const normalizedEmail = email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new HttpError(401, 'Invalid email or password.');
    }

    if (!user.passwordHash) {
      // User registered with Google and has no password set yet
      throw new HttpError(400, 'This account was registered with Google. Please use Continue with Google, or click Sign Up to add a password.');
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new HttpError(401, 'Invalid email or password.');
    }

    res.cookie(sessionCookieName, signSession(user.id), sessionCookieOptions());
    res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        slackConnected: Boolean(user.slackWebhookUrl || user.slackAccessToken),
        slackTeamName: user.slackTeamName,
        slackChannel: user.slackChannel,
      },
    });
  }),
);

authRouter.get(
  '/google',
  asyncRoute(async (_req, res) => {
    if (!googleOAuthConfigured) {
      throw new HttpError(
        503,
        'Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.',
      );
    }
    const state = randomBytes(24).toString('hex');
    await appRedis.set(`oauth:google:${state}`, '1', 'EX', 600);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.googleClientId);
    url.searchParams.set('redirect_uri', env.googleCallbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');
    res.redirect(url.toString());
  }),
);

authRouter.get(
  '/google/callback',
  asyncRoute(async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const denied = typeof req.query.error === 'string' ? req.query.error : '';
    if (denied) {
      res.redirect(frontendRedirect(`/?auth_error=${encodeURIComponent('Google sign-in was cancelled.')}`));
      return;
    }
    const stateOk = state ? await appRedis.getdel(`oauth:google:${state}`) : null;
    if (!code || stateOk !== '1') {
      res.redirect(frontendRedirect('/?auth_error=Google%20sign-in%20could%20not%20be%20verified.'));
      return;
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: env.googleCallbackUrl,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(15000),
    });
    const tokenBody = (await tokenResponse.json()) as { access_token?: string; error?: string };
    if (!tokenResponse.ok || !tokenBody.access_token) {
      res.redirect(frontendRedirect('/?auth_error=Google%20did%20not%20return%20an%20access%20token.'));
      return;
    }

    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
      signal: AbortSignal.timeout(15000),
    });
    const profile = (await profileResponse.json()) as {
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
    };
    if (!profile.sub || !profile.email) {
      res.redirect(frontendRedirect('/?auth_error=Google%20did%20not%20share%20an%20email%20address.'));
      return;
    }

    // Check if user already exists with this email or googleSub
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ googleSub: profile.sub }, { email: profile.email.toLowerCase() }],
      },
    });

    let user;
    if (existingUser) {
      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          googleSub: profile.sub,
          email: profile.email.toLowerCase(),
          name: existingUser.name || profile.name || profile.email,
          avatarUrl: profile.picture || existingUser.avatarUrl,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          googleSub: profile.sub,
          email: profile.email.toLowerCase(),
          name: profile.name || profile.email,
          avatarUrl: profile.picture || null,
        },
      });
    }

    res.cookie(sessionCookieName, signSession(user.id), sessionCookieOptions());
    res.redirect(frontendRedirect('/'));
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    res.json({ user: getUser(req) });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(sessionCookieName, { path: '/' });
  res.json({ ok: true });
});
