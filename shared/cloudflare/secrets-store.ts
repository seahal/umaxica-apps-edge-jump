export interface SecretStoreSecret {
  get(): Promise<string>;
}

function normalizeSecretValue(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export async function resolveSecretValue<Env extends Record<string, unknown>>(
  env: Env,
  directKey: string,
  bindingKey: string = 'SENTRY_DSN',
): Promise<string | undefined> {
  const directValue = normalizeSecretValue(env[directKey]);
  if (directValue) {
    return directValue;
  }

  const binding = env[bindingKey];
  if (
    typeof binding === 'object' &&
    binding !== null &&
    'get' in binding &&
    typeof (binding as SecretStoreSecret).get === 'function'
  ) {
    return normalizeSecretValue(await (binding as SecretStoreSecret).get());
  }

  return undefined;
}

export async function withResolvedSecretValue<Env extends Record<string, unknown>>(
  env: Env,
  directKey: string,
  bindingKey: string = 'SENTRY_DSN',
): Promise<Env & Record<string, string | undefined>> {
  const resolvedValue = await resolveSecretValue(env, directKey, bindingKey);
  return {
    ...env,
    [directKey]: resolvedValue,
  } as Env & Record<string, string | undefined>;
}
