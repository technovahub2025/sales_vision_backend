// config/cors.js

function splitOrigins(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function originToMatcher(pattern) {
  // Allow all origins
  if (pattern === "*") {
    return () => true;
  }

  // Exact origin match
  if (!pattern.includes("*")) {
    return (origin) => origin === pattern;
  }

  // Wildcard origin match
  const escaped = escapeRegExp(pattern).replace(/\\\*/g, ".*");
  const regex = new RegExp(`^${escaped}$`);

  return (origin) => regex.test(origin);
}

export function buildAllowedOriginMatcher() {
  const rawOrigins = [
    // Render environment variables
    process.env.CLIENT_ORIGIN,
    process.env.CLIENT_ORIGINS,
    process.env.FRONTEND_ORIGIN,

    // Directly allowed frontend domains
    "https://www.technovahub.in",
    "https://technovahub.in",

    // Local development
    "http://localhost:5173",
    "http://localhost:3000",
  ]
    .flatMap(splitOrigins)
    .filter(Boolean);

  const matchers = rawOrigins.map(originToMatcher);

  return (origin) => {
    return matchers.some((matcher) => matcher(origin));
  };
}

export function corsOriginDelegate() {
  const isAllowedOrigin = buildAllowedOriginMatcher();

  return (origin, callback) => {
    // Allow requests without Origin
    // Example: Postman, mobile apps, server-to-server requests
    if (!origin) {
      return callback(null, true);
    }

    // Allow registered origins
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    console.error("❌ CORS blocked origin:", origin);

    return callback(
      new Error(`Origin not allowed by CORS: ${origin}`)
    );
  };
}