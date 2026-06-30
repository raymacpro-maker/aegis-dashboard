// src/lib/caltrans-cctv.ts
// Caltrans Commercial Wholesale Web Portal (CWWP2) CCTV data integration.
// Free, no-auth, no-API-key, no rate limit.
// https://cwwp2.dot.ca.gov/closed-circuit-television-cameras.html
//
// Each district publishes CCTV status as JSON / CSV / XML / TXT.
// We poll all 12 districts, normalize to a uniform shape, and cache.
//
// Refresh interval: 15 minutes (the upstream itself updates every 5 min;
// polling more often is wasteful and may trigger rate-limiting).

import { z } from 'zod';
import { stealthFetch } from './stealthFetch';

const CALTTRANS_BASE = 'https://cwwp2.dot.ca.gov/data/d{D}/cctv/cctvStatusD{DD}.{ext}';
const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 min
const REQUEST_TIMEOUT_MS = 10_000;

// ─── Caltrans JSON shape ──────────────────────────────────────────────

const CaltransCctvSchema = z.object({
  cctv: z.object({
    index: z.string(),
    recordTimestamp: z.object({
      recordDate: z.string(),
      recordTime: z.string(),
      recordEpoch: z.string(),
    }),
    location: z.object({
      district: z.string(),
      locationName: z.string(),
      nearbyPlace: z.string().optional().default(''),
      longitude: z.string(),
      latitude: z.string(),
      elevation: z.string().optional().default(''),
      direction: z.string().optional().default(''),
      county: z.string().optional().default(''),
      route: z.string().optional().default(''),
      routeSuffix: z.string().optional().default(''),
      postmilePrefix: z.string().optional().default(''),
      postmile: z.string().optional().default(''),
      alignment: z.string().optional().default(''),
      milepost: z.string().optional().default(''),
    }),
    inService: z.string(), // "true" | "false"
    imageData: z.object({
      imageDescription: z.string().optional().default(''),
      streamingVideoURL: z.string().optional().default(''),
      static: z.object({
        currentImageUpdateFrequency: z.string().optional().default('5'),
        currentImageURL: z.string().optional().default(''),
      }).optional(),
    }),
  }),
});

const CaltransFeedSchema = z.object({
  data: z.array(CaltransCctvSchema),
});

export type CaltransCam = {
  id: string;             // "d4_1" (district_index)
  district: number;
  name: string;
  nearbyPlace: string;
  route: string;
  direction: string;
  county: string;
  lat: number;
  lng: number;
  elevation: number;
  inService: boolean;
  /** Static JPEG URL (5-min cadence upstream). */
  jpgUrl: string;
  /** Refresh interval in minutes (typically "5"). */
  jpgRefreshMin: number;
  /** HLS playlist URL — empty string if not streaming. */
  hlsUrl: string;
  /** Last upstream recordEpoch (Unix seconds). */
  lastRecordEpoch: number;
  /** Which Caltrans record this came from (for debugging). */
  recordDate: string;
  recordTime: string;
};

// ─── Cache ────────────────────────────────────────────────────────────

type Cache = {
  fetchedAt: number;
  cams: CaltransCam[];
  errors: Array<{ district: number; error: string }>;
};

let cache: Cache | null = null;

