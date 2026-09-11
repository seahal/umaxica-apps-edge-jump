import type { IssuerConfig, IssuerRegistry } from './types';

export function getIssuer(registry: IssuerRegistry, iss: string): IssuerConfig | undefined {
  return Object.hasOwn(registry, iss) ? registry[iss] : undefined;
}
