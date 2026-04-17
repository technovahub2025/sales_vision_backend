/**
 * @template {(...args: any[]) => Promise<any>} T
 * @param {T} fn
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

