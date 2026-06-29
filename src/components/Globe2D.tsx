'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import { Truck, Flame, CloudRain, Search, X, Plane, Ship } from 'lucide-react';
import type { TruckPin } from './Globe2D.types';

const STATUS = {
  moving: '#10b981',
  idle: '#f59e0b',
  maintenance: '#3b82f6',
  offline: '#64748b',
} as const;

const sampleFires = [
  { lng: -121.5, lat: 38.6, name: 'Dixie aftermath' },
  { lng: -119.0, lat: 34.0, name: 'SoCal brushfire' },
  { lng: -97.5, lat: 32.0, name: 'TX risk zone' },
  { lng: -122.0, lat: 47.6, name: 'WA wildfire' },
];

const sampleMaritime = [
  { lat: 33.74, lng: -118.27, name: 'Port of LA' },
  { lat: 33.77, lng: -118.22, name: 'Port of Long Beach' },
  { lat: 29.73, lng: -95.30, name: 'Port of Houston' },
  { lat: 40.66, lng: -74.05, name: 'Port NY/NJ' },
  { lat: 32.78, lng: -79.93, name: 'Port of Charleston' },
];

const sampleFlights = [
  { lat: 41.97, lng: -87.90, callsign: 'FDX1421', alt: 37000 },
  { lat: 33.94, lng: -118.40, callsign: 'UPS952', alt: 39000 },
  { lat: 32.90, lng: -97.04, callsign: 'FDX502', alt: 35000 },
  { lat: 40.64, lng: -73.78, callsign: 'FDX88', alt: 41000 },
];

const sampleRiots = [
  { lat: 38.91, lng: -77.04, city: 'DC', intensity: 'low' as const },
  { lat: 34.05, lng: -118.24, city: 'LA', intensity: 'med' as const },
];

type WorldFeature = FeatureCollection<Geometry, { name: string }>;

