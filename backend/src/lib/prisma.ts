import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';

export const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'error' }],
});

prisma.$on('error', (event) => {
  logger.error({ message: event.message }, 'prisma');
});
