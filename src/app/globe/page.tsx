'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import ErrorBoundary from '@/components/ErrorBoundary';
import AegisLogo from '@/components/AegisLogo';
import IntelPanel from '@/components/IntelPanel';
import { ArrowLeft, Globe2, Truck, Shield, RefreshCw, AlertTriangle, Camera, Flame, Ship, Plane } from 'lucide-react';

// OSIRIS-provided components reused
const OsirisMap = dynamic(() => import('@/components/OsirisMap'), { ssr: false });
const LayerPanel = dynamic(() => import('@/components/LayerPanel'), { ssr: false });
const CameraViewer = dynamic(() => import('@/components/CameraViewer'), { ssr: false });

type TruckPin = {
  id: string;
  lat: number;
  lng: number;
  status: 'moving' | 'idle' | 'maintenance' | 'offline';
  driverName?: string;
  faultCount?: number;
  address?: string;
};

// OSIRIS LayerPanel-compatible layer keys (subset focused on logistics intel)
const DEFAULT_LAYERS: Record<string, boolean> = {
  // Aegis-fleet always on
  aegis_fleet: true,
  // OSIRIS feeds on for the fleet-ops demo
  fires: true,
  cctv: false,           // 6,971 dots would clutter; user can toggle
  maritime: true,
  flights: false,        // 1000+ would clutter; user can toggle
  earthquakes: true,
  weather: false,
  // Cosmetic
  day_night: false,
  graticule: true,
  // Off by default (heavy intel layers — keep noise low)
  global_incidents: false,           // GDELT feed in panel
  infrastructure: false,
  sigint: false,
  radiation: false,
  balloons: false,
  satellites: false,
  gps_jamming: false,
  military: false,
  private: false,
  jets: false,
  malware: false,
  sdk_sea: false,
  sdk_ransomware: false,
  sdk_air: false,
  sdk_intel: false,
  conflict: false,
  scan_targets: false,
  network_mesh: false,
};

export default function AegisGlobePage() {
  const router = useRouter();
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>(DEFAULT_LAYERS);
  const [data, setData] = useState<any>({});
  const [fleet, setFleet] = useState<TruckPin[]>([]);
  const [fleetSummary, setFleetSummary] = useState<{ moving: number; idle: number; maintenance: number; offline: number }>({ moving: 0, idle: 0, maintenance: 0, offline: 0 });
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const [flyToLocation, setFlyToLocation] = useState<{ lat: number; lng: number; zoom?: number; ts: number } | null>({
    lat: 30.0,
    lng: -97.5,
    zoom: 4.0,
    ts: Date.now(),
  });
  const [activeCamera, setActiveCamera] = useState<any>(null);
  const [selectedTruck, setSelectedTruck] = useState<TruckPin | null>(null);

  // ───── OSIRIS data loader (same endpoints + lightweight intervals) ─────
  // Mirrors the OSIRIS homepage pattern: spread endpoint response directly into data,
  // OR apply a transform if the endpoint shape differs from what OsirisMap expects.
  const fetchEndpoint = useCallback(async (url: string, transform?: (d: any) => any) => {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      const payload = transform ? transform(d) : d;
      setData((prev) => ({ ...prev, ...payload }));
    } catch (e) {
      console.warn(`[globe] failed ${url}`, e);
    }
  }, []);

  // Initial / hot load
  useEffect(() => {
    fetchEndpoint('/api/fires');
    fetchEndpoint('/api/cctv?region=all&v=2');
    fetchEndpoint('/api/maritime', (d) => ({
      maritime_ports: d.ports,
      maritime_chokepoints: d.chokepoints,
      maritime_ships: d.ships,
    }));
    fetchEndpoint('/api/flights');
    fetchEndpoint('/api/earthquakes');
    fetchEndpoint('/api/weather', (d) => ({ weather_events: d.events }));
  }, [fetchEndpoint]);

  // Refresh intervals — same cadence as OSIRIS homepage
  useEffect(() => {
    const iv = setInterval(() => {
      fetchEndpoint('/api/fires');
      fetchEndpoint('/api/cctv?region=all&v=2');
      fetchEndpoint('/api/maritime', (d) => ({
        maritime_ports: d.ports,
        maritime_chokepoints: d.chokepoints,
        maritime_ships: d.ships,
      }));
      fetchEndpoint('/api/flights');
      fetchEndpoint('/api/earthquakes');
      setLastUpdate(Date.now());
    }, 120_000); // 2 min — be polite to upstream
    return () => clearInterval(iv);
  }, [fetchEndpoint]);

  // ───── Aegis fleet loader ─────
  const refreshFleet = useCallback(async () => {
    try {
      const r = await fetch('/api/telematics');
      const d = await r.json();
      const pins: TruckPin[] = d.fleet.trucks.map((t: any) => ({
        id: t.id,
        lat: t.location.lat,
        lng: t.location.lng,
        status: t.status,
        driverName: d.fleet.drivers.find((dr: any) => dr.id === t.driverId)?.name ?? t.driverId,
        faultCount: t.faults.filter((f: any) => f.severity === 'critical').length,
        address: t.location.address,
      }));
      setFleet(pins);
      setFleetSummary({
        moving: pins.filter((p) => p.status === 'moving').length,
        idle: pins.filter((p) => p.status === 'idle').length,
        maintenance: pins.filter((p) => p.status === 'maintenance').length,
        offline: pins.filter((p) => p.status === 'offline').length,
      });
    } catch (e) {
      console.error('[globe] fleet fetch', e);
    }
  }, []);

  useEffect(() => {
    refreshFleet();
    // Fleet is local in-process state — refresh every 30s (not 10s) so the
    // map doesn't re-paint constantly. Click 'Refresh' header button for on-demand.
    const iv = setInterval(refreshFleet, 30_000);
    return () => clearInterval(iv);
  }, [refreshFleet]);

