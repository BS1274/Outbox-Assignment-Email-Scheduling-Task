import jwt from 'jsonwebtoken';
import { env } from '../config';

const COOKIE = 'ri_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const sessionCookieName = COOKIE;

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: '7d' });
}

export function readSession(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (typeof payload === 'string' || typeof payload.sub !== 'string') return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(): {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.frontendUrl.startsWith('https://'),
    maxAge: MAX_AGE_MS,
    path: '/',
  };
}
