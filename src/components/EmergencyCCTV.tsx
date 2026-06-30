'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, ExternalLink, RefreshCw, MapPin, X, ChevronLeft, ChevronRight,
  Search, Globe, Building2, Wifi, WifiOff, Truck,
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
  /** True if the URL is verified to return 200 as a direct image (works in <img>). */
  directImage: boolean;
};

// ── PUBLIC cameras (verified working direct-image feeds) ─────────────
// All Caltrans District 9 — Eastern Sierra. Confirmed HTTP 200.
// These are the same feeds from the original EmergencyCCTV.
const PUBLIC_CAMS: Cam[] = [
  {
    id: 'pub-sr203-mammoth',
    source: 'public',
    state: 'California', country: 'US',
    description: 'SR-203 · Mammoth Mountain',
    lat: 37.64111, lng: -118.91848, direction: 'N',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/sr203mammothmountain/sr203mammothmountain.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true,
  },
  {
    id: 'pub-us395-conway',
    source: 'public',
    state: 'California', country: 'US',
    description: 'US-395 · Conway Summit',
    lat: 38.08782, lng: -119.181251, direction: 'N',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us395conwaysummit/us395conwaysummit.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true,
  },
  {
    id: 'pub-us6-stateline',
    source: 'public',
    state: 'California', country: 'US',
    description: 'US-6 · State Line',
    lat: 37.84225, lng: -118.47842, direction: 'E',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us6stateline/us6stateline.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true,
  },
  {
    id: 'pub-us395-crestview',
    source: 'public',
    state: 'California', country: 'US',
    description: 'US-395 · Crestview',
    lat: 37.75146, lng: -118.98329, direction: 'N',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us395crestview/us395crestview.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true,
  },
  {
    id: 'pub-i80-donner',
    source: 'public',
    state: 'California', country: 'US',
    description: 'I-80 · Donner Pass',
    lat: 39.3163, lng: -120.3300, direction: 'W',
    url: 'https://cwwp2.dot.ca.gov/data/d3/cctv/image/i80donnerpass/i80donnerpass.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true,
  },
  {
    id: 'pub-i5-castella',
    source: 'public',
    state: 'California', country: 'US',
    description: 'I-5 · Castella',
    lat: 41.1394, lng: -122.3097, direction: 'N',
    url: 'https://cwwp2.dot.ca.gov/data/d2/cctv/image/i5castella/i5castella.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true,
  },
];

// ── COMPANY cameras (placeholder until Compass streams are wired) ───
// These represent the future state: depot cameras + driver-phone live
// streams from the Compass Android app. For now we show 3 fake entries
// so the UI demonstrates the concept and users see what to expect.
const COMPANY_CAMS: Cam[] = [
  {
    id: 'co-yard-austin',
    source: 'company',
    state: 'Texas', country: 'US',
    description: 'Aegis Yard · Austin Depot (North Gate)',
    lat: 30.2672, lng: -97.7431, direction: 'S',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/sr203mammothmountain/sr203mammothmountain.jpg', // placeholder until depot cameras wired
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true,
  },
  {
    id: 'co-t47-cab',
    source: 'company',
    state: 'Texas', country: 'US',
    description: 'T-47 · Forward-facing cab cam (Sofia Reyes)',
    lat: 30.27, lng: -97.74, direction: 'N',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us395conwaysummit/us395conwaysummit.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true,
  },
  {
    id: 'co-yard-roundrock',
    source: 'company',
    state: 'Texas', country: 'US',
    description: 'Aegis Yard · Round Rock (Loading Bay 3)',
    lat: 30.5083, lng: -97.8203, direction: 'W',
    url: 'https://cwwp2.dot.ca.gov/data/d9/cctv/image/us6stateline/us6stateline.jpg',
    format: 'IMAGE_STREAM', encoding: 'H.264', directImage: true,
  },
];

const ALL_CAMS = [...PUBLIC_CAMS, ...COMPANY_CAMS];

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

