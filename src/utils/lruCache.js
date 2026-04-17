export class LruCache {
  constructor({ max = 200, ttlMs = 60000 } = {}) {
    this.max = max;
    this.ttlMs = ttlMs;
    this.map = new Map();
  }

  get(key) {
    const item = this.map.get(key);
    if (!item) return null;
    if (item.expiresAt <= Date.now()) {
      this.map.delete(key);
      return null;
    }
    this.map.delete(key);
    this.map.set(key, item);
    return item.value;
  }

  set(key, value) {
    const item = { value, expiresAt: Date.now() + this.ttlMs };
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, item);
    if (this.map.size > this.max) {
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
    }
  }

  delete(key) {
    this.map.delete(key);
  }

  deleteByPrefix(prefix) {
    for (const key of this.map.keys()) {
      if (String(key).startsWith(prefix)) {
        this.map.delete(key);
      }
    }
  }
}
