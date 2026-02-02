export function createRateLimiter() {
  const requests = new Map();
  const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  const MAX_REQUESTS = 100; // per window
  const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  
  // Periodic cleanup of old entries
  setInterval(() => {
    const now = Date.now();
    for (const [id, data] of requests.entries()) {
      if (now - data.windowStart > WINDOW_MS) {
        requests.delete(id);
      }
    }
  }, CLEANUP_INTERVAL);
  
  return (req, res, next) => {
    const clientId = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    // Get or create client data
    let clientData = requests.get(clientId);
    if (!clientData || now - clientData.windowStart > WINDOW_MS) {
      clientData = { count: 0, windowStart: now };
      requests.set(clientId, clientData);
    }
    
    clientData.count++;
    
    // Set rate limit headers
    const remaining = Math.max(0, MAX_REQUESTS - clientData.count);
    const resetTime = new Date(clientData.windowStart + WINDOW_MS);
    
    res.set({
      'X-RateLimit-Limit': MAX_REQUESTS.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': resetTime.toISOString(),
      'X-RateLimit-Window': '15m'
    });
    
    if (clientData.count > MAX_REQUESTS) {
      const retryAfter = Math.ceil((clientData.windowStart + WINDOW_MS - now) / 1000);
      
      res.status(429).json({
        error: {
          message: 'Rate limit exceeded',
          status: 429,
          retryAfter: retryAfter,
          limit: MAX_REQUESTS,
          window: '15 minutes',
          timestamp: new Date().toISOString()
        }
      });
      return;
    }
    
    next();
  };
}