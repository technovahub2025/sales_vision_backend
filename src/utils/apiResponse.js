/**
 * @param {unknown} data
 * @param {string | Record<string, unknown>} [message]
 * @param {unknown} [meta]
 */
export function ok(data = null, message = 'OK', meta) {
  let resolvedMessage = message;
  let resolvedMeta = meta;

  if (message && typeof message === 'object' && !Array.isArray(message) && meta === undefined) {
    resolvedMessage = 'OK';
    resolvedMeta = message;
  }

  return {
    success: true,
    message: /** @type {string} */ (resolvedMessage),
    data,
    errors: null,
    ...(resolvedMeta ? { meta: resolvedMeta } : {}),
  };
}

/**
 * @param {string} message
 * @param {string} [code]
 * @param {unknown} [errors]
 * @param {unknown} [data]
 */
export function fail(message, code = 'UNKNOWN_ERROR', errors, data = null) {
  return {
    success: false,
    message,
    data,
    errors: [
      {
        code,
        ...(errors ? { details: errors } : {}),
      },
    ],
  };
}