function normalize(cctv: z.infer<typeof CaltransCctvSchema>['cctv'], district: number): CaltransCam | null {
  const lat = parseFloat(cctv.location.latitude);
  const lng = parseFloat(cctv.location.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  const inService = cctv.inService === 'true';
  const hlsUrl = cctv.imageData.streamingVideoURL || '';
  const jpgUrl = cctv.imageData.static?.currentImageURL || '';
  const jpgRefreshMin = parseInt(cctv.imageData.static?.currentImageUpdateFrequency || '5', 10) || 5;
  return {
    id: `d${district}_${cctv.index}`,
    district,
    name: cctv.location.locationName,
    nearbyPlace: cctv.location.nearbyPlace || '',
    route: cctv.location.route || '',
    direction: cctv.location.direction || '',
    county: cctv.location.county || '',
    lat,
    lng,
    elevation: parseInt(cctv.location.elevation || '0', 10) || 0,
    inService,
    jpgUrl,
    jpgRefreshMin,
    hlsUrl,
    lastRecordEpoch: parseInt(cctv.recordTimestamp.recordEpoch, 10) || 0,
    recordDate: cctv.recordTimestamp.recordDate,
    recordTime: cctv.recordTimestamp.recordTime,
  };
}

async function fetchDistrict(district: number, signal: AbortSignal): Promise<CaltransCam[]> {
  const dd = String(district).padStart(2, '0');
  const url = CALTTRANS_BASE.replace('{D}', String(district)).replace('{DD}', dd).replace('{ext}', 'json');
  const res = await fetch(url, {
    cache: 'no-store',
    signal,
    headers: { 'User-Agent': 'Mozilla/5.0 (Aegis-Fleet-Dashboard)', 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    // JSON parse error — fall back to XML
    return await fetchDistrictXml(district, signal);
  }
  const validated = CaltransFeedSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Schema validation failed: ${validated.error.issues[0]?.message}`);
  }
  return validated.data.data
    .map((d) => normalize(d.cctv, district))
    .filter((c): c is CaltransCam => c !== null);
}

async function fetchDistrictXml(district: number, signal: AbortSignal): Promise<CaltransCam[]> {
  const dd = String(district).padStart(2, '0');
  const url = CALTTRANS_BASE.replace('{D}', String(district)).replace('{DD}', dd).replace('{ext}', 'xml');
  const res = await fetch(url, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  // Lightweight XML extraction (don't need full parser for this simple shape)
  const records: CaltransCam[] = [];
  const cctvRe = /<cctv>([\s\S]*?)<\/cctv>/g;
  let m: RegExpExecArray | null;
  while ((m = cctvRe.exec(xml)) !== null) {
    const body = m[1];
    const pick = (re: RegExp) => {
      const mm = body.match(re);
      return mm ? mm[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
    };
    const lat = parseFloat(pick(/<latitude>([^<]+)<\/latitude>/));
    const lng = parseFloat(pick(/<longitude>([^<]+)<\/longitude>/));
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const inService = pick(/<inService>([^<]+)<\/inService>/) === 'true';
    const hlsUrl = pick(/<streamingVideoURL>(?:<!\[CDATA\[)?(https?:\/\/[^<>\]]+)(?:\]\]>)?<\/streamingVideoURL>/);
    const jpgUrl = pick(/<currentImageURL>(?:<!\[CDATA\[)?(https?:\/\/[^<>\]]+)(?:\]\]>)?<\/currentImageURL>/);
    const jpgRefreshMin = parseInt(pick(/<currentImageUpdateFrequency>([^<]+)<\/currentImageUpdateFrequency>/) || '5', 10) || 5;
    const lastRecordEpoch = parseInt(pick(/<recordEpoch>([^<]+)<\/recordEpoch>/) || '0', 10) || 0;
    records.push({
      id: `d${district}_${pick(/<index>([^<]+)<\/index>/)}`,
      district,
      name: pick(/<locationName>(?:<!\[CDATA\[)?([^<>\]]+)(?:\]\]>)?<\/locationName>/),
      nearbyPlace: pick(/<nearbyPlace>(?:<!\[CDATA\[)?([^<>\]]+)(?:\]\]>)?<\/nearbyPlace>/),
      route: pick(/<route>(?:<!\[CDATA\[)?([^<>\]]+)(?:\]\]>)?<\/route>/),
      direction: pick(/<direction>(?:<!\[CDATA\[)?([^<>\]]+)(?:\]\]>)?<\/direction>/),
      county: pick(/<county>(?:<!\[CDATA\[)?([^<>\]]+)(?:\]\]>)?<\/county>/),
      lat,
      lng,
      elevation: parseInt(pick(/<elevation>([^<]+)<\/elevation>/) || '0', 10) || 0,
      inService,
      jpgUrl,
      jpgRefreshMin,
      hlsUrl,
      lastRecordEpoch,
      recordDate: pick(/<recordDate>([^<]+)<\/recordDate>/),
      recordTime: pick(/<recordTime>([^<]+)<\/recordTime>/),
    });
  }
  return records;
}

async function fetchAll(signal: AbortSignal): Promise<Cache> {
  const errors: Array<{ district: number; error: string }> = [];
  const allCams: CaltransCam[] = [];
  // Fetch all 12 districts in parallel
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, (_, i) => fetchDistrict(i + 1, signal))
  );
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      allCams.push(...r.value);
    } else {
      errors.push({ district: i + 1, error: String(r.reason?.message || r.reason) });
    }
  });
  return { fetchedAt: Date.now(), cams: allCams, errors };
}

export async function getCaltransCams(opts: { force?: boolean } = {}): Promise<Cache> {
  const stale = !cache || Date.now() - cache.fetchedAt > REFRESH_INTERVAL_MS;
  if (stale || opts.force) {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS * 12);
    try {
      cache = await fetchAll(ac.signal);
    } catch (e) {
      // Keep stale cache on error if we have one
      if (!cache) {
        cache = { fetchedAt: 0, cams: [], errors: [{ district: 0, error: String(e) }] };
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  return cache!;
}

// ─── Helpers for Aegis component consumption ──────────────────────────

export type AegisPublicCam = {
  id: string;
  state: string;
  country: string;
  description: string;
  lat: number;
  lng: number;
  direction: string;
  url: string;
  format: 'IMAGE_STREAM' | 'M3U8';
  encoding: string;
  refreshMin: number;
  district: number;
  hasLiveStream: boolean;
};

const STATE_FROM_DISTRICT: Record<number, string> = {
  1: 'California', 2: 'California', 3: 'California', 4: 'California',
  5: 'California', 6: 'California', 7: 'California', 8: 'California',
  9: 'California', 10: 'California', 11: 'California', 12: 'California',
};

export function toAegisCams(cams: CaltransCam[]): AegisPublicCam[] {
  return cams
    .filter((c) => c.inService)
    .map((c) => {
      const hasLiveStream = !!c.hlsUrl;
      return {
        id: c.id,
        state: STATE_FROM_DISTRICT[c.district] || 'California',
        country: 'USA',
        description: c.name + (c.nearbyPlace ? ` (${c.nearbyPlace})` : ''),
        lat: c.lat,
        lng: c.lng,
        direction: c.direction,
        // For HLS streams, point at /api/caltrans-hls-proxy to bypass CORS
        url: hasLiveStream
          ? `/api/caltrans-hls-proxy?url=${encodeURIComponent(c.hlsUrl)}`
          : c.jpgUrl,
        format: hasLiveStream ? 'M3U8' as const : 'IMAGE_STREAM' as const,
        encoding: hasLiveStream ? 'H.264 / AAC' : 'JPEG',
        refreshMin: c.jpgRefreshMin,
        district: c.district,
        hasLiveStream,
      };
    });
}
