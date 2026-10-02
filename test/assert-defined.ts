export function assertDefined<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('required test fixture missing');
  return value;
}
