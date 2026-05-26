import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

function getTimestamp() {
  return new Date().toISOString();
}

function getFallbackTimestamp() {
  const now = new Date();

  try {
    return now.toISOString();
  } catch {
    return now.toUTCString();
  }
}

export async function GET() {
  try {
    const timestamp = getTimestamp();
    const context = getCloudflareContext() as { env?: CloudflareEnv };
    const { id, tag, timestamp: revisionTimestamp } = context?.env?.REVISION ?? {};

    return NextResponse.json(
      {
        status: 'ok',
        timestamp,
        version: { id, tag, timestamp: revisionTimestamp },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      },
    );
  } catch {
    return NextResponse.json(
      { status: 'error', timestamp: getFallbackTimestamp() },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      },
    );
  }
}
