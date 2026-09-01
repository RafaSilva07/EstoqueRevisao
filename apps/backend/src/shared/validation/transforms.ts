export function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function uppercaseString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export function optionalBoolean({ value }: { value: unknown }): unknown {
  if (value === undefined) {
    return undefined;
  }
  return value === true || value === 'true';
}

export function emptyStringToNull({ value }: { value: unknown }): unknown {
  return typeof value === 'string' && value.trim() === '' ? null : value;
}
