// src/app/api/caltrans-cams/route.ts
// Returns the current set of Caltrans CCTV cameras from the official CWWP2 feed.
// Cached for 15 min. Free, no auth.

import { NextRequest, NextResponse } from 'next/server';
import { getCaltransCams, toAegisCams } from '@/lib/caltrans-cctv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('refresh') === '1';
  const district = req.nextUrl.searchParams.get('district');
  const streamingOnly = req.nextUrl.searchParams.get('streaming') === '1';
  const bbox = req.nextUrl.searchParams.get('bbox'); // "lat1,lng1,lat2,lng2"
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '0', 10);

  try {
    const cache = await getCaltransCams({ force });
    let cams = toAegisCams(cache.cams);

    if (district) {
      const d = parseInt(district, 10);
      if (!Number.isNaN(d)) cams = cams.filter((c) => c.district === d);
    }
    if (streamingOnly) cams = cams.filter((c) => c.hasLiveStream);
    if (bbox) {
      const parts = bbox.split(',').map(parseFloat);
      if (parts.length === 4 && parts.every((p) => !Number.isNaN(p))) {
        const [lat1, lng1, lat2, lng2] = parts;
        const minLat = Math.min(lat1, lat2);
        const maxLat = Math.max(lat1, lat2);
        const minLng = Math.min(lng1, lng2);
        const maxLng = Math.max(lng1, lng2);
        cams = cams.filter((c) => c.lat >= minLat && c.lat <= maxLat && c.lng >= minLng && c.lng <= maxLng);
      }
    }
    if (limit > 0) cams = cams.slice(0, limit);

    return NextResponse.json({
      fetchedAt: cache.fetchedAt,
      total: cams.length,
      byDistrict: cams.reduce<Record<number, number>>((acc, c) => {
        acc[c.district] = (acc[c.district] || 0) + 1;
        return acc;
      }, {}),
      withLiveStream: cams.filter((c) => c.hasLiveStream).length,
      errors: cache.errors,
      cams,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300', // 5 min browser cache
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e), cams: [] },
      { status: 500 }
    );
  }
}
