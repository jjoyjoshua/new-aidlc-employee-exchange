import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError, type ErrorBody } from './errors.js';
import { logger } from '../infra/logger/index.js';

/** Anything not matched by a route. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ErrorBody = {
    statusCode: 404,
    code: 'route_not_found',
    message: 'No such endpoint.',
  };
  res.status(404).json(body);
};

/**
 * The single exit for every failure.
 *
 * A thrown `HttpError` is a decision the server made, and its message is safe to show.
 * Anything else is a bug: it is logged in full for us and reduced to a bare 500 for the
 * caller, because a stack trace or a Postgres message crossing the boundary is a data leak
 * (security-standards.md).
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof HttpError) {
    if (error.statusCode >= 500) {
      logger.error('request failed', { method: req.method, path: req.path, code: error.code });
    }
    res.status(error.statusCode).json(error.toBody());
    return;
  }

  logger.error('unhandled error', {
    method: req.method,
    path: req.path,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  const body: ErrorBody = {
    statusCode: 500,
    code: 'internal_error',
    message: 'Something went wrong.',
  };
  res.status(500).json(body);
};
