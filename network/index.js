function inferStatus(error, fallback = 500) {
  if (error?.code === 11000) return 409;
  if (error?.name === 'ValidationError') return 422;
  if (error?.name === 'CastError') return 400;

  const message = String(error?.message || error || '').toLowerCase();
  if (/not found|no encontrado|no encontrada/.test(message)) return 404;
  if (/already|duplicate|ya existe|abierto por otro|could not be consumed/.test(message)) return 409;
  if (/forbidden|unauthorized|no autorizado|privilege/.test(message)) return 403;
  if (/required|invalid|inval|must|debe|cannot|no puede|faltan|incomplete/.test(message)) return 400;
  return fallback;
}

function errorCode(status, error) {
  if (error?.code === 11000) return 'DUPLICATE_RESOURCE';
  const codes = {
    400: 'BAD_REQUEST',
    401: 'AUTHENTICATION_REQUIRED',
    403: 'FORBIDDEN',
    404: 'RESOURCE_NOT_FOUND',
    409: 'CONFLICT',
    410: 'RESOURCE_GONE',
    422: 'VALIDATION_ERROR',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR'
  };
  return codes[status] || 'REQUEST_FAILED';
}

function normalizeError(message, requestedStatus, details) {
  const source = details instanceof Error
    ? details
    : message instanceof Error ? message : null;
  const fallback = requestedStatus || 500;
  const status = fallback >= 500 && source ? inferStatus(source, fallback) : fallback;
  const safeMessage = status >= 500
    ? 'Internal server error'
    : String(source?.message || message || 'Request failed');
  return {
    status,
    code: errorCode(status, source),
    message: safeMessage,
    details: Array.isArray(details) ? details : undefined
  };
}

function sourceMessage(details) {
  if (details instanceof Error) return details.message;
  return details || '';
}

exports.success = function success(req, res, message, status) {
  if (!res.headersSent) {
    res.status(status || 200).send({
      error: '',
      body: message,
      requestId: req.id
    });
  }
};

exports.error = function error(req, res, message, status, details) {
  const normalized = normalizeError(message, status, details);
  console.error(`[response error] ${req.id || '-'} ${normalized.code}: ${sourceMessage(details)}`);

  if (!res.headersSent) {
    res.status(normalized.status).send({
      error: normalized.message,
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
      loginIsRequired: normalized.status === 401,
      body: '',
      requestId: req.id
    });
  }
};

exports.normalizeError = normalizeError;
