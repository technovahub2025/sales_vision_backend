import { ZodError } from 'zod';
import { fail } from '../utils/apiResponse.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * @param {{ body?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny }} schemas
 */
export function validateRequest(schemas) {
  return (req, res, next) => {
    try {
      if (schemas?.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas?.query) {
        const parsedQuery = schemas.query.parse(req.query);
        Object.defineProperty(req, 'query', {
          value: parsedQuery,
          writable: true,
          configurable: true,
        });
      }
      if (schemas?.body) {
        req.body = schemas.body.parse(req.body);
      }
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const fieldErrors = error.issues.reduce((acc, issue) => {
          const key = issue.path.join('.') || 'root';
          acc[key] = acc[key] || [];
          acc[key].push(issue.message);
          return acc;
        }, /** @type {Record<string, string[]>} */ ({}));
        return next(new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', fieldErrors));
      }
      return next(error);
    }
  };
}