export default function EmergencyCCTV({
  selectedTruck = null,
}: {
  /** Optional selected truck — used for distance overlay on each tile. */
  selectedTruck?: FleetCoord;
}) {
  // ─── State ──────────────────────────────────────────────────────
  const [tick, setTick] = useState(0);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState<{ total: number; byState: Record<string, number> } | null>(null);
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState<'all' | CamSource>('all');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [activeCamId, setActiveCamId] = useState<string | null>(null);

  // ─── Effects ───────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/cameras?summary=1')
      .then((r) => r.json())
      .then((d) => setSummary({ total: d.total, byState: d.byState }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 4000);
    return () => clearInterval(iv);
  }, []);

  // ─── Filter + sort ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return ALL_CAMS.filter((c) => {
      if (filterSource !== 'all' && c.source !== filterSource) return false;
      if (onlineOnly && errors[c.id]) return false;
      if (q) {
        const hay = `${c.description} ${c.state} ${c.country ?? ''} ${c.format}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // Sort by distance to selected truck if available
      if (selectedTruck) {
        const da = haversineKm(selectedTruck, a);
        const db = haversineKm(selectedTruck, b);
        return da - db;
      }
      return 0;
    });
  }, [search, filterSource, onlineOnly, errors, selectedTruck]);

  const publicCams = filtered.filter((c) => c.source === 'public');
  const companyCams = filtered.filter((c) => c.source === 'company');
  const activeCam = activeCamId ? ALL_CAMS.find((c) => c.id === activeCamId) : null;
  const activeCamIndex = activeCam ? filtered.indexOf(activeCam) : -1;

  // ─── Modal navigation ──────────────────────────────────────────
  function goPrev() {
    if (activeCamIndex <= 0) return;
    setActiveCamId(filtered[activeCamIndex - 1].id);
  }
  function goNext() {
    if (activeCamIndex < 0 || activeCamIndex >= filtered.length - 1) return;
    setActiveCamId(filtered[activeCamIndex + 1].id);
  }

  // ESC + arrow keys when modal open
  useEffect(() => {
    if (!activeCam) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveCamId(null);
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeCam, activeCamIndex, filtered.length]);

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
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {summary ? `${summary.total.toLocaleString()} public cams` : 'loading...'}
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
        <input
          type="text"
          placeholder="Search cameras, roads, cities..."
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
          All ({ALL_CAMS.length})
        </button>
        {(['public', 'company'] as CamSource[]).map((s) => {
          const m = SOURCE_META[s];
          const cnt = ALL_CAMS.filter((c) => c.source === s).length;
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

      {/* Public section */}
      {publicCams.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Globe className="w-3 h-3 text-cyan-400" />
            <span className="text-[9px] uppercase tracking-widest font-bold text-cyan-300">Public · Caltrans</span>
            <span className="text-[9px] text-slate-500">({publicCams.length})</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {publicCams.map((cam) => renderCamTile(cam, tick, errors, setErrors, selectedTruck, setActiveCamId))}
          </div>
        </div>
      )}

      {/* Company section */}
      {companyCams.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Building2 className="w-3 h-3 text-amber-400" />
            <span className="text-[9px] uppercase tracking-widest font-bold text-amber-300">Company · Aegis</span>
            <span className="text-[9px] text-slate-500">({companyCams.length})</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {companyCams.map((cam) => renderCamTile(cam, tick, errors, setErrors, selectedTruck, setActiveCamId))}
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[600] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setActiveCamId(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="relative w-full max-w-4xl bg-slate-950 border border-amber-500/30 rounded-lg shadow-2xl overflow-hidden"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-900/80">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Camera className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-100 truncate">{activeCam.description}</div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                      <span className={`px-1.5 py-0.5 rounded ${SOURCE_META[activeCam.source].bg} ${SOURCE_META[activeCam.source].color} border ${SOURCE_META[activeCam.source].border} flex items-center gap-1`}>
                        {SOURCE_META[activeCam.source].icon}
                        {SOURCE_META[activeCam.source].label}
                      </span>
                      <span>{activeCam.state}{activeCam.country ? `, ${activeCam.country}` : ''}</span>
                      <span className="font-mono">{activeCam.lat.toFixed(4)}, {activeCam.lng.toFixed(4)}</span>
                      {activeCam.direction && <span>· {activeCam.direction}-facing</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <a
                    href={activeCam.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-amber-300 border border-slate-700 hover:border-amber-500/40 transition flex items-center gap-1"
                    title="Open original feed"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Original</span>
                  </a>
                  <button
                    onClick={() => setActiveCamId(null)}
                    className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 transition"
                    title="Close (ESC)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Modal body — big video/image */}
              <div className="relative bg-black aspect-video">
                {errors[activeCam.id] ? (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
                    <div className="text-center">
                      <WifiOff className="w-8 h-8 mx-auto mb-2" />
                      <div>Camera offline</div>
                    </div>
                  </div>
                ) : activeCam.directImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${activeCam.url}?_t=${tick}`}
                    alt={activeCam.description}
                    className="w-full h-full object-contain"
                    onError={() => setErrors((e) => ({ ...e, [activeCam.id]: true }))}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
                    Format {activeCam.format} not playable inline — <a href={activeCam.url} target="_blank" rel="noopener noreferrer" className="text-amber-400 ml-1">open original</a>
                  </div>
                )}

                {/* Live indicator */}
                <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/70 border border-emerald-500/40 text-[9px] text-emerald-300 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE · 4s refresh
                </div>

                {/* Prev/next arrows */}
                {activeCamIndex > 0 && (
                  <button
                    onClick={goPrev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/90 border border-slate-700 text-slate-200 transition"
                    title="Previous (←)"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                {activeCamIndex >= 0 && activeCamIndex < filtered.length - 1 && (
                  <button
                    onClick={goNext}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/90 border border-slate-700 text-slate-200 transition"
                    title="Next (→)"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )}

                {/* Position counter */}
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 border border-slate-700 text-[9px] text-slate-400 font-mono">
                  {activeCamIndex + 1} / {filtered.length}
                </div>
              </div>

              {/* Modal footer — distance to selected truck */}
              {selectedTruck && (
                <div className="p-3 border-t border-slate-800 bg-slate-900/50 text-[10px] text-slate-300 flex items-center gap-2">
                  <Truck className="w-3 h-3 text-amber-400" />
                  <span>
                    <span className="text-amber-300 font-mono">{selectedTruck.id}</span> is{' '}
                    <span className="font-bold text-slate-100">
                      {formatDistance(haversineKm(selectedTruck, activeCam))}
                    </span>{' '}
                    from this camera
                  </span>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Tile renderer (extracted for re-use in both sections) ──────────
function renderCamTile(
  cam: Cam,
  tick: number,
  errors: Record<string, boolean>,
  setErrors: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void,
  selectedTruck: FleetCoord,
  setActiveCamId: (id: string) => void,
) {
  const src = cam.directImage ? `${cam.url}?_t=${tick}` : cam.url;
  const isErr = errors[cam.id];
  const meta = SOURCE_META[cam.source];
  const distKm = selectedTruck ? haversineKm(selectedTruck, cam) : null;
  return (
    <button
      key={cam.id}
      onClick={() => setActiveCamId(cam.id)}
      className={`group relative block rounded overflow-hidden border bg-slate-950 transition text-left ${
        selectedTruck && distKm !== null && distKm < 50
          ? 'border-amber-500/50 shadow-[0_0_12px_rgba(251,191,36,0.15)]'
          : 'border-slate-800 hover:border-amber-500/40'
      }`}
    >
      <div className="relative aspect-video bg-slate-950 overflow-hidden">
        {isErr ? (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-500">
            <WifiOff className="w-3 h-3 mr-1" /> offline
          </div>
        ) : cam.directImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={cam.description}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            onError={() => setErrors((prev) => ({ ...prev, [cam.id]: true }))}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[9px] text-slate-500">
            {cam.format} — click to open
          </div>
        )}

        {/* Source badge (top-left) */}
        <div className={`absolute top-1 left-1 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 border ${meta.border} text-[8px] font-mono ${meta.color}`}>
          {meta.icon}
          <span className="uppercase tracking-widest font-bold">{meta.label}</span>
        </div>

        {/* State badge (top-right) */}
        <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/70 border border-slate-700 text-[8px] font-mono text-slate-300">
          {cam.state.slice(0, 2).toUpperCase()}
        </div>

        {/* Distance badge (bottom-right, only if truck selected + close) */}
        {distKm !== null && distKm < 100 && (
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-amber-500/90 text-[8px] font-mono text-slate-900 font-bold">
            {formatDistance(distKm)} {selectedTruck?.id}
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