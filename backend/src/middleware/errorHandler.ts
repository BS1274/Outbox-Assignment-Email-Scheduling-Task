import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../errors';
import { logger } from '../logger';

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: error.issues[0]?.message || 'Check the form and try again.',
    });
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  logger.error(
    { err: error instanceof Error ? error.message : String(error), path: req.path },
    'request failed',
  );
  res.status(500).json({ error: 'Something went wrong on the server.' });
}
