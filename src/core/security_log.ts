const ALLOWED_FIELDS = new Set([
  'level',
  'event',
  'result',
  'reason',
  'stage',
  'request_id',
  'cf_ray',
  'runtime',
  'edge',
  'iss',
  'kid',
  'dst',
  'dst_origin',
  'policy_decision',
  'status',
  'latency_ms',
  'error_name',
  'rate_limit_outcome',
]);

const FORBIDDEN_KEY_PATTERN =
  /^(rt|token|jwt|authorization|cookie|password|secret|private_key|pem|href|url|query|fragment|destination)$/i;

export type SecurityLogEntry = Record<string, unknown>;

export function sanitizeSecurityLog(entry: SecurityLogEntry): SecurityLogEntry {
  const sanitized: SecurityLogEntry = {};
  for (const [key, value] of Object.entries(entry)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) continue;
    if (!ALLOWED_FIELDS.has(key)) continue;
    if (typeof value === 'string' && looksLikeJwt(value)) continue;
    if (key === 'dst_origin' && typeof value === 'string' && !isOriginOnly(value)) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

export function emitSecurityLog(entry: SecurityLogEntry): void {
  const payload = JSON.stringify(sanitizeSecurityLog(entry));
  if (entry.level === 'warn') {
    // eslint-disable-next-line no-console -- structured security events are the intended sink.
    console.warn(payload);
  } else {
    // eslint-disable-next-line no-console -- structured security events are the intended sink.
    console.log(payload);
  }
}

function looksLikeJwt(value: string) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

function isOriginOnly(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.pathname === '/' && !parsed.search && !parsed.hash && !parsed.username;
  } catch {
    return false;
  }
}
