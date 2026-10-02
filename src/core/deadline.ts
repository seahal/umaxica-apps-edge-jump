import { JumpError } from './types';

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new JumpError('deadline_exceeded');
}
export async function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  // Attach handlers even when already aborted: observe the losing rejection.
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new JumpError('deadline_exceeded'));
    signal.addEventListener('abort', abort, { once: true });
    const cleanup = () => signal.removeEventListener('abort', abort);
    promise.then(
      (value) => {
        cleanup();
        if (signal.aborted) abort();
        else resolve(value);
      },
      (error) => {
        cleanup();
        reject(signal.aborted ? new JumpError('deadline_exceeded') : error);
      },
    );
    if (signal.aborted) {
      cleanup();
      abort();
    }
  });
}
