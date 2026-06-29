'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import AegisLogo from '@/components/AegisLogo';
import { ArrowLeft, Truck, Flame, CloudRain, Search, X, Plane, Ship, Home } from 'lucide-react';
import type { TruckPin, STATUS_COLORS } from './Globe2D.types';

const STATUS = {
  moving: '#10b981',
  idle: '#f59e0b',
  maintenance: '#3b82f6',
  offline: '#64748b',
} as const;

// Equirectangular projection: lon [-180,180] → x [0,W], lat [-90,90] → y [0,H]
function project(lng: number, lat: number, W: number, H: number) {
  const x = ((lng + 180) / 360) * W;
  const y = ((90 - lat) / 180) * H;
  return { x, y };
}

const COUNTRY_PATHS = [
  // Simplified continent silhouettes (approximate, used for visual context only)
  // All coordinates are in [lat, lng] pairs.
  'M158,82 L220,80 L245,72 L268,75 L290,82 L300,95 L295,110 L278,118 L255,118 L240,128 L218,138 L195,142 L170,135 L150,118 L142,100 Z', // North America
  'M210,150 L240,148 L260,160 L270,180 L268,205 L260,225 L250,238 L235,245 L218,242 L208,228 L200,210 L195,190 L200,170 Z', // South America
  'M440,90 L470,88 L490,100 L495,118 L488,135 L470,140 L450,138 L440,128 L432,112 Z', // Europe
  'M455,150 L490,148 L520,160 L535,180 L530,205 L515,225 L490,232 L465,228 L450,210 L448,185 L452,165 Z', // Africa
  'M540,90 L600,82 L660,85 L720,90 L740,108 L745,128 L730,140 L700,150 L670,158 L640,158 L620,165 L605,160 L588,148 L572,138 L555,128 L545,118 L538,105 Z', // Asia
  'M620,210 L680,200 L730,210 L730,235 L700,250 L640,245 L615,232 Z', // Australia
];
// We treat these as decorative land blobs on a 800x500 SVG canvas

const sampleFires = [
  { lng: -121.5, lat: 38.6, name: 'Dixie aftermath' },
  { lng: -119.0, lat: 34.0, name: 'SoCal brushfire' },
  { lng: -97.5, lat: 32.0, name: 'TX risk zone' },
  { lng: -122.0, lat: 47.6, name: 'WA wildfire' },
];

