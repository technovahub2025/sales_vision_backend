function splitOrigins(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function originToMatcher(pattern) {
  if (pattern === '*') {
    return () => true;
  }

  if (!pattern.includes('*')) {
    return (origin) => origin === pattern;
  }

  const escaped = escapeRegExp(pattern).replace(/\\\*/g, '.*');
  const regex = new RegExp(`^${escaped}$`);
  return (origin) => regex.test(origin);
}

export function buildAllowedOriginMatcher() {
  const rawOrigins = [
    process.env.CLIENT_ORIGIN,
    process.env.CLIENT_ORIGINS,
    process.env.FRONTEND_ORIGIN,
  ]
    .flatMap(splitOrigins)
    .filter(Boolean);

  if (rawOrigins.length === 0) {
    return () => true;
  }

  const matchers = rawOrigins.map(originToMatcher);
  return (origin) => matchers.some((matcher) => matcher(origin));
}

export function corsOriginDelegate() {
  const isAllowedOrigin = buildAllowedOriginMatcher();

  return (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  };
}
