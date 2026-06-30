'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, ExternalLink, RefreshCw, MapPin, X, ChevronLeft, ChevronRight,
  Search, Globe, Building2, Wifi, WifiOff, Truck, Crosshair, Power,
} from 'lucide-react';

type CamSource = 'public' | 'company';

type Cam = {
  id: string;
  source: CamSource;
  state: string;
  country?: string;
  description: string;
  lat: number;
  lng: number;
  direction?: string;
  url: string;
  format: 'IMAGE_STREAM' | 'M3U8' | 'IFRAME' | 'MP4';
  encoding?: string;
  /** True if the URL is verified to return 200 as a direct image (works in <img>).
   *  False for HLS streams that need <video> + hls.js. */
  directImage: boolean;
  /** District 1–12 (Caltrans only). */
  district?: number;
  /** Has an HLS streamingVideoURL (live video, frame-accurate to ~2-3s). */
  hasLiveStream?: boolean;
  /** Refresh interval in minutes (from Caltrans `currentImageUpdateFrequency`). */
  refreshMin?: number;
};

// Maximum number of public cams to render in the side panel at once.
// Rendering 3,000+ tiles would spawn thousands of useLiveImage/useHlsStream
// hooks, freezing the browser. Users can paginate to see more.
const PUBLIC_CAM_RENDER_LIMIT = 60;

// ── COMPANY cameras (placeholder until Compass streams are wired) ───
const COMPANY_CAMS: Cam[] = [
  {
    id: 'co-yard-austin',
    source: 'company',
    state: 'Texas', country: 'US',
    description: 'Aegis Yard · Austin Depot (North Gate)',
    lat: 30.2672, lng: -97.7431, direction: 'S',
    url: 'https://cwwp2.dot.ca.gov/data/d2/cctv/image/i5castella/i5castella.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true,
    refreshMin: 5,
  },
  {
    id: 'co-t47-cab',
    source: 'company',
    state: 'Texas', country: 'US',
    description: 'T-47 · Forward-facing cab cam (Sofia Reyes)',
    lat: 30.27, lng: -97.74, direction: 'N',
    url: 'https://cwwp2.dot.ca.gov/data/d7/cctv/image/i57triggs/i57triggs.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true,
  },
  {
    id: 'co-yard-roundrock',
    source: 'company',
    state: 'Texas', country: 'US',
    description: 'Aegis Yard · Round Rock (Loading Bay 3)',
    lat: 30.5083, lng: -97.8203, direction: 'W',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us395conwaysummit/us395conwaysummit.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true,
    refreshMin: 5,
  },
];

// Seed list of Caltrans cams to show instantly while the full feed loads.
// (Replaced at runtime by /api/caltrans-cams)
const SEED_PUBLIC_CAMS: Cam[] = [
  {
    id: 'pub-sr203-mammoth', source: 'public',
    state: 'California', country: 'US',
    description: 'SR-203 · Mammoth Mountain',
    lat: 37.64111, lng: -118.91848, direction: 'N',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/sr203mammothmountain/sr203mammothmountain.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true, refreshMin: 5, district: 9,
  },
  {
    id: 'pub-us395-conway', source: 'public',
    state: 'California', country: 'US',
    description: 'US-395 · Conway Summit',
    lat: 38.08782, lng: -119.181251, direction: 'N',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us395conwaysummit/us395conwaysummit.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true, refreshMin: 5, district: 9,
  },
  {
    id: 'pub-us6-stateline', source: 'public',
    state: 'California', country: 'US',
    description: 'US-6 · State Line',
    lat: 37.84225, lng: -118.47842, direction: 'E',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us6stateline/us6stateline.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true, refreshMin: 5, district: 9,
  },
  {
    id: 'pub-us395-crestview', source: 'public',
    state: 'California', country: 'US',
    description: 'US-395 · Crestview',
    lat: 37.75146, lng: -118.98329, direction: 'N',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us395crestview/us395crestview.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true, refreshMin: 5, district: 9,
  },
  {
    id: 'pub-i80-donner', source: 'public',
    state: 'California', country: 'US',
    description: 'I-80 · Donner Pass',
    lat: 39.3163, lng: -120.3300, direction: 'W',
    url: 'https://cwwp2.dot.ca.gov/data/d3/cctv/image/i80donnerpass/i80donnerpass.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true, refreshMin: 5, district: 3,
  },
  {
    id: 'pub-i5-castella', source: 'public',
    state: 'California', country: 'US',
    description: 'I-5 · Castella',
    lat: 41.1394, lng: -122.3097, direction: 'N',
    url: 'https://cwwp2.dot.ca.gov/data/d2/cctv/image/i5castella/i5castella.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true, refreshMin: 5, district: 2,
  },
  {
    id: 'pub-i5-triggs', source: 'public',
    state: 'California', country: 'US',
    description: 'I-5 · Triggs',
    lat: 34.05, lng: -118.24, direction: 'N',
    url: 'https://cwwp2.dot.ca.gov/data/d7/cctv/image/i57triggs/i57triggs.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true, refreshMin: 5, district: 7,
  },
];

