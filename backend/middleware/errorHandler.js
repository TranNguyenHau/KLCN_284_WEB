import { AppError } from '../utils/errors.js';

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
}

export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500 && !(err instanceof AppError)) console.error(err);
  res.status(status).json({
    error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Unexpected error', details: err.details }
  });
}
