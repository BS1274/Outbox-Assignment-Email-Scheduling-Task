import path from 'path';
import dotenv from 'dotenv';

// Load the repo-root .env first, then a backend-local file if one exists.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer. Received "${raw}".`);
  }
  return parsed;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL'),
  elasticsearchUrl: process.env.ELASTICSEARCH_URL?.trim() || '',
  port: integer('PORT', 4000),
  frontendUrl: process.env.FRONTEND_URL?.trim() || 'http://localhost:5173',
  appUrl: process.env.APP_URL?.trim() || 'http://localhost:4000',
  jwtSecret: required('JWT_SECRET'),
  workerConcurrency: Math.max(1, integer('WORKER_CONCURRENCY', 5)),
  minSendDelayMs: Math.max(0, integer('MIN_SEND_DELAY_MS', 2000)),
  maxEmailsPerHourPerSender: Math.max(1, integer('MAX_EMAILS_PER_HOUR_PER_SENDER', 200)),
  etherealAccountsPerUser: Math.min(5, Math.max(1, integer('ETHEREAL_ACCOUNTS_PER_USER', 2))),
  emailMaxAttempts: Math.max(1, integer('EMAIL_MAX_ATTEMPTS', 5)),
  bullBoardUser: process.env.BULL_BOARD_USER?.trim() || '',
  bullBoardPassword: process.env.BULL_BOARD_PASSWORD?.trim() || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || '',
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL?.trim() || 'http://localhost:4000/api/auth/google/callback',
  slackClientId: process.env.SLACK_CLIENT_ID?.trim() || '',
  slackClientSecret: process.env.SLACK_CLIENT_SECRET?.trim() || '',
  slackCallbackUrl:
    process.env.SLACK_CALLBACK_URL?.trim() || 'http://localhost:4000/api/slack/callback',
};

export const googleOAuthConfigured = Boolean(env.googleClientId && env.googleClientSecret);
export const slackOAuthConfigured = Boolean(env.slackClientId && env.slackClientSecret);
export const bullBoardConfigured = Boolean(env.bullBoardUser && env.bullBoardPassword);
