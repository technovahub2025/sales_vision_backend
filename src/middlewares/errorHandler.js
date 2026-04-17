import { fail } from '../utils/apiResponse.js';
import { ZodError } from 'zod';

export function errorHandler(error, req, res, next) {
  let statusCode = error.statusCode || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.message || 'Unexpected server error';
  let details = error.details;

  if (error?.name === 'CastError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = `Invalid value for ${error.path || 'field'}`;
    details = { field: error.path, value: error.value };
  }

  if (error?.code === 11000) {
    statusCode = 409;
    code = 'CONFLICT';
    const duplicateField = Object.keys(error.keyPattern || {})[0] || 'field';
    message = `${duplicateField} already exists`;
    details = { field: duplicateField };
  }

  if (error instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = error.issues.reduce((acc, issue) => {
      const key = issue.path.join('.') || 'root';
      acc[key] = acc[key] || [];
      acc[key].push(issue.message);
      return acc;
    }, {});
  }

  if (statusCode >= 500) {
    console.error(`[${req.id || 'no-request-id'}]`, error);
  }

  const payloadDetails =
    details ||
    (process.env.NODE_ENV === 'development' ? { stack: error.stack } : undefined);

  res.status(statusCode).json({
    success: false,
    message,
    code,
    requestId: req.id || null,
    errors: [
      {
        code,
        ...(payloadDetails ? { details: payloadDetails } : {}),
      },
    ],
  });
}
