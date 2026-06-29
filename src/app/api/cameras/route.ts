import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Aegis Highway CCTV API
 *
 * Backed by OpenTrafficCamMap's MIT-licensed USA dataset (7,029 cams in 10 states as of 2026-06-29).
 * Build-time normalized index lives in public/data/cameras-index.json.
 *
 * GET /api/cameras                         — all cameras
 * GET /api/cameras?state=California         — filter by state
 * GET /api/cameras?bbox=lat1,lng1,lat2,lng2 — bbox filter (any order)
 * GET /api/cameras?format=M3U8              — filter by stream format
 * GET /api/cameras?limit=50&offset=0        — pagination
 * GET /api/cameras?near=lat,lng&radiusDeg=0.5 — within radius (rough, in degrees)
 * GET /api/cameras?summary=1                — counts per state + format (no payload)
 */

type Camera = {
  id: string;
  state: string;
  county: string;
  description: string;
  lat: number;
  lng: number;
  direction: string;
  url: string;
  encoding: string;
  format: string;
};

type Index = {
  version: string;
  source: string;
  total: number;
  cameras: Camera[];
};

let cachedIndex: Index | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadIndex(): Promise<Index> {
  const now = Date.now();
  if (cachedIndex && now - cachedAt < CACHE_TTL_MS) return cachedIndex;
  // Resolve relative to compiled/build dir at runtime via process.cwd()
  const filePath = path.join(process.cwd(), 'public', 'data', 'cameras-index.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  cachedIndex = JSON.parse(raw) as Index;
  cachedAt = now;
  return cachedIndex;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const format = url.searchParams.get('format');
  const bbox = url.searchParams.get('bbox');
  const summary = url.searchParams.get('summary');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '500', 10) || 500, 5000);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;
  const near = url.searchParams.get('near');
  const radiusDeg = parseFloat(url.searchParams.get('radiusDeg') ?? '0.5');

  let index: Index;
  try {
    index = await loadIndex();
  } catch (e) {
    return NextResponse.json(
      { error: 'index_unavailable', detail: (e as Error).message },
      { status: 503 }
    );
  }

  if (summary) {
    const byState: Record<string, number> = {};
    const byFormat: Record<string, number> = {};
    for (const c of index.cameras) {
      byState[c.state] = (byState[c.state] ?? 0) + 1;
      byFormat[c.format] = (byFormat[c.format] ?? 0) + 1;
    }
    return NextResponse.json({
      total: index.total,
      version: index.version,
      source: index.source,
      byState,
      byFormat,
    });
  }

  let cams = index.cameras;

  if (state) {
    cams = cams.filter((c) => c.state.toLowerCase() === state.toLowerCase());
  }
  if (format) {
    cams = cams.filter((c) => c.format === format);
  }
  if (bbox) {
    const parts = bbox.split(',').map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const [lat1, lng1, lat2, lng2] = parts;
      const minLat = Math.min(lat1, lat2);
      const maxLat = Math.max(lat1, lat2);
      const minLng = Math.min(lng1, lng2);
      const maxLng = Math.max(lng1, lng2);
      cams = cams.filter((c) => c.lat >= minLat && c.lat <= maxLat && c.lng >= minLng && c.lng <= maxLng);
    }
  }
  if (near) {
    const parts = near.split(',').map(Number);
    if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) {
      const [lat, lng] = parts;
      cams = cams.filter(
        (c) => Math.abs(c.lat - lat) <= radiusDeg && Math.abs(c.lng - lng) <= radiusDeg
      );
    }
  }

  const total = cams.length;
  const sliced = cams.slice(offset, offset + limit);

  return NextResponse.json({
    total,
    returned: sliced.length,
    offset,
    limit,
    version: index.version,
    source: index.source,
    cameras: sliced,
  });
}
