import app from '../../src/index';

export const requestFromApp = (
  path: string,
  init?: RequestInit,
  env?: Record<string, unknown>,
): Response | Promise<Response> => app.request(path, init, env);