export default function Globe2D({ initialTruck }: { initialTruck?: string }) {
  const [fleet, setFleet] = useState<TruckPin[]>([]);
  const [selected, setSelected] = useState<TruckPin | null>(null);
  const [search, setSearch] = useState('');
  const [w, setW] = useState(900);
  const [h, setH] = useState(500);
  const [world, setWorld] = useState<WorldFeature | null>(null);
  const [cams, setCams] = useState<{ lng: number; lat: number; format: string }[]>([]);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/data/world-110m.json');
        const topo = await r.json();
        const geo = feature(topo, topo.objects.countries) as WorldFeature;
        if (!cancelled) setWorld(geo);
      } catch (e) {
        console.error('Globe2D: world atlas failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      if (initialTruck && !selected) {
        const found = pins.find((p) => p.id === initialTruck);
        if (found) setSelected(found);
      }
    } catch (e) {
      console.error('Globe2D: fleet failed', e);
    }
  }, [initialTruck, selected]);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 10000);
    return () => clearInterval(iv);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/cameras?limit=300');
        const data = await r.json();
        if (!cancelled) setCams(data.cameras ?? []);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const projection = useMemo(() => geoEquirectangular().fitSize([w, h], { type: 'Sphere' } as any), [w, h]);
  const pathGen = useMemo(() => geoPath(projection as any), [projection]);

  const project = useCallback(
    (lng: number, lat: number) => {
      const p = projection([lng, lat]);
      return p ?? [0, 0];
    },
    [projection]
  );

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

  // Per-truck jitter offsets so clusters don't overlap
  const clusterKeys = useMemo(() => {
    const seen = new Map<string, number>();
    const offsets: Record<string, { dx: number; dy: number }> = {};
    for (const t of fleet) {
      const p = project(t.lng, t.lat);
      const key = `${Math.round(p[0] / 60)},${Math.round(p[1] / 60)}`;
      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      const angle = count * 1.5;
      const radius = count * 18;
      offsets[t.id] = { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius };
    }
    return offsets;
  }, [fleet, project]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-[#04040A]">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} preserveAspectRatio="none" className="absolute inset-0">
        <defs>
          <radialGradient id="starfield" cx="50%" cy="50%" r="80%">
            <stop offset="0%" stopColor="rgb(8, 10, 24)" />
            <stop offset="60%" stopColor="rgb(2, 3, 10)" />
            <stop offset="100%" stopColor="rgb(0, 0, 0)" />
          </radialGradient>
          <pattern id="grid" width="40" height="30" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 30" fill="none" stroke="rgba(251,191,36,0.04)" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width={w} height={h} fill="url(#starfield)" />
        <rect width={w} height={h} fill="url(#grid)" />

        {world && pathGen && (
          <path
            d={pathGen(world as any) || ''}
            fill="rgba(212,175,55,0.10)"
            stroke="rgba(212,175,55,0.55)"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
        )}

        {(() => {
          const eq = pathGen({ type: 'LineString', coordinates: [[-180, 0], [180, 0]] } as any);
          return eq ? <path d={eq} fill="none" stroke="rgba(251,191,36,0.15)" strokeWidth="1" strokeDasharray="4,6" /> : null;
        })()}

        {/* Cameras — high-vis */}
        {layers.cameras &&
          cams.map((c, i) => {
            const p = project(c.lng, c.lat);
            return (
              <circle
                key={i}
                cx={p[0]}
                cy={p[1]}
                r={2.2}
                fill={c.format === 'M3U8' ? '#00E5FF' : '#34D399'}
                opacity="0.85"
              />
            );
          })}

        {layers.fires &&
          sampleFires.map((f, i) => {
            const p = project(f.lng, f.lat);
            return (
              <g key={i}>
                <circle cx={p[0]} cy={p[1]} r="14" fill="rgba(255,107,53,0.20)" />
                <circle cx={p[0]} cy={p[1]} r="9" fill="rgba(255,107,53,0.4)" />
                <circle cx={p[0]} cy={p[1]} r="6" fill="#FF6B35" opacity="1" stroke="#fff" strokeWidth="1">
                  <animate attributeName="r" values="5;9;5" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="1;0.4;1" dur="3s" repeatCount="indefinite" />
                </circle>
                <text
                  x={p[0] + 12}
                  y={p[1] + 4}
                  fontSize="10"
                  fill="#FF6B35"
                  fontWeight="bold"
                  style={{ paintOrder: 'stroke', stroke: '#04040A', strokeWidth: 3 }}
                >
                  {f.name}
                </text>
              </g>
            );
          })}

        {layers.maritime &&
          sampleMaritime.map((p, i) => {
            const q = project(p.lng, p.lat);
            return (
              <g key={i}>
                <rect x={q[0] - 5} y={q[1] - 5} width="10" height="10" fill="#a78bfa" opacity="0.7" transform={`rotate(45 ${q[0]} ${q[1]})`} />
                <text x={q[0] + 9} y={q[1] + 4} fontSize="9" fill="#a78bfa" fillOpacity="0.7">
                  {p.name}
                </text>
              </g>
            );
          })}

        {layers.flights &&
          sampleFlights.map((f, i) => {
            const p = project(f.lng, f.lat);
            return (
              <g key={i}>
                <circle cx={p[0]} cy={p[1]} r="4" fill="#3b82f6" opacity="0.8" />
                <line x1={p[0] - 7} y1={p[1]} x2={p[0] + 7} y2={p[1]} stroke="#3b82f6" strokeWidth="1" />
                <text x={p[0] + 9} y={p[1] + 4} fontSize="9" fill="#3b82f6" fillOpacity="0.7">
                  {f.callsign} FL{f.alt / 100}
                </text>
              </g>
            );
          })}

        {layers.riots &&
          sampleRiots.map((r, i) => {
            const q = project(r.lng, r.lat);
            const color = r.intensity === 'high' ? '#FF3D3D' : r.intensity === 'med' ? '#FF6B35' : '#FF9500';
            return (
              <g key={i}>
                <circle cx={q[0]} cy={q[1]} r="10" fill={color} opacity="0.4">
                  <animate attributeName="r" values="10;18;10" dur="2.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0;0.6" dur="2.5s" repeatCount="indefinite" />
                </circle>
                <circle cx={q[0]} cy={q[1]} r="3" fill={color} />
              </g>
            );
          })}

        {layers.fleet &&
          fleet.map((t) => {
            const p = project(t.lng, t.lat);
            const color = STATUS[t.status];
            const isSel = selected?.id === t.id;
            const off = clusterKeys[t.id] ?? { dx: 0, dy: 0 };
            const x = p[0] + off.dx;
            const y = p[1] + off.dy;
            return (
              <g key={t.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(t)}>
                {off.dx !== 0 || off.dy !== 0 ? (
                  <line x1={p[0]} y1={p[1]} x2={x} y2={y} stroke={color} strokeOpacity="0.5" strokeWidth="0.8" />
                ) : null}
                {isSel && (
                  <circle cx={x} cy={y} r="20" fill="none" stroke="#fbbf24" strokeWidth="2" opacity="0.7">
                    <animate attributeName="r" values="14;28;14" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0;0.9" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={x} cy={y} r="14" fill={color} fillOpacity="0.22" />
                <circle cx={x} cy={y} r="6" fill={color} stroke="#fff" strokeWidth="1.5" />
                <text
                  x={x}
                  y={y - 12}
                  fontSize="12"
                  fontWeight="bold"
                  textAnchor="middle"
                  fill="#fbbf24"
                  style={{ paintOrder: 'stroke', stroke: '#04040A', strokeWidth: 3 }}
                >
                  {t.id}
                </text>
                {t.faultCount && t.faultCount > 0 ? (
                  <text
                    x={x + 11}
                    y={y + 4}
                    fontSize="9"
                    fill="#FF3D3D"
                    fontWeight="bold"
                    style={{ paintOrder: 'stroke', stroke: '#04040A', strokeWidth: 2 }}
                  >
                    ⚠ {t.faultCount}
                  </text>
                ) : null}
              </g>
            );
          })}
      </svg>

      <div className="absolute top-4 left-4 w-72 bg-[#0a0e1a]/92 border border-amber-500/30 rounded-lg p-4 backdrop-blur-md z-10 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <h3 className="text-[10px] uppercase tracking-[0.25em] text-amber-400 font-bold">Aegis · Intel Globe</h3>
        </div>
        <div className="text-[10px] text-slate-500 leading-relaxed mb-3">
          Live fleet + logistics intel. Toggle layers. Click a pin to inspect.
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

      {selected && (
        <div className="absolute bottom-4 left-4 w-80 bg-[#0a0e1a]/92 border border-amber-500/30 rounded-lg p-4 backdrop-blur-md z-10">
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

      <div className="absolute bottom-2 right-2 text-[9px] text-slate-600 bg-[#0a0e1a]/70 px-2 py-1 rounded border border-slate-800/60 z-10">
        Aegis Intel Globe · d3-geo · Natural Earth via world-atlas (CC0)
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
