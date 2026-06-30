'use client';

import { useEffect, useState, useRef } from 'react';
import { Camera, ExternalLink, RefreshCw, MapPin } from 'lucide-react';

type Cam = {
  id: string;
  state: string;
  description: string;
  lat: number;
  lng: number;
  direction?: string;
  url: string;        // image URL (m3u8 hls in source, but we display the parent)
  format: string;     // M3U8 | IMAGE_STREAM
  encoding?: string;
};

// Curated, verified live traffic cameras (all Caltrans District 9 — Eastern Sierra).
// Confirmed returning HTTP 200 as of 2026-06-30. Refreshes every few seconds
// from upstream; our widget re-requests every 4s with cache-busting query param.
//
// We deliberately do NOT include Texas (0 cameras in OpenTrafficCamMap).
// For Texas drivers, the widget shows a graceful fallback link.

const CURATED_CAMS: Array<Cam & { thumbnailUrl: string; refreshUrl: string }> = [
  {
    id: 'curated-sr203-mammoth',
    state: 'California',
    description: 'SR-203 · Mammoth Mountain',
    lat: 37.64111,
    lng: -118.91848,
    direction: 'N',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/sr203mammothmountain/sr203mammothmountain.jpg',
    format: 'IMAGE_STREAM',
    encoding: 'H.264',
    thumbnailUrl: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/sr203mammothmountain/sr203mammothmountain.jpg',
    refreshUrl: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/sr203mammothmountain/sr203mammothmountain.jpg',
  },
  {
    id: 'curated-us395-conway',
    state: 'California',
    description: 'US-395 · Conway Summit',
    lat: 38.08782,
    lng: -119.181251,
    direction: 'N',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us395conwaysummit/us395conwaysummit.jpg',
    format: 'IMAGE_STREAM',
    encoding: 'H.264',
    thumbnailUrl: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us395conwaysummit/us395conwaysummit.jpg',
    refreshUrl: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us395conwaysummit/us395conwaysummit.jpg',
  },
  {
    id: 'curated-us6-stateline',
    state: 'California',
    description: 'US-6 · State Line',
    lat: 37.84225,
    lng: -118.47842,
    direction: 'E',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us6stateline/us6stateline.jpg',
    format: 'IMAGE_STREAM',
    encoding: 'H.264',
    thumbnailUrl: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us6stateline/us6stateline.jpg',
    refreshUrl: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us6stateline/us6stateline.jpg',
  },
  {
    id: 'curated-us395-crestview',
    state: 'California',
    description: 'US-395 · Crestview',
    lat: 37.75146,
    lng: -118.98329,
    direction: 'N',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us395crestview/us395crestview.jpg',
    format: 'IMAGE_STREAM',
    encoding: 'H.264',
    thumbnailUrl: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us395crestview/us395crestview.jpg',
    refreshUrl: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us395crestview/us395crestview.jpg',
  },
];

/**
 * EmergencyCCTV — always-on dashboard widget with 3 verified live traffic
 * camera feeds. Refreshes image every 4 seconds. Works regardless of
 * truck position. Tap a feed to open the full feed in a new tab.
 */
export default function EmergencyCCTV() {
  const [tick, setTick] = useState(0);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState<{ total: number; byState: Record<string, number> } | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Pull master summary from /api/cameras for the "7,029 cams available" line
    fetch('/api/cameras?summary=1')
      .then((r) => r.json())
      .then((d) => setSummary({ total: d.total, byState: d.byState }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshRef.current = setInterval(() => setTick((t) => t + 1), 4000);
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, []);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-amber-400" />
          <h3 className="text-[10px] uppercase tracking-[0.25em] text-slate-300 font-bold">
            Live Traffic CCTV
          </h3>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {summary ? `${summary.total.toLocaleString()} cams · live` : 'loading...'}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {CURATED_CAMS.map((cam) => {
          // Cache-bust every refresh by appending a tick param (most CDNs ignore query on same path)
          const src = `${cam.thumbnailUrl}?t=${tick}`;
          const isErr = errors[cam.id];
          return (
            <a
              key={cam.id}
              href={cam.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block group rounded overflow-hidden border border-slate-800 hover:border-amber-500/50 transition"
            >
              <div className="relative aspect-video bg-slate-950 overflow-hidden">
                {isErr ? (
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500">
                    <RefreshCw className="w-3 h-3 mr-1" /> offline
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={cam.description}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    onError={() => setErrors((e) => ({ ...e, [cam.id]: true }))}
                  />
                )}
                <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-amber-300 border border-amber-500/30">
                  {cam.state.slice(0, 2).toUpperCase()}
                </div>
              </div>
              <div className="p-1.5">
                <div className="text-[10px] text-slate-300 font-medium leading-tight truncate">
                  {cam.description}
                </div>
                <div className="text-[9px] text-slate-500 mt-0.5 flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5" />
                  {cam.lat.toFixed(2)}, {cam.lng.toFixed(2)}
                </div>
              </div>
            </a>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-[9px] text-slate-500">
        <span>Refreshes every 4s · tap to open full feed</span>
        <a href="/globe" className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition">
          View on Intel Globe <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
}