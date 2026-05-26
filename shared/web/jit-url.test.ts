import { describe, expect, it } from 'vite-plus/test';
import { getJitWorkspaceEnvName, getJitWorkspaceUrl } from './jit-url';

describe('shared/web/jit-url', () => {
  it('builds the expected env var name', () => {
    expect(getJitWorkspaceEnvName('APP', 'CORE')).toBe('JIT_APP_CORE_URL');
    expect(getJitWorkspaceEnvName('COM', 'DOCS')).toBe('JIT_COM_DOCS_URL');
    expect(getJitWorkspaceEnvName('ORG', 'NEWS')).toBe('JIT_ORG_NEWS_URL');
  });

  it('normalizes the workspace url', () => {
    expect(
      getJitWorkspaceUrl('APP', 'CORE', {
        JIT_APP_CORE_URL: 'http://localhost:5402/',
      }),
    ).toBe('http://localhost:5402');
  });

  it('normalizes the workspace url without trailing slash', () => {
    expect(
      getJitWorkspaceUrl('APP', 'CORE', {
        JIT_APP_CORE_URL: 'http://localhost:5402',
      }),
    ).toBe('http://localhost:5402');
  });

  it('returns null when the workspace url is missing', () => {
    expect(getJitWorkspaceUrl('APP', 'CORE', {})).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(
      getJitWorkspaceUrl('APP', 'CORE', {
        JIT_APP_CORE_URL: '',
      }),
    ).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(
      getJitWorkspaceUrl('APP', 'CORE', {
        JIT_APP_CORE_URL: '   ',
      }),
    ).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(
      getJitWorkspaceUrl('APP', 'CORE', {
        JIT_APP_CORE_URL: undefined,
      }),
    ).toBeNull();
  });
});