// In-component state is initialised with the seed; the real feed replaces it
// once /api/caltrans-cams returns. Callers no longer use ALL_CAMS as a
// static list.

type FleetCoord = { id: string; lat: number; lng: number } | null;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

const SOURCE_META: Record<CamSource, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  public:  { label: 'Public',  color: 'text-cyan-300',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/30',   icon: <Globe className="w-2.5 h-2.5" /> },
  company: { label: 'Company', color: 'text-amber-300',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  icon: <Building2 className="w-2.5 h-2.5" /> },
};

/**
 * LiveImage — fetches a JPG image as a blob every `intervalMs`, creates a
 * fresh object URL each time, and assigns it to the img element. This
 * bypasses the browser's HTTP cache (which would otherwise return 304
 * for the same ETag and freeze the image).
 *
 * Returns the current object URL + an error flag.
 */
function useLiveImage(url: string, intervalMs: number, enabled: boolean) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(0);
  /** True if the last 2+ fetches returned byte-identical content — i.e. the
   *  upstream camera is defunct or its image is server-side cached. */
  const [stale, setStale] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastHashRef = useRef<string | null>(null);
  const sameAsLastRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setErr(false);
    setStale(false);
    setSrc(null);
    lastHashRef.current = null;
    sameAsLastRef.current = 0;

    async function tick() {
      if (cancelled) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(url, {
          cache: 'no-store',
          signal: ac.signal,
          headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        // Lightweight hash (FNV-1a 32-bit) — fast, no crypto dep
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let h = 0x811c9dc5;
        // Sample first 4 KB only — fast and collision-resistant for
        // detecting identical images (false positives extremely rare)
        const SAMPLE = 4096;
        const len = Math.min(bytes.length, SAMPLE);
        for (let i = 0; i < len; i++) {
          h ^= bytes[i];
          h = (h * 0x01000193) >>> 0;
        }
        const hash = h.toString(16) + ':' + bytes.length;
        if (lastHashRef.current === hash) {
          sameAsLastRef.current += 1;
          // 2+ consecutive identical = upstream camera is dead
          if (sameAsLastRef.current >= 2) setStale(true);
        } else {
          sameAsLastRef.current = 0;
          setStale(false);
        }
        lastHashRef.current = hash;
        const objectUrl = URL.createObjectURL(blob);
        setSrc((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return objectUrl;
        });
        setLastUpdate(Date.now());
        setErr(false);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        if (!cancelled) setErr(true);
      }
    }

    tick();
    const iv = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(iv);
      abortRef.current?.abort();
      setSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [url, intervalMs, enabled]);

  return { src, err, stale, lastUpdate };
}

/**
 * useHlsStream — plays an HLS .m3u8 URL in a <video> tag.
 * Uses native HLS on Safari/iOS, hls.js on Chrome/Firefox/Edge.
 */
