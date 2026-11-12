// Minimal in-memory fixed-window rate limiter for sensitive endpoints
// (password reset). Per-key counters; safe for single-instance deployments.

const buckets = new Map();

// keyFn(req) -> string bucket key. Returns 429 when the window is exceeded.
function rateLimit({ windowMs, max, keyFn, message }) {
  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ message: message || 'Too many requests. Please try again later.' });
    }
    next();
  };
}

// Test hook.
function resetRateLimits() {
  buckets.clear();
}

module.exports = { rateLimit, resetRateLimits };
