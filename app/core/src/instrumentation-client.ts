// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import { captureRouterTransitionStart, init, replayIntegration } from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  init({
    dsn,

    // Add optional integrations for additional features
    integrations: [replayIntegration()],

    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,

    // Define how likely Replay events are sampled.
    // This sets the sample rate to be 10%. You may want this to be 100% while
    // in development and sample at a lower rate in production
    replaysSessionSampleRate: 0.1,

    // Define how likely Replay events are sampled when an error occurs.
    replaysOnErrorSampleRate: 1.0,

    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = captureRouterTransitionStart;