function useHlsStream(url: string, enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    if (!video) return;
    let hls: import('hls.js').default | null = null;
    setErr(false);
    const isHlsNative = video.canPlayType('application/vnd.apple.mpegurl') !== '';
    if (isHlsNative) {
      video.src = url;
    } else {
      // dynamic import so hls.js doesn't bloat SSR bundle
      import('hls.js').then((mod) => {
        const Hls = mod.default;
        if (Hls.isSupported()) {
          hls = new Hls({ liveSyncDurationCount: 3, maxBufferLength: 10 });
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) setErr(true);
          });
        } else {
          setErr(true);
        }
      }).catch(() => setErr(true));
    }
    return () => {
      hls?.destroy();
      if (video) video.removeAttribute('src');
    };
  }, [url, enabled]);
  return { videoRef, err };
}

/**
 * useInView — IntersectionObserver hook. Returns true once the element
 * has entered the viewport. Used to lazy-mount expensive hooks
 * (useLiveImage, useHlsStream) so we don't spawn thousands of hls.js
 * instances for tiles the user can't see.
 */
function useInView<T extends HTMLElement>(rootMargin = "200px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect(); // one-shot: once visible, stay mounted
        }
      },
      { rootMargin, threshold: 0.01 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);
  return [ref, inView] as const;
}


/** Drive-by event: a truck got close to a camera. */
type DriveBy = {
  id: string;
  truckId: string;
  camId: string;
  camDescription: string;
  ts: number;
  distanceKm: number;
};

