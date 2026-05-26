declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
    WORKER_SELF_REFERENCE: Fetcher;
    IMAGES: unknown;
    REVISION?: {
      id: string;
      tag: string;
      timestamp: string;
    };
  }
}
interface CloudflareEnv extends Cloudflare.Env {}
