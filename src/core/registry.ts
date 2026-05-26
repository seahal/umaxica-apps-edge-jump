import type { IssuerConfig, IssuerRegistry } from './types';

export function getIssuer(registry: IssuerRegistry, iss: string): IssuerConfig | undefined {
  return registry[iss];
}
