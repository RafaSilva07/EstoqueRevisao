const sensitiveKeyPattern = /authorization|cookie|password|secret|token/i;

export function redactSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeyPattern.test(key) ? '[REDACTED]' : redactSensitive(item, seen),
    ]),
  );
}
