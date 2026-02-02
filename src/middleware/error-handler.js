export function createErrorHandler() {
  return (error, req, res, next) => {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const timestamp = new Date().toISOString();
    
    // Log error details
    console.error(`[${timestamp}] API Error:`, {
      message: error.message,
      stack: error.stack,
      url: req.url,
      method: req.method,
      ip: req.ip
    });
    
    // Determine error status and message
    let status = error.status || error.statusCode || 500;
    let message = error.message || 'Internal server error';
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
      status = 400;
      message = 'Invalid request parameters';
    } else if (error.name === 'CastError') {
      status = 400;
      message = 'Invalid data format';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      status = 503;
      message = 'External service unavailable';
    }
    
    // Sanitize error message for production
    if (!isDevelopment && status === 500) {
      message = 'Internal server error';
    }
    
    const errorResponse = {
      error: {
        message,
        status,
        timestamp,
        path: req.path,
        method: req.method
      }
    };
    
    // Add stack trace in development
    if (isDevelopment) {
      errorResponse.error.stack = error.stack;
      errorResponse.error.details = error.details || null;
    }
    
    // Add request ID if available
    if (req.id) {
      errorResponse.error.requestId = req.id;
    }
    
    res.status(status).json(errorResponse);
  };
}