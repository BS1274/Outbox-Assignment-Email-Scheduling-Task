import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'smtpPass',
      'slackWebhookUrl',
      'slackAccessToken',
      'access_token',
      'refresh_token',
    ],
    remove: true,
  },
});
