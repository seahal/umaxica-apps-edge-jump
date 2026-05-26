import { describe, it, expect, vi } from 'vite-plus/test';
import {
  resolveSecretValue,
  withResolvedSecretValue,
  type SecretStoreSecret,
} from './secrets-store';

describe('shared/cloudflare/secrets-store', () => {
  describe('resolveSecretValue', () => {
    it('returns direct value when it exists and is valid', async () => {
      const env = { TEST_KEY: 'direct-value' };
      const result = await resolveSecretValue(env, 'TEST_KEY');
      expect(result).toBe('direct-value');
    });

    it('returns undefined when direct value is empty string', async () => {
      const env = { TEST_KEY: '' };
      const result = await resolveSecretValue(env, 'TEST_KEY');
      expect(result).toBeUndefined();
    });

    it('returns undefined when direct value is whitespace only', async () => {
      const env = { TEST_KEY: '   ' };
      const result = await resolveSecretValue(env, 'TEST_KEY');
      expect(result).toBeUndefined();
    });

    it('returns undefined when direct value is not a string', async () => {
      const env = { TEST_KEY: 123 };
      const result = await resolveSecretValue(env, 'TEST_KEY');
      expect(result).toBeUndefined();
    });

    it('returns binding value when direct value is invalid and binding is valid secret store', async () => {
      const secretValue = 'binding-value';
      const mockBinding: SecretStoreSecret = {
        get: vi.fn<() => Promise<string>>(() =>
          Promise.resolve(secretValue),
        ) as unknown as () => Promise<string>,
      };
      const env = { TEST_KEY: '', SECRET_BINDING: mockBinding };

      const result = await resolveSecretValue(env, 'TEST_KEY', 'SECRET_BINDING');
      expect(result).toBe('binding-value');
      // oxlint-disable-next-line @typescript-eslint/unbound-method
      expect(vi.mocked(mockBinding.get).mock.calls).toHaveLength(1);
    });

    it('returns undefined when both direct and binding values are invalid', async () => {
      const mockBinding = {
        get: vi.fn<() => Promise<string>>().mockResolvedValue(''),
      };
      const env = { TEST_KEY: '', SECRET_BINDING: mockBinding };

      const result = await resolveSecretValue(env, 'TEST_KEY', 'SECRET_BINDING');
      expect(result).toBeUndefined();
      expect(mockBinding.get).toHaveBeenCalledWith();
    });

    it('returns undefined when binding is not a secret store', async () => {
      const env = { TEST_KEY: '', SECRET_BINDING: 'not-a-secret-store' };
      const result = await resolveSecretValue(env, 'TEST_KEY', 'SECRET_BINDING');
      expect(result).toBeUndefined();
    });

    it('uses default binding key when not provided', async () => {
      const secretValue = 'sentry-dsn-value';
      const mockBinding: SecretStoreSecret = {
        get: vi.fn<() => Promise<string>>(() =>
          Promise.resolve(secretValue),
        ) as unknown as () => Promise<string>,
      };
      const env = { TEST_KEY: '', SENTRY_DSN: mockBinding };

      const result = await resolveSecretValue(env, 'TEST_KEY');
      expect(result).toBe('sentry-dsn-value');
      // oxlint-disable-next-line @typescript-eslint/unbound-method
      expect(vi.mocked(mockBinding.get).mock.calls).toHaveLength(1);
    });
  });

  describe('withResolvedSecretValue', () => {
    it('returns env with resolved secret value', async () => {
      const env = { TEST_KEY: 'direct-value', OTHER_KEY: 'other-value' };
      const result = await withResolvedSecretValue(env, 'TEST_KEY');

      expect(result).toEqual({
        TEST_KEY: 'direct-value',
        OTHER_KEY: 'other-value',
      });
    });

    it('overrides env key with resolved value', async () => {
      const secretValue = 'resolved-value';
      const mockBinding: SecretStoreSecret = {
        get: vi.fn<() => Promise<string>>(() =>
          Promise.resolve(secretValue),
        ) as unknown as () => Promise<string>,
      };
      const env = { TEST_KEY: '', SECRET_BINDING: mockBinding };

      const result = await withResolvedSecretValue(env, 'TEST_KEY', 'SECRET_BINDING');

      expect(result).toEqual({
        TEST_KEY: 'resolved-value',
        SECRET_BINDING: mockBinding,
      });
    });
  });
});
