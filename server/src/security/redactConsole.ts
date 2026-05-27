const sensitiveKeyPattern = /(token|secret|password|authorization|api[_-]?key|service[_-]?key|user[_-]?id|org[_-]?id)/i;
const jwtPattern = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function redact(value: any): any {
  if (typeof value === 'string') {
    return value.replace(jwtPattern, '[redacted-jwt]').replace(uuidPattern, '[redacted-id]');
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [key, next] of Object.entries(value)) {
      out[key] = sensitiveKeyPattern.test(key) ? '[redacted]' : redact(next);
    }
    return out;
  }
  return value;
}

export function installConsoleRedaction() {
  for (const method of ['log', 'debug', 'info', 'warn', 'error'] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: any[]) => original(...args.map(redact));
  }
}
