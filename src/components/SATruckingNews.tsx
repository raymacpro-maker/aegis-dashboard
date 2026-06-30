'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ExternalLink, Radio, Loader2, Locate } from 'lucide-react';

type Region = 'all' | 'national' | 'gauteng' | 'kzn' | 'western-cape' | 'eastern-cape' | 'mpumalanga' | 'limpopo';

type NewsItem = {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  ageHours: number;
  source: string;
  region: Exclude<Region, 'all'>;
  regionLabel: string;
  regionCity: string;
  regionLat: number;
  regionLng: number;
};

type RegionInfo = { key: Exclude<Region, 'all'>; label: string; city: string; lat: number; lng: number };

type Counts = Record<Exclude<Region, 'all'>, number>;

const REGION_COLORS: Record<Exclude<Region, 'all'>, { bg: string; text: string; border: string; dot: string }> = {
  'national':     { bg: 'bg-amber-500/10',   text: 'text-amber-300',   border: 'border-amber-500/30',   dot: 'bg-amber-400' },
  'gauteng':      { bg: 'bg-blue-500/10',    text: 'text-blue-300',    border: 'border-blue-500/30',    dot: 'bg-blue-400' },
  'kzn':          { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  'western-cape': { bg: 'bg-purple-500/10',  text: 'text-purple-300',  border: 'border-purple-500/30',  dot: 'bg-purple-400' },
  'eastern-cape': { bg: 'bg-cyan-500/10',    text: 'text-cyan-300',    border: 'border-cyan-500/30',    dot: 'bg-cyan-400' },
  'mpumalanga':   { bg: 'bg-orange-500/10',  text: 'text-orange-300',  border: 'border-orange-500/30',  dot: 'bg-orange-400' },
  'limpopo':      { bg: 'bg-rose-500/10',    text: 'text-rose-300',    border: 'border-rose-500/30',    dot: 'bg-rose-400' },
};

function timeAgo(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function freshDot(hours: number): string {
  if (hours < 1) return 'bg-emerald-400';
  if (hours < 6) return 'bg-amber-400';
  if (hours < 24) return 'bg-orange-400';
  return 'bg-slate-500';
}

const STORAGE_KEY = 'aegis.sa-trucking-news.region';

export default function SATruckingNews() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [activeRegion, setActiveRegion] = useState<Region>('all');
  const [loading, setLoading] = useState(true);
  const [geoState, setGeoState] = useState<'idle' | 'locating' | 'error'>('idle');

  // Load region from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Region | null;
      if (saved) setActiveRegion(saved);
    } catch {}
  }, []);

  // Save region when it changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, activeRegion);
    } catch {}
  }, [activeRegion]);

  // Fetch news
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = activeRegion === 'all'
      ? '/api/sa-trucking-news'
      : `/api/sa-trucking-news?region=${activeRegion}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setItems(data.items || []);
        setCounts(data.counts || null);
        setRegions(data.regions || []);
      })
      .catch((e) => console.error('SA trucking news fetch failed', e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeRegion]);

  // Browser geolocation → snap to nearest region
  function useGeolocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoState('error');
      return;
    }
    setGeoState('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (regions.length === 0) { setGeoState('error'); return; }
        // Find nearest region by haversine
        let nearest: RegionInfo = regions[0];
        let minD = Infinity;
        for (const r of regions) {
          const d = Math.hypot(r.lat - latitude, r.lng - longitude);
          if (d < minD) { minD = d; nearest = r; }
        }
        setActiveRegion(nearest.key);
        setGeoState('idle');
      },
      () => setGeoState('error'),
      { timeout: 8000, maximumAge: 60_000 },
    );
  }

  const activeLabel = activeRegion === 'all' ? 'All SA' : regions.find((r) => r.key === activeRegion)?.label || 'SA';
  const activeCity = activeRegion === 'all' ? null : regions.find((r) => r.key === activeRegion)?.city;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-amber-400" />
          <h3 className="text-[10px] uppercase tracking-[0.25em] text-slate-300 font-bold">
            SA Trucking News
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={useGeolocation}
            disabled={geoState === 'locating'}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-slate-500 hover:text-amber-300 border border-slate-800 hover:border-amber-500/40 transition disabled:opacity-50"
            title="Use my location"
          >
            {geoState === 'locating' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Locate className="w-2.5 h-2.5" />}
            <span>near me</span>
          </button>
        </div>
      </div>

      {/* Region chips */}
      <div className="flex flex-wrap gap-1 mb-3">
        <button
          onClick={() => setActiveRegion('all')}
          className={`px-2 py-1 rounded text-[9px] uppercase tracking-widest font-bold transition border ${
            activeRegion === 'all'
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-slate-900/40 text-slate-500 border-slate-800 hover:text-slate-300'
          }`}
        >
          All SA
        </button>
        {regions.map((r) => {
          const c = REGION_COLORS[r.key];
          const cnt = counts?.[r.key] || 0;
          const isActive = activeRegion === r.key;
          return (
            <button
              key={r.key}
              onClick={() => setActiveRegion(r.key)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] uppercase tracking-widest font-bold transition border ${
                isActive
                  ? `${c.bg} ${c.text} ${c.border}`
                  : `bg-slate-900/40 text-slate-500 border-slate-800 hover:${c.text}`
              }`}
              title={`${r.label} (${r.city})`}
            >
              <span className={`w-1 h-1 rounded-full ${c.dot}`} />
              <span>{r.city}</span>
              {cnt > 0 && <span className="text-[8px] opacity-70">·{cnt}</span>}
            </button>
          );
        })}
      </div>

      {/* Active region header */}
      <div className="flex items-center gap-1.5 mb-2 text-[9px] text-slate-500">
        <MapPin className="w-2.5 h-2.5" />
        <span className="uppercase tracking-widest">{activeLabel}</span>
        {activeCity && <span>· {activeCity}</span>}
        {counts && activeRegion !== 'all' && (
          <span className="text-slate-600">
            · {items.length} stories ({counts[activeRegion]} local + {counts.national} national)
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-[10px] text-slate-500 py-3 text-center">loading SA trucking news…</div>
      ) : items.length === 0 ? (
        <div className="text-[10px] text-slate-500 py-3 text-center">
          No {activeLabel} stories in the last 48h
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeRegion}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="space-y-1.5 max-h-80 overflow-y-auto pr-1"
          >
            {items.map((n) => {
              const meta = REGION_COLORS[n.region];
              const fresh = freshDot(n.ageHours);
              return (
                <a
                  key={n.id}
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block p-2 rounded border ${meta.border} ${meta.bg} hover:opacity-90 hover:border-amber-500/40 transition`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${fresh}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-slate-100 leading-snug line-clamp-2">
                        {n.title.replace(/ - [^-]+$/, '')}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-[9px]">
                        <span className={`uppercase tracking-widest font-bold ${meta.text}`}>
                          {n.regionCity}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-400 truncate max-w-[100px]" title={n.source}>
                          {n.source}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-500">{timeAgo(n.ageHours)}</span>
                        <ExternalLink className="w-2.5 h-2.5 ml-auto text-slate-600 flex-shrink-0" />
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
          </motion.div>
        </AnimatePresence>
      )}

      <div className="mt-2 text-[9px] text-slate-500 text-center flex items-center justify-center gap-1.5">
        <Radio className="w-2.5 h-2.5" />
        SATrucker + Truck &amp; Freight · last 48h · refresh 5m
      </div>
    </div>
  );
}