// ───── Inject fleet + jitter so all 5 trucks are visible at any zoom ─────
  const enrichedData = useMemo(() => {
    // Deterministic jitter offset per truck id — spreads overlapping pins
    // across an ~1km box so they don't stack invisibly in Texas metro.
    const jitter = (id: string) => {
      // Deterministic jitter offset per truck id — spreads overlapping pins
      // across an ~80km box so they don't stack invisibly in Texas metro.
      // Use the truck INDEX not hash so trucks spread evenly, not clustered.
      const idx = fleet.findIndex((f) => f.id === id);
      const ring = idx % 2;
      const dot = Math.floor(idx / 2);
      const angle = dot * 1.4 + (ring ? Math.PI / 2 : 0);
      const radius = 0.35 + dot * 0.12;
      return [Math.cos(angle) * radius * 0.6, Math.sin(angle) * radius * 0.6];
    };
    return {
      ...data,
      aegis_fleet: fleet.map((t) => {
        const [dx, dy] = jitter(t.id);
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [t.lng + dx, t.lat + dy] },
          properties: {
            id: t.id,
            status: t.status,
            driver: t.driverName,
            faults: t.faultCount ?? 0,
            address: t.address,
          },
        };
      }),
    };
  }, [data, fleet]);

  // Click on CCTV point in OSIRIS map → open CameraViewer (OSIRIS component)
  // OSIRIS sends the camera as flat {type:'cctv', id, name, lat, lng, feed_url, ...}
  // Some other layers send {type, data: {...}}. Handle both.
  const handleEntityClick = useCallback((entity: any) => {
    if (!entity) return;
    if (entity.type === 'cctv') {
      const cam = entity.data ?? entity;
      // Sanity: must have at least a name or id
      if (cam && (cam.id || cam.name)) {
        setActiveCamera(cam);
      }
    }
  }, []);

  // Fly to a truck from the side panel
  const focusTruck = useCallback((t: TruckPin) => {
    setSelectedTruck(t);
    setFlyToLocation({ lat: t.lat, lng: t.lng, zoom: 7, ts: Date.now() });
  }, []);

  return (
    <div className="h-screen w-screen bg-[#04040A] text-slate-100 flex flex-col overflow-hidden">
      {/* ─── Aegis header ─── */}
      <header className="border-b border-amber-500/30 bg-[#0a0e1a]/95 backdrop-blur px-6 py-3 flex items-center justify-between z-30 flex-shrink-0">
        <div className="flex items-center gap-4">
          <a href="/dashboard" className="flex items-center gap-1.5 text-slate-400 hover:text-amber-300 text-xs transition">
            <ArrowLeft className="w-3.5 h-3.5" /> Command Center
          </a>
          <AegisLogo size="sm" />
          <span className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-bold">
            · Intel Globe
          </span>
        </div>
        <div className="hidden md:flex items-center gap-4 text-[10px] uppercase tracking-[0.2em]">
          <button
            type="button"
            onClick={() => {
              fetchEndpoint('/api/fires');
              fetchEndpoint('/api/cctv?region=all&v=2');
              fetchEndpoint('/api/maritime', (d) => ({
                maritime_ports: d.ports,
                maritime_chokepoints: d.chokepoints,
                maritime_ships: d.ships,
              }));
              fetchEndpoint('/api/flights');
              fetchEndpoint('/api/earthquakes');
              refreshFleet();
              setLastUpdate(Date.now());
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 transition"
            title="Manually refresh intel feeds"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh now</span>
          </button>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-400">Live</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-400 font-bold">{fleetSummary.moving}</span>
            <span className="text-slate-500">moving</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-amber-400 font-bold">{fleetSummary.idle}</span>
            <span className="text-slate-500">idle</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-blue-400 font-bold">{fleetSummary.maintenance}</span>
            <span className="text-slate-500">svc</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-slate-500 font-bold">{fleetSummary.offline}</span>
            <span className="text-slate-500">off</span>
          </span>
          <span className="text-slate-600 ml-2">
            refresh {Math.round((Date.now() - lastUpdate) / 1000)}s ago
          </span>
        </div>
      </header>

      {/* ─── Main map + side panels ─── */}
      <div className="flex-1 relative overflow-hidden">
        <ErrorBoundary name="Aegis Globe">
          <OsirisMap
            key={`aegis-${activeLayers.day_night}-${activeLayers.graticule}`}
            data={enrichedData}
            activeLayers={activeLayers}
            projection="mercator"
            mapStyle="dark"
            onEntityClick={handleEntityClick}
            onViewStateChange={(vs) => {
              // no-op for now; could update a state for URL persistence
            }}
            flyToLocation={flyToLocation}
          />

          {/* Tabbed right-rail: Fleet | CCTV | Maritime | Global | SA. Collapsible to icon strip. */}
          <IntelPanel
            fleetContent={
              <FleetOverlayPanel
                fleet={fleet}
                summary={fleetSummary}
                selectedId={selectedTruck?.id ?? null}
                onSelect={focusTruck}
                onDrillToDashboard={(t) => router.push(`/dashboard?truck=${encodeURIComponent(t.id)}`)}
              />
            }
            selectedTruckCoord={
              selectedTruck
                ? { id: selectedTruck.id, lat: selectedTruck.lat, lng: selectedTruck.lng }
                : null
            }
            onOpenCamInGlobe={(cam) => setFlyToLocation({ lat: cam.lat, lng: cam.lng, zoom: 14, ts: Date.now() })}
            defaultTab="fleet"
          />

          {/* OSIRIS LayerPanel — positioned by itself (it uses fixed/absolute itself) */}
          <LayerPanel
            data={enrichedData}
            activeLayers={activeLayers}
            setActiveLayers={setActiveLayers}
            theme="core"
          />

          {/* CCT Viewer (OSIRIS component) opens when CCTV point is clicked */}
          {activeCamera && (
            <CameraViewer
              camera={activeCamera}
              onClose={() => setActiveCamera(null)}
              onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })}
            />
          )}
        </ErrorBoundary>

        {/* Footer counter (matches dashboard footer styling) */}
        <div className="absolute bottom-2 left-2 text-[9px] text-slate-600 bg-[#0a0e1a]/70 px-2 py-1 rounded border border-slate-800/60 z-10">
          Aegis Intel Globe · OSIRIS intel base + Aegis fleet pins · 7,029 highway cams · live fleet
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Aegis fleet overlay — fixed side-panel card listing 5 trucks + click handlers.
// The MAP ITSELF renders all intel from OSIRIS; this just gives fleet manager
// quick access to their units and "Drill to dashboard" CTA per truck.
// ─────────────────────────────────────────────────────────────────────────────

