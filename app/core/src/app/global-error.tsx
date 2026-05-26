'use client';

import * as Sentry from '@sentry/nextjs';
import { useCallback, useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const handleReset = useCallback(() => reset(), [reset]);
  return (
    <html lang="ja">
      <body>
        <main className="status-page">
          <h1>500</h1>
          <p>Something went wrong.</p>
          <button onClick={handleReset} type="button">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
