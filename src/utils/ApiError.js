export class ApiError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   * @param {'UNAUTHORIZED'|'FORBIDDEN'|'NOT_FOUND'|'VALIDATION_ERROR'|'RATE_LIMITED'|'CONFLICT'|'INTERNAL'|string} [code]
   * @param {unknown} [details]
   */
  constructor(statusCode, message, code = 'INTERNAL', details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