export default function EmergencyCCTV({
  selectedTruck = null,
  onOpenInGlobe,
}: {
  /** Optional selected truck — used for distance overlay + drive-by detection. */
  selectedTruck?: FleetCoord;
  /** Optional callback to fly the map to a camera location. */
  onOpenInGlobe?: (cam: { lat: number; lng: number; description: string }) => void;
}) {
  // ─── State ──────────────────────────────────────────────────────
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState<{ total: number; byState: Record<string, number>; withLiveStream: number; fetchedAt: number } | null>(null);
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState<'all' | CamSource>('all');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [liveOnly, setLiveOnly] = useState(false);
  const [activeCamId, setActiveCamId] = useState<string | null>(null);
  const [driveByEnabled, setDriveByEnabled] = useState<boolean>(true);
  const [driveBys, setDriveBys] = useState<DriveBy[]>([]);
  const [publicCams, setPublicCams] = useState<Cam[]>(SEED_PUBLIC_CAMS);
  const [caltransLoading, setCaltransLoading] = useState(false);
  const lastNearestRef = useRef<{ truckId: string; camId: string | null } | null>(null);

  // Persist drive-by toggle in localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('aegis.drive-by.enabled');
      if (saved !== null) setDriveByEnabled(saved === '1');
    } catch {}
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('aegis.drive-by.enabled', driveByEnabled ? '1' : '0');
    } catch {}
  }, [driveByEnabled]);

  // Fetch the full Caltrans CCTV catalogue from /api/caltrans-cams
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCaltransLoading(true);
      try {
        const res = await fetch('/api/caltrans-cams');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const fetched: Cam[] = (data.cams || []).map((c: {
          id: string; description: string; lat: number; lng: number; direction: string;
          state: string; country: string; url: string; format: 'IMAGE_STREAM' | 'M3U8';
          encoding: string; refreshMin: number; district: number; hasLiveStream: boolean;
        }) => ({
          id: c.id,
          source: 'public' as const,
          state: c.state,
          country: c.country,
          description: c.description,
          lat: c.lat,
          lng: c.lng,
          direction: c.direction,
          url: c.url,
          format: c.format,
          encoding: c.encoding,
          // JPEG: direct image. HLS: needs <video> + hls.js (not direct).
          directImage: c.format === 'IMAGE_STREAM',
          district: c.district,
          hasLiveStream: c.hasLiveStream,
          refreshMin: c.refreshMin,
        }));
        if (fetched.length > 0) setPublicCams(fetched);
        setSummary({
          total: data.total || 0,
          byState: { California: data.total || 0 },
          withLiveStream: data.withLiveStream || 0,
          fetchedAt: data.fetchedAt || 0,
        });
      } catch (e) {
        // keep seed if API fails
      } finally {
        if (!cancelled) setCaltransLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Effects ───────────────────────────────────────────────────
  // (summary is set by the /api/caltrans-cams fetch below)

  // Drive-by detection: whenever the selected truck moves, check if it's
  // now within 500m of a DIFFERENT camera than the last nearest one.
  // Skipped when driveByEnabled is false.
  useEffect(() => {
    if (!selectedTruck || !driveByEnabled) {
      lastNearestRef.current = null;
      return;
    }
    let nearestId: string | null = null;
    let nearestDist = Infinity;
    for (const cam of allCams) {
      const d = haversineKm(selectedTruck, cam);
      if (d < nearestDist) { nearestDist = d; nearestId = cam.id; }
    }
    const last = lastNearestRef.current;
    if (last && last.truckId === selectedTruck.id && nearestId && nearestId !== last.camId && nearestDist < 0.5) {
      const cam = allCams.find((c) => c.id === nearestId);
      if (cam) {
        setDriveBys((prev) => [
          { id: `${Date.now()}-${selectedTruck.id}-${nearestId}`, truckId: selectedTruck.id, camId: nearestId, camDescription: cam.description, ts: Date.now(), distanceKm: nearestDist },
          ...prev,
        ].slice(0, 5));
      }
    }
    lastNearestRef.current = { truckId: selectedTruck.id, camId: nearestId };
  }, [selectedTruck?.id, selectedTruck?.lat, selectedTruck?.lng, driveByEnabled]);

  // ─── Combined cam list (public from API + company static) ───────
  const allCams = useMemo(() => [...publicCams, ...COMPANY_CAMS], [publicCams]);

  // ─── Filter + sort ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allCams.filter((c) => {
      if (filterSource !== 'all' && c.source !== filterSource) return false;
      if (onlineOnly && errors[c.id]) return false;
      if (liveOnly && !c.hasLiveStream) return false;
      if (q) {
        const hay = `${c.description} ${c.state} ${c.country ?? ''} ${c.format}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      if (selectedTruck) {
        const da = haversineKm(selectedTruck, a);
        const db = haversineKm(selectedTruck, b);
        return da - db;
      }
      return 0;
    });
  }, [search, filterSource, onlineOnly, liveOnly, errors, selectedTruck]);

  const [showAllPublic, setShowAllPublic] = useState(false);
  const publicCamsFiltered = filtered.filter((c) => c.source === 'public');
  // Cap rendering to PUBLIC_CAM_RENDER_LIMIT unless the user opts in via "Show all".
  // This prevents 3,000+ tiles from spawning thousands of useLiveImage/useHlsStream
  // hooks and freezing the browser.
  const publicCamsRendered = showAllPublic
    ? publicCamsFiltered
    : publicCamsFiltered.slice(0, PUBLIC_CAM_RENDER_LIMIT);
  const companyCamsFiltered = filtered.filter((c) => c.source === 'company');
  const activeCam = activeCamId ? allCams.find((c) => c.id === activeCamId) : null;
  const activeCamIndex = activeCam ? filtered.indexOf(activeCam) : -1;

  // ─── Modal navigation ──────────────────────────────────────────
  const goPrev = useCallback(() => {
    if (activeCamIndex <= 0) return;
    setActiveCamId(filtered[activeCamIndex - 1].id);
  }, [activeCamIndex, filtered]);
  const goNext = useCallback(() => {
    if (activeCamIndex < 0 || activeCamIndex >= filtered.length - 1) return;
    setActiveCamId(filtered[activeCamIndex + 1].id);
  }, [activeCamIndex, filtered]);

  useEffect(() => {
    if (!activeCam) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveCamId(null);
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeCam, goPrev, goNext]);

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-amber-400" />
          <h3 className="text-[10px] uppercase tracking-[0.25em] text-slate-300 font-bold">
            Live CCTV
          </h3>
          <span className="text-[8px] text-slate-500 font-mono normal-case tracking-normal ml-1">
            (US cams refresh ~5min)
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setDriveByEnabled(!driveByEnabled)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] uppercase tracking-widest font-bold transition border ${
              driveByEnabled
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_8px_rgba(251,191,36,0.2)]'
                : 'bg-slate-900/40 text-slate-500 border-slate-800'
            }`}
            title={driveByEnabled ? 'Drive-by detection ON — click to disable' : 'Drive-by detection OFF — click to enable'}
          >
            <Power className="w-2.5 h-2.5" />
            <span>Drive-by {driveByEnabled ? 'on' : 'off'}</span>
          </button>
          <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5">
            {caltransLoading ? (
              <>
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                <span>loading...</span>
              </>
            ) : summary ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{summary.total.toLocaleString()} cams</span>
                {summary.withLiveStream > 0 && (
                  <span className="text-rose-400">· {summary.withLiveStream} live</span>
                )}
              </>
            ) : null}
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
        <input
          type="text"
          placeholder="Search 3,304 cams by name, route, or district…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-slate-950/60 border border-slate-800 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
        />
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <button
          onClick={() => setFilterSource('all')}
          className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-widest font-bold transition border ${
            filterSource === 'all'
              ? 'bg-slate-700 text-slate-200 border-slate-600'
              : 'bg-slate-900/40 text-slate-500 border-slate-800 hover:text-slate-300'
          }`}
        >
          All ({allCams.length})
        </button>
        {(['public', 'company'] as CamSource[]).map((s) => {
          const m = SOURCE_META[s];
          const cnt = allCams.filter((c) => c.source === s).length;
          const isActive = filterSource === s;
          return (
            <button
              key={s}
              onClick={() => setFilterSource(s)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] uppercase tracking-widest font-bold transition border ${
                isActive
                  ? `${m.bg} ${m.color} ${m.border}`
                  : 'bg-slate-900/40 text-slate-500 border-slate-800 hover:text-slate-300'
              }`}
            >
              {m.icon}
              <span>{m.label}</span>
              <span className="opacity-60">·{cnt}</span>
            </button>
          );
        })}
        {allCams.filter((c) => c.hasLiveStream).length > 0 && (
          <button
            onClick={() => setLiveOnly(!liveOnly)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] uppercase tracking-widest font-bold transition border ${
              liveOnly
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : 'bg-slate-900/40 text-rose-400/60 border-rose-500/20 hover:text-rose-300'
            }`}
            title="Show only cameras with live HLS streams"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            <span>live · {allCams.filter((c) => c.hasLiveStream).length}</span>
          </button>
        )}
        <button
          onClick={() => setOnlineOnly(!onlineOnly)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] uppercase tracking-widest font-bold transition border ml-auto ${
            onlineOnly
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-slate-900/40 text-slate-500 border-slate-800 hover:text-slate-300'
          }`}
        >
          {onlineOnly ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
          <span>Online</span>
        </button>
      </div>

      {/* Selected truck distance hint */}
      {selectedTruck && (
        <div className="mb-2 flex items-center gap-1.5 text-[9px] text-slate-400 bg-slate-900/50 px-2 py-1 rounded">
          <Truck className="w-2.5 h-2.5 text-amber-400" />
          <span>Sorted by distance to <span className="text-amber-300 font-mono">{selectedTruck.id}</span></span>
        </div>
      )}

      {/* Drive-by log (when truck is selected) */}
      {selectedTruck && driveBys.length > 0 && (
        <div className="mb-2 p-2 rounded border border-amber-500/40 bg-amber-500/10">
          <div className="flex items-center gap-1.5 text-[9px] text-amber-300 font-bold uppercase tracking-widest mb-1">
            <Crosshair className="w-2.5 h-2.5" />
            <span>Drive-by · {selectedTruck.id}</span>
          </div>
          <div className="space-y-1">
            {driveBys.slice(0, 3).map((d) => (
              <div key={d.id} className="text-[9px] text-amber-200/90 flex items-center justify-between gap-2">
                <span className="truncate">passed <span className="font-mono">{d.camDescription}</span></span>
                <span className="text-amber-400/70 font-mono whitespace-nowrap">
                  {Math.round(d.distanceKm * 1000)}m · {Math.round((Date.now() - d.ts) / 1000)}s ago
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Public section */}
      {publicCamsFiltered.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Globe className="w-3 h-3 text-cyan-400" />
            <span className="text-[9px] uppercase tracking-widest font-bold text-cyan-300">Public · Caltrans</span>
            <span className="text-[9px] text-slate-500">
              (showing {publicCamsRendered.length} of {publicCamsFiltered.length})
            </span>
            {!showAllPublic && publicCamsFiltered.length > PUBLIC_CAM_RENDER_LIMIT && (
              <button
                onClick={() => setShowAllPublic(true)}
                className="ml-auto px-1.5 py-0.5 rounded text-[8px] uppercase tracking-widest font-bold border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                title={`Render all ${publicCamsFiltered.length.toLocaleString()} tiles (slow)`}
              >
                show all ⚠
              </button>
            )}
            {showAllPublic && publicCamsFiltered.length > PUBLIC_CAM_RENDER_LIMIT && (
              <button
                onClick={() => setShowAllPublic(false)}
                className="ml-auto px-1.5 py-0.5 rounded text-[8px] uppercase tracking-widest font-bold border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                collapse
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {publicCamsRendered.map((cam) => (
              <CamTile
                key={cam.id} cam={cam}
                errors={errors} setErrors={setErrors}
                selectedTruck={selectedTruck}
                onOpen={setActiveCamId}
                intervalMs={300000}
              />
            ))}
          </div>
        </div>
      )}

      {/* Company section */}
      {companyCamsFiltered.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Building2 className="w-3 h-3 text-amber-400" />
            <span className="text-[9px] uppercase tracking-widest font-bold text-amber-300">Company · Aegis</span>
            <span className="text-[9px] text-slate-500">({companyCamsFiltered.length})</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {companyCamsFiltered.map((cam) => (
              <CamTile
                key={cam.id} cam={cam}
                errors={errors} setErrors={setErrors}
                selectedTruck={selectedTruck}
                onOpen={setActiveCamId}
                intervalMs={300000}
              />
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-[10px] text-slate-500 py-4 text-center">
          No cameras match your filter
        </div>
      )}

      <div className="mt-3 text-[9px] text-slate-500 text-center flex items-center justify-center gap-1.5">
        <span>Refreshes every 4s · click any tile to open</span>
      </div>

      {/* ── Modal lightbox ────────────────────────────────────── */}
      <AnimatePresence>
        {activeCam && (
          <CamModal
            cam={activeCam}
            filtered={filtered}
            index={activeCamIndex}
            onClose={() => setActiveCamId(null)}
            onPrev={goPrev}
            onNext={goNext}
            selectedTruck={selectedTruck}
            onOpenInGlobe={onOpenInGlobe}
            intervalMs={300000}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── CamTile — individual camera thumbnail ────────────────────────────
function CamTile({
  cam, errors, setErrors, selectedTruck, onOpen, intervalMs,
}: {
  cam: Cam;
  errors: Record<string, boolean>;
  setErrors: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  selectedTruck: FleetCoord;
  onOpen: (id: string) => void;
  intervalMs: number;
}) {
  // Lazy-mount: only run live hooks once the tile is in viewport.
  // This is what prevents 3,000 tiles from spawning 3,000 hls.js instances.
  const [tileRef, inView] = useInView<HTMLButtonElement>("300px");
  const { src, err, stale, lastUpdate } = useLiveImage(
    inView ? cam.url : "",
    inView ? intervalMs : 0,
    inView && cam.directImage
  );
  const { videoRef, err: hlsErr } = useHlsStream(
    inView ? cam.url : "",
    inView && cam.format === 'M3U8' && cam.directImage === false
  );
  const isErr = err || errors[cam.id] || hlsErr;
  const isStale = stale && !isErr;
  const meta = SOURCE_META[cam.source];
  const distKm = selectedTruck ? haversineKm(selectedTruck, cam) : null;
  const secondsSinceUpdate = lastUpdate ? Math.round((Date.now() - lastUpdate) / 1000) : null;

  return (
    <button
      ref={tileRef}
      onClick={() => onOpen(cam.id)}
      className={`group relative block rounded overflow-hidden border bg-slate-950 transition text-left ${
        selectedTruck && distKm !== null && distKm < 50
          ? 'border-amber-500/50 shadow-[0_0_12px_rgba(251,191,36,0.15)]'
          : 'border-slate-800 hover:border-amber-500/40'
      }`}
    >
      <div className="relative aspect-video bg-slate-950 overflow-hidden">
        {!inView ? (
          <div className="absolute inset-0 flex items-center justify-center text-[9px] text-slate-600">
            <Camera className="w-3 h-3" />
          </div>
        ) : isErr ? (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500">
            <WifiOff className="w-3 h-3 mr-1" /> offline
          </div>
        ) : cam.format === 'M3U8' ? (
          // HLS live stream
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            controls={false}
            className="w-full h-full object-cover"
          />
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={cam.description}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            onError={() => setErrors((prev) => ({ ...prev, [cam.id]: true }))}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[9px] text-slate-500">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> loading
          </div>
        )}

        {/* Source badge */}
        <div className={`absolute top-1 left-1 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 border ${meta.border} text-[8px] font-mono ${meta.color}`}>
          {meta.icon}
          <span className="uppercase tracking-widest font-bold">{meta.label}</span>
        </div>

        {/* State badge */}
        <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/70 border border-slate-700 text-[8px] font-mono text-slate-300">
          {cam.state.slice(0, 2).toUpperCase()}
        </div>

        {/* Distance badge (when close to a selected truck) */}
        {distKm !== null && distKm < 100 && (
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-amber-500/90 text-[8px] font-mono text-slate-900 font-bold">
            {formatDistance(distKm)} {selectedTruck?.id}
          </div>
        )}

        {/* Live / stale / offline badge */}
        {lastUpdate && !isErr && cam.format !== 'M3U8' && (
          <div className={`absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 border text-[8px] font-mono flex items-center gap-1 ${
            isStale
              ? 'border-amber-500/40 text-amber-300'
              : 'border-emerald-500/40 text-emerald-300'
          }`}>
            <span className={`w-1 h-1 rounded-full ${isStale ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
            <span>{isStale ? 'stale' : (secondsSinceUpdate !== null ? `${secondsSinceUpdate}s` : 'live')}</span>
          </div>
        )}
        {/* HLS stream badge — always shown when the cam has a live stream */}
        {cam.format === 'M3U8' && !isErr && (
          <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 border border-rose-500/40 text-[8px] font-mono flex items-center gap-1 text-rose-300">
            <span className="w-1 h-1 rounded-full bg-rose-400 animate-pulse" />
            <span>STREAM</span>
          </div>
        )}
      </div>
      <div className="p-1.5">
        <div className="text-[10px] text-slate-200 font-medium leading-tight truncate">
          {cam.description}
        </div>
        <div className="text-[9px] text-slate-500 mt-0.5 flex items-center gap-1">
          <MapPin className="w-2.5 h-2.5" />
          <span className="truncate">{cam.lat.toFixed(2)}, {cam.lng.toFixed(2)}</span>
        </div>
      </div>
    </button>
  );
}

// ─── CamModal — full-screen lightbox ──────────────────────────────────
function CamModal({
  cam, filtered, index, onClose, onPrev, onNext, selectedTruck, onOpenInGlobe, intervalMs,
}: {
  cam: Cam;
  filtered: Cam[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  selectedTruck: FleetCoord;
  onOpenInGlobe?: (cam: { lat: number; lng: number; description: string }) => void;
  intervalMs: number;
}) {
  const { src, err, stale, lastUpdate } = useLiveImage(cam.url, intervalMs, cam.directImage);
  const { videoRef, err: hlsErr } = useHlsStream(cam.url, cam.format === 'M3U8' && cam.directImage === false);
  const isErr = err || hlsErr;
  // Human-readable live label (avoids JSX parser confusion with nested ternaries)
  const liveLabel = useMemo(() => {
    if (stale) return 'STALE \xe2\x80\x94 upstream not updating';
    if (cam.format === 'M3U8') return 'LIVE \xc2\xb7 HLS stream';
    const sec = intervalMs / 1000;
    return 'LIVE \xc2\xb7 ' + (sec < 90 ? sec + 's refresh' : (sec / 60) + 'min refresh');
  }, [stale, cam.format, intervalMs]);
  const meta = SOURCE_META[cam.source];
  const distKm = selectedTruck ? haversineKm(selectedTruck, cam) : null;
  const secondsSinceUpdate = lastUpdate ? Math.round((Date.now() - lastUpdate) / 1000) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[600] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="relative w-full max-w-4xl bg-slate-950 border border-amber-500/30 rounded-lg shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Camera className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-100 truncate">{cam.description}</div>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded ${meta.bg} ${meta.color} border ${meta.border} flex items-center gap-1`}>
                  {meta.icon}
                  {meta.label}
                </span>
                <span>{cam.state}{cam.country ? `, ${cam.country}` : ''}</span>
                <span className="font-mono">{cam.lat.toFixed(4)}, {cam.lng.toFixed(4)}</span>
                {cam.direction && <span>· {cam.direction}-facing</span>}
                {secondsSinceUpdate !== null && !isErr && (
                  <span className="text-emerald-400 font-mono">· updated {secondsSinceUpdate}s ago</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onOpenInGlobe && (
              <button
                onClick={() => { onOpenInGlobe({ lat: cam.lat, lng: cam.lng, description: cam.description }); onClose(); }}
                className="px-2 py-1 rounded text-[10px] text-slate-300 hover:text-amber-300 border border-slate-700 hover:border-amber-500/40 transition flex items-center gap-1"
                title="Fly the map to this camera"
              >
                <Crosshair className="w-3 h-3" />
                <span>Globe</span>
              </button>
            )}
            <a
              href={cam.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-amber-300 border border-slate-700 hover:border-amber-500/40 transition flex items-center gap-1"
              title="Open original feed"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Original</span>
            </a>
            <button
              onClick={onClose}
              className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 transition"
              title="Close (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="relative bg-black aspect-video">
          {isErr ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
              <div className="text-center">
                <WifiOff className="w-8 h-8 mx-auto mb-2" />
                <div>Camera offline</div>
              </div>
            </div>
          ) : cam.format === 'M3U8' ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              controls
              className="w-full h-full object-contain"
            />
          ) : src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={cam.description}
              className="w-full h-full object-contain"
              onError={() => {}}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
              <RefreshCw className="w-5 h-5 mr-2 animate-spin" /> loading…
            </div>
          )}

          {/* Live / stale indicator */}
          {!isErr && (
            <div className={`absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/70 border text-[9px] font-mono ${
              stale
                ? 'border-amber-500/40 text-amber-300'
                : 'border-emerald-500/40 text-emerald-300'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${stale ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
              {stale ? 'STALE — upstream not updating' : (cam.format === 'M3U8' ? 'LIVE · HLS stream' : liveLabel)}
              {secondsSinceUpdate !== null && <span className="opacity-70">· {secondsSinceUpdate}s</span>}
            </div>
          )}

          {/* Prev/next */}
          {index > 0 && (
            <button
              onClick={onPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/90 border border-slate-700 text-slate-200 transition"
              title="Previous (←)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {index >= 0 && index < filtered.length - 1 && (
            <button
              onClick={onNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/90 border border-slate-700 text-slate-200 transition"
              title="Next (→)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {/* Position counter */}
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 border border-slate-700 text-[9px] text-slate-400 font-mono">
            {index + 1} / {filtered.length}
          </div>
        </div>

        {/* Footer */}
        {selectedTruck && (
          <div className="p-3 border-t border-slate-800 bg-slate-900/50 text-[10px] text-slate-300 flex items-center gap-2">
            <Truck className="w-3 h-3 text-amber-400" />
            <span>
              <span className="text-amber-300 font-mono">{selectedTruck.id}</span> is{' '}
              <span className="font-bold text-slate-100">
                {distKm !== null ? formatDistance(distKm) : '—'}
              </span>{' '}
              from this camera
            </span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}