export default function Globe2D({ initialTruck }: { initialTruck?: string }) {
  const [fleet, setFleet] = useState<TruckPin[]>([]);
  const [selected, setSelected] = useState<TruckPin | null>(null);
  const [search, setSearch] = useState('');
  const [w, setW] = useState(900);
  const [h, setH] = useState(540);
  const containerRef = useRef<HTMLDivElement>(null);

  const [layers, setLayers] = useState({
    fleet: true,
    fires: true,
    cameras: true,
    flights: false,
    maritime: false,
    weather: false,
    riots: false,
  });

  // Track container size
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const el = containerRef.current;
      if (!el) return;
      setW(el.clientWidth);
      setH(el.clientHeight);
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Fetch fleet
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/telematics');
      const data = await r.json();
      const pins: TruckPin[] = data.fleet.trucks.map((t: any) => ({
        id: t.id,
        lat: t.location.lat,
        lng: t.location.lng,
        status: t.status,
        driverName: data.fleet.drivers.find((d: any) => d.id === t.driverId)?.name ?? t.driverId,
        faultCount: t.faults.filter((f: any) => f.severity === 'critical').length,
        address: t.location.address,
      }));
      setFleet(pins);
      if (initialTruck) {
        const found = pins.find((p) => p.id === initialTruck);
        if (found) setSelected(found);
      }
    } catch (e) {
      console.error('Globe2D: fleet fetch failed', e);
    }
  }, [initialTruck]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 10000);
    return () => clearInterval(iv);
  }, [refresh]);

  const stats = useMemo(
    () => ({
      moving: fleet.filter((f) => f.status === 'moving').length,
      idle: fleet.filter((f) => f.status === 'idle').length,
      maintenance: fleet.filter((f) => f.status === 'maintenance').length,
      offline: fleet.filter((f) => f.status === 'offline').length,
    }),
    [fleet]
  );

  const flyToQuery = async () => {
    const q = search.trim();
    if (!q) return;
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'Aegis-Dashboard/0.1' } }
      );
      const arr = await r.json();
      const hit = arr?.[0];
      if (hit) {
        const lat = parseFloat(hit.lat);
        const lng = parseFloat(hit.lon);
        setSelected({ id: 'search', lat, lng, status: 'idle', driverName: hit.display_name });
      }
    } catch (e) {
      console.error('Search failed', e);
    }
  };

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-[#04040A]">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        preserveAspectRatio="none"
        className="absolute inset-0"
      >
        <defs>
          <radialGradient id="starfield" cx="50%" cy="50%" r="80%">
            <stop offset="0%" stopColor="rgb(20, 24, 50)" />
            <stop offset="100%" stopColor="rgb(2, 2, 8)" />
          </radialGradient>
          <radialGradient id="halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(251,191,36,0.04)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <pattern id="grid" width="40" height="30" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width={w} height={h} fill="url(#starfield)" />
        <rect width={w} height={h} fill="url(#grid)" />
        <rect width={w} height={h} fill="url(#halo)" />

        {/* Decorative landmasses (stylized blobs — illustrative only) */}
        <g fill="rgba(212,175,55,0.05)" stroke="rgba(212,175,55,0.15)" strokeWidth="1">
          {COUNTRY_PATHS.map((p, i) => (
            <path key={i} d={p} transform={`scale(${w / 800}, ${h / 500})`} />
          ))}
        </g>

        {/* Fires */}
        {layers.fires &&
          sampleFires.map((f, i) => {
            const p = project(f.lng, f.lat, w, h);
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="9" fill="rgba(255,107,53,0.15)" />
                <circle cx={p.x} cy={p.y} r="5" fill="#FF6B35" opacity="0.9" />
                <text x={p.x + 9} y={p.y + 4} fontSize="9" fill="#FF6B35" fillOpacity="0.6">
                  {f.name}
                </text>
              </g>
            );
          })}

        {/* Fleet pins — jittered so clusters are visible */}
        {(() => {
          const seen = new Map<string, number>();
          return layers.fleet && fleet.map((t) => {
            const p = project(t.lng, t.lat, w, h);
            const color = STATUS[t.status];
            const isSel = selected?.id === t.id;
            const key = `${Math.round(p.x / 30)},${Math.round(p.y / 30)}`;
            const count = seen.get(key) ?? 0;
            seen.set(key, count + 1);
            const angle = count * 1.4;
            const radius = count * 6;
            const x = p.x + Math.cos(angle) * radius;
            const y = p.y + Math.sin(angle) * radius;
            return (
              <g
                key={t.id}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelected(t)}
              >
                {isSel && (
                  <circle cx={x} cy={y} r="18" fill="none" stroke="#fbbf24" strokeWidth="1.5" opacity="0.7">
                    <animate attributeName="r" values="14;26;14" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0;0.9" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={x} cy={y} r="14" fill={color} fillOpacity="0.18" />
                <circle cx={x} cy={y} r="6" fill={color} stroke="#fff" strokeWidth="1.2" />
                <text
                  x={x}
                  y={y - 11}
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="middle"
                  fill="#fbbf24"
                  style={{ paintOrder: 'stroke', stroke: '#04040A', strokeWidth: 3 }}
                >
                  {t.id}
                </text>
                {t.faultCount && t.faultCount > 0 ? (
                  <text
                    x={x + 8}
                    y={y + 4}
                    fontSize="9"
                    fill="#FF3D3D"
                    style={{ paintOrder: 'stroke', stroke: '#04040A', strokeWidth: 2 }}
                  >
                    ⚠ {t.faultCount}
                  </text>
                ) : null}
              </g>
            );
          });
        })()}

        {/* Equator + meridians for orientation */}
        <g stroke="rgba(251,191,36,0.04)" strokeWidth="1" strokeDasharray="3,5">
          <line x1="0" y1={h / 2} x2={w} y2={h / 2} />
          <line x1={w / 4} y1="0" x2={w / 4} y2={h} />
          <line x1={(w * 3) / 4} y1="0" x2={(w * 3) / 4} y2={h} />
        </g>

        {/* Camera dots (sampled from /api/cameras) */}
        {layers.cameras && <CameraDotsLayer w={w} h={h} />}
      </svg>

      {/* Layer panel + stats overlay at top-left (CSS-positioned) */}
      <div className="absolute top-4 left-4 w-72 bg-[#0a0e1a]/85 border border-amber-500/20 rounded-lg p-4 backdrop-blur-md z-10 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <h3 className="text-[10px] uppercase tracking-[0.25em] text-amber-400 font-bold">Aegis · Intel Globe</h3>
        </div>
        <div className="text-[10px] text-slate-500 leading-relaxed mb-3">
          Live fleet pins on a global operations view. Toggle layers to overlay
          intel sources. Click a pin to inspect.
        </div>

        <div className="grid grid-cols-4 gap-1.5 mb-4 text-center">
          <SmallStat label="Moving" n={stats.moving} color="#10b981" />
          <SmallStat label="Idle" n={stats.idle} color="#f59e0b" />
          <SmallStat label="Svc" n={stats.maintenance} color="#3b82f6" />
          <SmallStat label="Off" n={stats.offline} color="#64748b" />
        </div>

        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Layers</div>
        <div className="space-y-1.5 mb-4">
          {([
            ['fleet',    'Fleet pins',       Truck,    '#10b981'],
            ['fires',    'Wildfire risk',    Flame,    '#FF6B35'],
            ['cameras',  'Highway CCTV',     undefined, '#00E5FF'],
            ['flights',  'Cargo flights',    Plane,    '#3b82f6'],
            ['maritime', 'Cargo vessels',    Ship,     '#a78bfa'],
            ['weather',  'Weather hazards',  CloudRain, '#E040FB'],
            ['riots',    'Riots / protests', undefined, '#FF3D3D'],
          ] as const).map(([k, label, _Icon, color]) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={layers[k as keyof typeof layers]}
                onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))}
                className="accent-amber-500"
              />
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs text-slate-300 group-hover:text-amber-300">{label}</span>
            </label>
          ))}
        </div>

        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Fleet on globe</div>
        <div className="space-y-1">
          {fleet.map((t) => {
            const isSel = selected?.id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center justify-between border transition ${
                  isSel
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <span className="font-mono">{t.id}</span>
                <span
                  className="text-[10px] uppercase tracking-widest font-bold"
                  style={{ color: STATUS[t.status] }}
                >
                  {t.status}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 bg-slate-900/70 border border-slate-700 rounded-md px-2 py-1">
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && flyToQuery()}
            placeholder="Search city / region…"
            className="bg-transparent text-xs text-slate-200 placeholder-slate-500 outline-none w-full"
          />
          {search && (
            <button onClick={() => setSearch('')}>
              <X className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300" />
            </button>
          )}
        </div>
      </div>

      {/* Selected truck detail (bottom-left or top-right) */}
      {selected && (
        <div className="absolute bottom-4 left-4 w-80 bg-[#0a0e1a]/90 border border-amber-500/30 rounded-lg p-4 backdrop-blur-md z-10">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-bold">
              {selected.id === 'search' ? 'Search result' : 'Truck'}
            </div>
            <button onClick={() => setSelected(null)}>
              <X className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300" />
            </button>
          </div>
          <div className="font-black font-mono text-3xl text-amber-400">
            {selected.id === 'search' ? '✈' : selected.id}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {selected.status && (
              <span
                className="uppercase tracking-widest font-bold mr-2"
                style={{ color: selected.id === 'search' ? '#E040FB' : STATUS[selected.status] }}
              >
                {selected.id === 'search' ? 'fly to' : selected.status}
              </span>
            )}
            <span className="text-slate-300">{selected.driverName ?? '—'}</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-2 font-mono">
            {selected.lat.toFixed(3)}, {selected.lng.toFixed(3)}
          </div>
        </div>
      )}

      {/* Bottom-right attribution */}
      <div className="absolute bottom-2 right-2 text-[9px] text-slate-600 bg-[#0a0e1a]/70 px-2 py-1 rounded border border-slate-800/60 z-10">
        Aegis Intel Globe · fleet pins on global layer
      </div>

      {/* Bottom-right "back to dashboard" */}
      <div className="absolute bottom-4 right-4 z-10">
        <a
          href="/dashboard"
          className="flex items-center gap-2 px-3 py-2 rounded bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 text-xs font-bold shadow-lg shadow-amber-500/30 hover:from-amber-400 hover:to-amber-500 transition"
        >
          <Home className="w-3.5 h-3.5" /> Back to Command Center
        </a>
      </div>
    </div>
  );
}

function SmallStat({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <div className="p-1.5 rounded border border-slate-800 bg-slate-900/40">
      <div className="text-[8px] uppercase tracking-widest text-slate-500 leading-none">{label}</div>
      <div className="font-bold text-base font-mono" style={{ color }}>
        {n}
      </div>
    </div>
  );
}

// CameraDotsLayer: fetches and renders up to 200 random cameras as small dots
function CameraDotsLayer({ w, h }: { w: number; h: number }) {
  const [cams, setCams] = useState<{ lng: number; lat: number; format: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/cameras?limit=200');
        const data = await r.json();
        if (!cancelled) setCams(data.cameras ?? []);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <g>
      {cams.map((c, i) => {
        const p = project(c.lng, c.lat, w, h);
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={1.5}
            fill={c.format === 'M3U8' ? '#00E5FF' : '#10b981'}
            opacity="0.6"
          />
        );
      })}
    </g>
  );
}