function FleetOverlayPanel({
  fleet,
  summary,
  selectedId,
  onSelect,
  onDrillToDashboard,
}: {
  fleet: TruckPin[];
  summary: { moving: number; idle: number; maintenance: number; offline: number };
  selectedId: string | null;
  onSelect: (t: TruckPin) => void;
  onDrillToDashboard: (t: TruckPin) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <h3 className="text-[10px] uppercase tracking-[0.25em] text-amber-400 font-bold">
          Aegis · Fleet on globe
        </h3>
      </div>

      <div className="grid grid-cols-4 gap-1.5 mb-3 text-center">
        <SmallStat label="Moving" n={summary.moving} color="#10b981" />
        <SmallStat label="Idle" n={summary.idle} color="#f59e0b" />
        <SmallStat label="Svc" n={summary.maintenance} color="#3b82f6" />
        <SmallStat label="Off" n={summary.offline} color="#64748b" />
      </div>

      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Trucks</div>
      <div className="space-y-1.5">
        {fleet.map((t) => {
          const isSel = t.id === selectedId;
          const color =
            t.status === 'moving'
              ? '#10b981'
              : t.status === 'idle'
              ? '#f59e0b'
              : t.status === 'maintenance'
              ? '#3b82f6'
              : '#64748b';
          return (
            <div
              key={t.id}
              className={`rounded border transition ${
                isSel
                  ? 'bg-amber-500/10 border-amber-500/40'
                  : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
              }`}
            >
              <button
                onClick={() => onSelect(t)}
                className="w-full text-left px-2.5 py-2 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: color, animationDuration: t.status === 'moving' ? '1.5s' : '4s' }}
                  />
                  <span className="font-mono font-bold text-slate-200">{t.id}</span>
                </div>
                <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color }}>
                  {t.status}
                </span>
              </button>
              <div className="px-2.5 pb-2 -mt-1">
                <div className="text-[10px] text-slate-400 truncate">{t.driverName}</div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[9px] text-slate-500 uppercase tracking-widest truncate flex-1 mr-2">
                    {t.address}
                  </span>
                  {t.faultCount && t.faultCount > 0 ? (
                    <span className="text-[10px] font-bold text-red-400">⚠ {t.faultCount}</span>
                  ) : null}
                </div>
                {isSel && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDrillToDashboard(t);
                    }}
                    className="mt-2 w-full px-2 py-1.5 rounded bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 text-[10px] font-bold uppercase tracking-widest hover:from-amber-400 hover:to-amber-500 transition flex items-center justify-center gap-1"
                  >
                    Drill to dashboard &rarr;
                  </button>
                )}
              </div>
            </div>
          );
        })}
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

// ─────────────────────────────────────────────────────────────────────────────
// Aegis Intel sidebar — replaced by IntelPanel (tabbed right-rail).
// ─────────────────────────────────────────────────────────────────────────────
