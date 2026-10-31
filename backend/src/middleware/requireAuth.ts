import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { readSession, sessionCookieName } from '../lib/jwt';
import { HttpError } from '../errors';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  slackConnected: boolean;
  slackTeamName: string | null;
  slackChannel: string | null;
};

export type AuthedRequest = Request & { user: SessionUser };

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const userId = readSession(req.cookies?.[sessionCookieName] as string | undefined);
  if (!userId) {
    next(new HttpError(401, 'Sign in with Google to continue.'));
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      slackWebhookUrl: true,
      slackTeamName: true,
      slackChannel: true,
    },
  });
  if (!user) {
    next(new HttpError(401, 'That session is no longer valid. Sign in again.'));
    return;
  }
  (req as AuthedRequest).user = {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    slackConnected: Boolean(user.slackWebhookUrl),
    slackTeamName: user.slackTeamName,
    slackChannel: user.slackChannel,
  };
  next();
}

export function getUser(req: Request): SessionUser {
  const user = (req as AuthedRequest).user;
  if (!user) throw new HttpError(401, 'Sign in with Google to continue.');
  return user;
}
