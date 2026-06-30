// src/app/api/caltrans-hls-proxy/route.ts
// CORS-friendly HLS proxy for Caltrans wzmedia streams.
// Returns the .m3u8 master with permissive CORS headers so the browser
// can fetch it directly. For .ts segments, the client should request them
// from wzmedia.dot.ca.gov directly (they have Access-Control-Allow-Origin: *).
//
// Why proxy: the m3u8 master itself sometimes has no CORS headers, which
// breaks the hls.js loader in some browsers.

import { NextRequest, NextResponse } from 'next/server';
import { safeFetch } from '@/lib/ssrf-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_HOSTS = new Set(['wzmedia.dot.ca.gov', 'cdn3.wowza.com']);

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 });
  }
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }
  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return NextResponse.json({ error: `Host not allowed: ${target.hostname}` }, { status: 403 });
  }
  // safeFetch internally validates the host against our SSRF guard
  try {
    const res = await safeFetch(target.toString(), {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream HTTP ${res.status}` },
        { status: res.status }
      );
    }
    const text = await res.text();
    // Rewrite segment URLs in the m3u8 to also go through the proxy
    // (so we never need to set up CORS for wzmedia)
    const base = target.toString().replace(/\/[^/]*$/, '/');
    const rewritten = text
      .split('\n')
      .map((line) => {
        if (line.startsWith('#') || line.trim() === '') return line;
        // Absolute URL already
        if (/^https?:\/\//.test(line)) return line;
        // Relative URL — make absolute
        try {
          return new URL(line, base).toString();
        } catch {
          return line;
        }
      })
      .join('\n');

    return new NextResponse(rewritten, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=10',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 502 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
