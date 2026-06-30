export type UiError = {
  code: string;
  message: string;
  status?: number;
  requestId?: string | null;
  retryable?: boolean;
  fallbackPath?: string | null;
};

const DEFAULT_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: 'Sign in again to continue.',
  FORBIDDEN: 'You do not have access to this page or action.',
  NOT_FOUND: 'The requested item could not be found.',
  INVALID_REQUEST: 'Some information is missing or invalid.',
  NET_TIMEOUT: 'The request took too long. Try again in a moment.',
  NETWORK_ERROR: 'Network connection failed. Try again in a moment.',
  INTERNAL_SERVER_ERROR: 'Something went wrong. Try again in a moment.',
};

export function toUiError(input: any, fallbackMessage = 'Something went wrong'): UiError {
  if (input && typeof input === 'object' && 'code' in input && 'message' in input) {
    return input as UiError;
  }

  const status = Number(input?.status || 0) || undefined;
  const rawCode = String(input?.code || input?.error || '').trim();
  const code = (rawCode || (
    status === 401 ? 'UNAUTHENTICATED' :
    status === 403 ? 'FORBIDDEN' :
    status === 404 ? 'NOT_FOUND' :
    status === 400 ? 'INVALID_REQUEST' :
    status && status >= 500 ? 'INTERNAL_SERVER_ERROR' :
    'UNKNOWN_ERROR'
  )).toUpperCase();

  const rawMessage = String(input?.message || input?.detail || '').trim();
  const message = rawMessage && rawMessage.length < 220
    ? rawMessage
    : DEFAULT_MESSAGES[code] || fallbackMessage;

  return {
    code,
    message,
    status,
    requestId: input?.request_id || input?.requestId || null,
    retryable: Boolean(input?.retryable || (status && status >= 500)),
    fallbackPath: input?.fallback_path || input?.fallbackPath || null,
  };
}

export function errorFromCatch(error: any, fallbackMessage = 'Something went wrong'): UiError {
  const message = String(error?.message || '').trim();
  if (/request timeout|aborted|timed out/i.test(message)) {
    return { code: 'NET_TIMEOUT', message: DEFAULT_MESSAGES.NET_TIMEOUT, retryable: true };
  }
  if (/failed to fetch|network/i.test(message)) {
    return { code: 'NETWORK_ERROR', message: DEFAULT_MESSAGES.NETWORK_ERROR, retryable: true };
  }
  return toUiError(error, fallbackMessage);
}
