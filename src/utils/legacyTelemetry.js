const counters = new Map();

function normalizePath(path) {
  return String(path || '')
    .split('?')[0]
    .replace(/\/+$/, '') || '/';
}

export function recordLegacyHit(method, path) {
  const key = `${String(method || 'GET').toUpperCase()} ${normalizePath(path)}`;
  counters.set(key, (counters.get(key) || 0) + 1);
}

export function getLegacyHits() {
  return Array.from(counters.entries())
    .map(([key, hits]) => ({ key, hits }))
    .sort((a, b) => b.hits - a.hits);
}
