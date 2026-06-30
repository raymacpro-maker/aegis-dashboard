'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Truck,
  AlertTriangle,
  Activity,
  Fuel,
  Wrench,
  Clock,
  MapPin,
  MessageSquare,
  X,
  Send,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
  Loader2,
  Globe2,
  Sparkles,
  ArrowUpRight,
  Lock,
  Info,
  Video,
} from 'lucide-react';
import AegisLogo from '@/components/AegisLogo';
import HighwayCCTV from '@/components/HighwayCCTV';

type PrivacyRole = 'manager' | 'agent' | 'viewer';

type TruckData = {
  id: string;
  status: 'moving' | 'idle' | 'maintenance' | 'offline';
  driverId: string;
  location: {
    lat: number;
    lng: number;
    address: string;
    speedMph: number;
    accuracyM?: number;
    cn0AvgDbhz?: number;
    cn0MinDbhz?: number;
    satellitesUsed?: number;
    spoofingSuspected?: boolean;
    fixSource?: 'phone_gps' | 'fmc003' | 'fused';
    gnssTs?: number;
  };
  hos: {
    hoursDriven: number;
    hoursOnDuty: number;
    hoursRemaining: { drive: number; shift: number; cycle: number };
    nextBreakRequiredIn: number;
  };
  fuel: { levelPct: number; mpgRecent: number; estimatedRangeMi: number };
  faults: Array<{ code: string; description: string; severity: 'info' | 'warning' | 'critical' }>;
  maintenance: { daysUntilDOT: number; dueService: string; currentMiles: number; nextServiceMiles: number };
  lastUpdateTs: number;
};

type FleetSummary = {
  totalTrucks: number;
  moving: number;
  idle: number;
  maintenance: number;
  offline: number;
  criticalFaults: number;
  warnings: number;
  hosWarnings: number;
  lowFuel: number;
  dotInspectionsDueSoon: number;
  trucksInJammedArea?: number;
};

type Driver = { id: string; name: string; nameEncrypted?: boolean; homeBase: string; cdlNumber?: string; phone?: string; hireDate?: string };

export default function AegisDashboard() {
  const [summary, setSummary] = useState<FleetSummary | null>(null);
  const [trucks, setTrucks] = useState<TruckData[]>([]);
  const [jammingMap, setJammingMap] = useState<Record<string, { level: string; severity: number; reason: string; in_jammed_area: boolean }>>({});
  const [drivers, setDrivers] = useState<Record<string, Driver>>({});
  const [selectedTruck, setSelectedTruck] = useState<string | null>('T-22');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: 'user' | 'aegis'; content: string; citations?: string[] }>
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [role, setRole] = useState<PrivacyRole>('manager');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  // Client-only UTC clock — initialized empty to avoid SSR hydration mismatch
  // (server renders one second, client renders the next).
  const [utcClock, setUtcClock] = useState<string>('--:--:--');

  // Fetch fleet data — revalidate every 10s (and on role change)
  useEffect(() => {
    const tick = () => setUtcClock(new Date().toUTCString().split(' ')[4] ?? '--:--:--');
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const fetchFleet = async () => {
      try {
        const r = await fetch(`/api/telematics?role=${role}`);
        const data = await r.json();
        setSummary(data.summary);
        setTrucks(data.fleet.trucks);
        if (data.jamming) setJammingMap(data.jamming);
        const driverMap: Record<string, Driver> = {};
        for (const d of data.fleet.drivers) driverMap[d.id] = d;
        setDrivers(driverMap);
      } catch (e) {
        console.error('Failed to fetch fleet:', e);
      }
    };
    fetchFleet();
    const iv = setInterval(fetchFleet, 10000);
    return () => clearInterval(iv);
  }, [role]);

  // Send chat message
  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatMessages((m) => [...m, { role: 'user', content: userMsg }]);
    setChatInput('');
    setChatLoading(true);
    try {
      const selectedTruckData = selectedTruck ? trucks.find((t) => t.id === selectedTruck) : undefined;
      const r = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          truckData: selectedTruckData,
          truckId: selectedTruck,
        }),
      });
      const data = await r.json();
      setChatMessages((m) => [...m, { role: 'aegis', content: data.reply, citations: data.citations }]);
    } catch (e) {
      setChatMessages((m) => [...m, { role: 'aegis', content: 'Sorry, I lost connection. Try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const askQuick = (q: string) => {
    setChatInput(q);
    setTimeout(() => sendChat(), 100);
  };

  const sel = selectedTruck ? trucks.find((t) => t.id === selectedTruck) : null;
  const selDriver = sel ? drivers[sel.driverId] : null;
  const actionCount =
    (summary?.criticalFaults ?? 0) +
    (summary?.hosWarnings ?? 0) +
    (summary?.lowFuel ?? 0) +
    (summary?.dotInspectionsDueSoon ?? 0);

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-slate-100 font-sans">
      {/* ─────────── HEADER / TOP BAR ─────────── */}
      <header className="border-b border-amber-500/20 bg-gradient-to-r from-[#0a0e1a] via-[#0f1424] to-[#0a0e1a]">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <AegisLogo size="md" />
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded border border-emerald-500/30 bg-emerald-500/5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] tracking-[0.25em] uppercase text-emerald-300 font-medium">
                Live · Telemetry on
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="hidden lg:flex items-center gap-2 text-slate-400">
              <Globe2 className="w-4 h-4" />
              <span suppressHydrationWarning>UTC {utcClock}</span>
            </div>
            <a
              href="/globe"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-700 hover:border-amber-500/50 text-slate-300 hover:text-amber-300 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Intel Globe</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
            <RoleToggle role={role} setRole={setRole} onShowInfo={() => setPrivacyOpen(true)} />
            <div className="px-3 py-1.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px] uppercase tracking-widest font-medium">
              Demo Logistics · TX
            </div>
          </div>
        </div>

        {/* ─────── HERO FLEET SUMMARY STRIP ─────── */}
        {summary && (
          <div className="px-6 py-4 border-t border-slate-800 bg-gradient-to-b from-[#0a0e1a]/60 to-transparent">
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl md:text-4xl font-black text-white tabular-nums">
                  {summary.moving}
                  <span className="text-slate-500 font-light">/{summary.totalTrucks}</span>
                </span>
                <div className="flex flex-col leading-tight">
                  <span className="text-xs uppercase tracking-[0.2em] text-emerald-400 font-bold">
                    Trucks moving
                  </span>
                  <span className="text-xs text-slate-500">
                    {summary.idle} idle · {summary.maintenance} in service · {summary.offline} parked
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {summary.criticalFaults > 0 && (
                  <CriticalBadge icon={<AlertTriangle className="w-3.5 h-3.5" />} label={`${summary.criticalFaults} critical fault${summary.criticalFaults > 1 ? 's' : ''}`} />
                )}
                {summary.hosWarnings > 0 && (
                  <WarnBadge icon={<Clock className="w-3.5 h-3.5" />} label={`${summary.hosWarnings} HOS break due`} />
                )}
                {summary.lowFuel > 0 && (
                  <WarnBadge icon={<Fuel className="w-3.5 h-3.5" />} label={`${summary.lowFuel} low fuel`} />
                )}
                {summary.dotInspectionsDueSoon > 0 && (
                  <WarnBadge icon={<Wrench className="w-3.5 h-3.5" />} label={`${summary.dotInspectionsDueSoon} DOT due in 14d`} />
                )}
                {actionCount === 0 && (
                  <div className="px-3 py-1.5 rounded border border-emerald-500/30 bg-emerald-500/5 text-emerald-300 text-xs flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5" />
                    <span className="uppercase tracking-widest text-[10px] font-medium">All clear · no action needed</span>
                  </div>
                )}
              </div>
            </div>

            {role !== 'manager' && (
              <PrivacyStrip role={role} onShowInfo={() => setPrivacyOpen(true)} />
            )}
          </div>
        )}
      </header>

      {/* ─────────── MAIN LAYOUT ─────────── */}
      <div className="flex" style={{ height: 'calc(100vh - 138px)' }}>
        {/* Fleet List (Left) */}
        <aside className="w-80 border-r border-slate-800 overflow-y-auto bg-[#080c16]">
          <div className="p-4 border-b border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-bold">
                Fleet status
              </h2>
              <span className="text-[10px] text-slate-600 font-mono">
                {trucks.length} units
              </span>
            </div>
            {summary && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Moving" value={summary.moving} color="emerald" />
                <Stat label="Idle" value={summary.idle} color="amber" />
                <Stat label="Service" value={summary.maintenance} color="blue" />
                <Stat label="Offline" value={summary.offline} color="slate" />
                {(summary.trucksInJammedArea ?? 0) > 0 && (
                  <Stat
                    label="GPS Issues"
                    value={summary.trucksInJammedArea ?? 0}
                    color="red"
                  />
                )}
              </div>
            )}
            {summary && (summary.trucksInJammedArea ?? 0) > 0 && (
              <div className="mx-2 mb-2 px-3 py-2 rounded border border-red-500/40 bg-red-500/10 text-[11px] text-red-200">
                <span className="font-bold uppercase tracking-widest text-red-300">⚠ GPS Alert</span>
                <span className="ml-2 text-red-100/80">
                  {summary.trucksInJammedArea} truck{summary.trucksInJammedArea === 1 ? '' : 's'} reporting degraded or spoofed GNSS — open detail panel for diagnosis.
                </span>
              </div>
            )}
          </div>

          <div className="p-2">
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-slate-500 mb-2 px-2 font-bold">
              Trucks
            </h2>
            {trucks.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTruck(t.id)}
                className={`w-full text-left p-3 rounded mb-1 border transition ${
                  selectedTruck === t.id
                    ? 'bg-amber-500/10 border-amber-500/50 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.1)]'
                    : 'bg-slate-900/40 border-slate-800/60 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-amber-300 font-mono">{t.id}</span>
                  <StatusPill status={t.status} />
                </div>
                <div className="text-xs text-slate-300 font-medium flex items-center gap-1">
                  <DriverName driver={drivers[t.driverId]} role={role} compact />
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                  {t.location.address}
                </div>
                <div className="flex gap-2 mt-1.5 text-[10px] flex-wrap">
                  {t.faults.filter((f) => f.severity === 'critical').length > 0 && (
                    <span className="text-red-400 font-medium">
                      ● {t.faults.filter((f) => f.severity === 'critical').length} critical
                    </span>
                  )}
                  {t.faults.filter((f) => f.severity === 'warning').length > 0 && (
                    <span className="text-amber-400 font-medium">
                      ● {t.faults.filter((f) => f.severity === 'warning').length} warn
                    </span>
                  )}
                  {t.fuel.levelPct < 0.25 && (
                    <span className="text-orange-400 font-medium">● fuel</span>
                  )}
                  {t.hos.nextBreakRequiredIn < 0.5 && (
                    <span className="text-yellow-400 font-medium">● break</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Main (Center) — Truck Detail + Map */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#0a0e1a]">
          {sel ? (
            <div>
              {/* Fleet Map — hero */}
              <div className="mb-6 p-4 rounded border border-slate-800 bg-slate-900/50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-bold">
                    Fleet Map · Texas region
                  </h3>
                  <span className="text-[10px] text-slate-600 font-mono">{trucks.length} trucks · {summary?.moving ?? 0} moving</span>
                </div>
                <div className="aspect-[21/9] bg-gradient-to-br from-slate-800 to-slate-900 rounded relative overflow-hidden border border-slate-800">
                  <FleetMap
                    trucks={trucks.map((t) => ({
                      id: t.id,
                      lat: t.location.lat,
                      lng: t.location.lng,
                      status: t.status,
                      address: t.location.address,
                    }))}
                    selectedTruck={sel.id}
                    onSelect={(id) => setSelectedTruck(id)}
                  />
                </div>
              </div>

              {/* Truck header */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-baseline gap-3 mb-1">
                    <h2 className="text-4xl font-black text-amber-400 tracking-wide font-mono">
                      {sel.id}
                    </h2>
                    <span className="text-slate-400 text-sm">{vinShort(sel)}</span>
                  </div>
                  <p className="text-sm text-slate-300 flex items-center gap-2">
                    <DriverName
                      driver={selDriver}
                      role={role}
                    />
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-400">{sel.location.address}</span>
                  </p>
                </div>
                <StatusPill status={sel.status} large />
              </div>

              {/* Telemetry cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <TelemetryCard
                  icon={<Clock className="w-5 h-5" />}
                  label="HOS Drive Left"
                  value={`${sel.hos.hoursRemaining.drive.toFixed(1)}h`}
                  sub={`${sel.hos.hoursDriven.toFixed(1)}h driven`}
                  color={sel.hos.hoursRemaining.drive < 2 ? 'red' : sel.hos.hoursRemaining.drive < 4 ? 'amber' : 'emerald'}
                />
                <TelemetryCard
                  icon={<Clock className="w-5 h-5" />}
                  label="HOS Shift Left"
                  value={`${sel.hos.hoursRemaining.shift.toFixed(1)}h`}
                  sub={`${sel.hos.hoursOnDuty.toFixed(1)}h on duty`}
                  color={sel.hos.hoursRemaining.shift < 2 ? 'red' : sel.hos.hoursRemaining.shift < 4 ? 'amber' : 'emerald'}
                />
                <TelemetryCard
                  icon={<Fuel className="w-5 h-5" />}
                  label="Fuel"
                  value={sel.status === 'offline' ? '—' : `${(sel.fuel.levelPct * 100).toFixed(0)}%`}
                  sub={sel.status === 'offline' ? 'no telemetry' : `${sel.fuel.estimatedRangeMi} mi range`}
                  color={sel.fuel.levelPct < 0.25 ? 'red' : 'emerald'}
                />
                <TelemetryCard
                  icon={<Activity className="w-5 h-5" />}
                  label="Speed"
                  value={sel.status === 'offline' || sel.status === 'maintenance' ? 'Parked' : `${sel.location.speedMph} mph`}
                  sub={sel.status === 'maintenance' ? 'in service bay' : `${sel.fuel.mpgRecent.toFixed(1)} mpg recent`}
                  color="blue"
                />
              </div>

              {/* GPS Quality + Jamming cross-reference (Aegis wedge: phone GNSS + ADS-B) */}
              <div className="mb-6 p-4 rounded border border-slate-800 bg-slate-900/50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-bold">
                    GPS Quality + Jamming
                  </h3>
                  {(() => {
                    const j = jammingMap[sel.id];
                    if (!j) return null;
                    const colorClass =
                      j.level === 'direct' ? 'text-red-400 border-red-500/40 bg-red-500/10' :
                      j.level === 'probable' ? 'text-orange-400 border-orange-500/40 bg-orange-500/10' :
                      j.level === 'possible' ? 'text-amber-400 border-amber-500/40 bg-amber-500/10' :
                      'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
                    return (
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-widest font-bold border ${colorClass}`}>
                        {j.level === 'none' ? 'Clear' : j.level}
                      </span>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Accuracy</div>
                    <div className="font-mono text-slate-200">
                      {typeof sel.location.accuracyM === 'number' ? `${sel.location.accuracyM.toFixed(0)} m` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Cn0 avg</div>
                    <div className={`font-mono ${
                      typeof sel.location.cn0AvgDbhz === 'number' && sel.location.cn0AvgDbhz < 20
                        ? 'text-rose-400' : 'text-slate-200'
                    }`}>
                      {typeof sel.location.cn0AvgDbhz === 'number' ? `${sel.location.cn0AvgDbhz.toFixed(0)} dBHz` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Fix source</div>
                    <div className="font-mono text-slate-200 capitalize">
                      {sel.location.fixSource ?? 'unknown'}
                    </div>
                  </div>
                </div>
                {jammingMap[sel.id]?.level !== 'none' && jammingMap[sel.id]?.reason && (
                  <div className="mt-3 p-2 rounded bg-slate-950/50 border border-slate-800 text-xs text-slate-300">
                    <span className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mr-2">Reason</span>
                    {jammingMap[sel.id].reason}
                  </div>
                )}
                {typeof sel.location.spoofingSuspected === 'boolean' && sel.location.spoofingSuspected && (
                  <div className="mt-3 px-3 py-2 rounded bg-red-500/15 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
                    <span className="text-red-400 font-bold uppercase tracking-widest">⚠ Spoofing</span>
                    Driver phone reports GNSS anomaly. Confirm with FMC003 readings and pull over if route deviation.
                  </div>
                )}
              </div>

              {/* Faults */}
              {sel.faults.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-bold mb-3">
                    J1939 Faults · {sel.faults.length}
                  </h3>
                  <div className="space-y-2">
                    {sel.faults.map((f) => (
                      <div
                        key={f.code}
                        className={`p-3 rounded border ${
                          f.severity === 'critical'
                            ? 'bg-red-500/10 border-red-500/40'
                            : f.severity === 'warning'
                            ? 'bg-amber-500/10 border-amber-500/40'
                            : 'bg-slate-800/50 border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-bold text-white">{f.code}</span>
                          <span
                            className={`text-[10px] uppercase tracking-widest font-bold ${
                              f.severity === 'critical'
                                ? 'text-red-400'
                                : f.severity === 'warning'
                                ? 'text-amber-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {f.severity}
                          </span>
                        </div>
                        <p className="text-sm mt-1 text-slate-300">{f.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Maintenance */}
              <div className="mb-6 p-4 rounded border border-slate-800 bg-slate-900/50">
                <h3 className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-bold mb-3">
                  Maintenance
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">
                      Next service
                    </div>
                    <div className="font-mono text-slate-200 text-base">
                      {sel.maintenance.dueService.replace('_', ' ')}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      in {(sel.maintenance.nextServiceMiles - sel.maintenance.currentMiles).toLocaleString()} mi
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">
                      DOT inspection
                    </div>
                    <div
                      className={`font-mono text-base ${
                        sel.maintenance.daysUntilDOT < 14 ? 'text-amber-400' : 'text-slate-200'
                      }`}
                    >
                      {sel.maintenance.daysUntilDOT} days
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {sel.maintenance.currentMiles.toLocaleString()} mi on odometer
                    </div>
                  </div>
                </div>
              </div>

              {/* Highway CCTV — cameras near this truck */}
              <HighwayCCTV truck={sel} />
            </div>
          ) : (
            <div className="text-center py-20 text-slate-500">Select a truck to view details</div>
          )}
        </main>
      </div>

      {/* Chat FAB */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className="fixed bottom-6 right-6 pl-4 pr-5 h-14 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 flex items-center gap-2 shadow-[0_8px_32px_rgba(251,191,36,0.4)] hover:scale-105 transition font-bold text-sm"
      >
        <Shield className="w-5 h-5" />
        Ask Aegis
      </button>

      {/* Chat panel */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 w-96 h-[600px] bg-slate-900 border border-amber-500/30 rounded-lg shadow-2xl flex flex-col"
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-400" />
                <div>
                  <div className="font-bold text-amber-400">Aegis · FleetGPT</div>
                  <div className="text-[10px] text-slate-500">
                    {sel ? `Context: ${sel.id}` : 'Fleet-wide'} ·{' '}
                    <span className="text-emerald-400">privacy-guarded</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 && (
                <div className="text-center py-6 text-slate-400 text-sm">
                  <div className="mb-4">Ask Aegis anything about your fleet:</div>
                  <div className="space-y-2 text-left">
                    {[
                      'What is the current fleet status?',
                      'Which trucks have critical faults?',
                      'Are any drivers approaching HOS limits?',
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => askQuick(q)}
                        className="w-full text-left text-xs p-2.5 rounded bg-slate-800/50 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/30 transition"
                      >
                        → {q}
                      </button>
                    ))}
                    {sel && sel.faults[0] && (
                      <button
                        onClick={() =>
                          askQuick(`What does ${sel.faults[0].code} mean for ${sel.id}?`)
                        }
                        className="w-full text-left text-xs p-2.5 rounded bg-slate-800/50 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/30 transition"
                      >
                        → What does {sel.faults[0].code} mean for {sel.id}?
                      </button>
                    )}
                  </div>
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] p-3 rounded text-sm ${
                      m.role === 'user' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-100'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                    {m.citations && m.citations.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-700 text-[10px] text-slate-500">
                        <div className="uppercase tracking-widest mb-1">Sources</div>
                        {m.citations.map((c, j) => (
                          <div key={j}>• {c}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 p-3 rounded flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Aegis is thinking...
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                  placeholder="Ask Aegis..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                />
                <button
                  onClick={sendChat}
                  disabled={chatLoading || !chatInput.trim()}
                  className="px-3 py-2 bg-amber-500 text-slate-900 rounded disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2 text-[9px] text-slate-600 leading-relaxed">
                Driver PII is isolated by Privacy Guardian. Aegis sees only role-permitted fields.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Privacy Guardian modal */}
      <AnimatePresence>
        {privacyOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setPrivacyOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-[#0a0e1a] border border-amber-500/30 rounded-lg shadow-2xl overflow-hidden"
            >
              <div className="p-5 border-b border-slate-800 flex items-start justify-between bg-gradient-to-r from-amber-500/10 via-transparent to-transparent">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                    <ShieldAlert className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-base font-bold text-white">Privacy Guardian</div>
                    <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-bold">Driver PII Isolation</div>
                  </div>
                </div>
                <button onClick={() => setPrivacyOpen(false)} className="text-slate-500 hover:text-slate-300">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-sm text-slate-300">
                <p>
                  Aegis treats driver PII as a <span className="text-amber-300 font-semibold">separate trust boundary</span> from fleet
                  telemetry. Driver names, CDL numbers, phone numbers, and hire date are encrypted at rest and gated by role.
                </p>

                <div className="grid grid-cols-1 gap-2">
                  <RoleCard
                    icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}
                    title="Fleet Manager (you)"
                    body="Full names, contact info, CDL details. Can dispatch, message, and re-assign."
                  />
                  <RoleCard
                    icon={<Eye className="w-4 h-4 text-amber-400" />}
                    title="Agent / API consumer"
                    body="Initials only (e.g. M.J.). Sees duty status, faults, location. No CDL or phone."
                  />
                  <RoleCard
                    icon={<EyeOff className="w-4 h-4 text-slate-400" />}
                    title="Third-party viewer"
                    body="No name at all. Only truck ID, anonymized route, and aggregate stats."
                  />
                </div>

                <div className="p-3 rounded border border-slate-800 bg-slate-900/50 text-xs text-slate-400 flex items-start gap-2">
                  <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="text-slate-200 font-semibold">How it works:</span> every driver record is stored with
                    per-tenant encryption. API responses are masked server-side based on the requester's role — not the client.
                    Toggle above to see the difference live.
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  onClick={() => setRole('manager')}
                  className="px-3 py-2 rounded text-xs font-bold bg-amber-500 text-slate-900 hover:bg-amber-400 transition"
                >
                  View as Fleet Manager
                </button>
                <button
                  onClick={() => setRole('agent')}
                  className="px-3 py-2 rounded text-xs font-bold border border-slate-700 text-slate-300 hover:text-amber-300 hover:border-amber-500/50 transition"
                >
                  View as Agent
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/50 px-6 py-2 text-[10px] text-slate-500 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Shield className="w-3 h-3 text-amber-500" /> Aegis v0.2 · fleet command
        </span>
        <span className="text-amber-500/70">Privacy Guardian v1 · driver PII isolated</span>
        <span className="text-slate-600">FleetGPT · {sel ? `truck ${sel.id}` : 'fleet-wide'}</span>
      </footer>
    </div>
  );
}

// ───────────────────────── helpers ─────────────────────────

function vinShort(_t: TruckData) {
  // Stub: real VIN would come from API
  return '1FUJGLDR8KL•••';
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'emerald' | 'amber' | 'blue' | 'slate' | 'red';
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    blue: 'text-blue-400',
    slate: 'text-slate-500',
    red: 'text-red-400',
  };
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded p-2">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-0.5">{label}</div>
      <div className={`text-lg font-bold ${colorMap[color]}`}>{value}</div>
    </div>
  );
}

function CriticalBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="px-3 py-1.5 rounded border border-red-500/40 bg-red-500/10 text-red-300 text-xs flex items-center gap-2 font-medium">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function WarnBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="px-3 py-1.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs flex items-center gap-2 font-medium">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function StatusPill({ status, large }: { status: string; large?: boolean }) {
  const config: Record<string, { bg: string; text: string; dot: string }> = {
    moving: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', dot: 'bg-emerald-400' },
    idle: { bg: 'bg-amber-500/20', text: 'text-amber-300', dot: 'bg-amber-400' },
    maintenance: { bg: 'bg-blue-500/20', text: 'text-blue-300', dot: 'bg-blue-400' },
    offline: { bg: 'bg-slate-700/50', text: 'text-slate-400', dot: 'bg-slate-500' },
  };
  const c = config[status] || config.offline;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded uppercase tracking-widest font-medium ${
        large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[10px]'
      } ${c.bg} ${c.text}`}
    >
      <div
        className={`w-1.5 h-1.5 rounded-full ${c.dot} ${
          status === 'moving' ? 'animate-pulse' : ''
        }`}
      />
      {status}
    </span>
  );
}

function TelemetryCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: 'emerald' | 'amber' | 'red' | 'blue';
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
    amber: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
    red: 'text-red-400 border-red-500/30 bg-red-500/5',
    blue: 'text-blue-400 border-blue-500/30 bg-blue-500/5',
  };
  return (
    <div className={`p-4 rounded border ${colorMap[color]}`}>
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
        {icon}
        <span className="uppercase tracking-widest text-[10px] font-bold">{label}</span>
      </div>
      <div className="text-2xl font-bold font-mono text-white">{value}</div>
      <div className="text-[10px] text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

function FleetMap({
  trucks,
  selectedTruck,
  onSelect,
}: {
  trucks: Array<{
    id: string;
    lat: number;
    lng: number;
    status: string;
    address: string;
    accuracyM?: number;
    cn0AvgDbhz?: number;
    satellitesUsed?: number;
    spoofingSuspected?: boolean;
    fixSource?: 'phone_gps' | 'fmc003' | 'fused';
  }>;
  selectedTruck: string;
  onSelect: (id: string) => void;
}) {
  const bounds = { minLat: 29.3, maxLat: 30.6, minLng: -98.0, maxLng: -97.4 };
  const project = (lat: number, lng: number) => {
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
    const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 100;
    return { x, y };
  };

  const statusColor: Record<string, string> = {
    moving: '#10b981',
    idle: '#f59e0b',
    maintenance: '#3b82f6',
    offline: '#64748b',
  };

  // GPS quality overrides status when accuracy is degraded or spoofing is suspected.
  // This is the Aegis wedge — Samsara/Motive/Geotab never see this signal.
  const gpsColor = (t: { accuracyM?: number; cn0AvgDbhz?: number; spoofingSuspected?: boolean }): string | null => {
    if (t.spoofingSuspected) return '#dc2626'; // red — direct spoofing
    if (typeof t.cn0AvgDbhz === 'number' && t.cn0AvgDbhz < 20) return '#f43f5e'; // rose — degraded GNSS
    if (typeof t.accuracyM === 'number' && t.accuracyM > 30) return '#eab308'; // yellow — marginal accuracy
    return null;
  };
  const dotColor = (t: { status: string; accuracyM?: number; cn0AvgDbhz?: number; spoofingSuspected?: boolean }) =>
    gpsColor(t) ?? statusColor[t.status] ?? '#64748b';

  return (
    <div className="w-full h-full relative">
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#1e293b" strokeWidth="0.2" />
          </pattern>
          <radialGradient id="mapGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0f172a" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.4" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />
        <rect width="100" height="100" fill="url(#mapGlow)" />

        {/* I-35 corridor */}
        <line x1="35" y1="0" x2="65" y2="100" stroke="#fbbf24" strokeWidth="0.3" strokeOpacity="0.3" strokeDasharray="2,2" />

        {/* City labels */}
        <text x="48" y="32" fontSize="1.5" fill="#64748b" textAnchor="middle">AUSTIN</text>
        <text x="62" y="38" fontSize="1.2" fill="#64748b" textAnchor="middle">ROUND ROCK</text>
        <text x="42" y="86" fontSize="1.2" fill="#64748b" textAnchor="middle">SAN ANTONIO</text>

        {/* Truck markers */}
        {trucks.map((t) => {
          const { x, y } = project(t.lat, t.lng);
          const isSelected = t.id === selectedTruck;
          const color = dotColor(t);
          const gpsIssue = gpsColor(t);
          return (
            <g key={t.id} onClick={() => onSelect(t.id)} style={{ cursor: 'pointer' }}>
              {isSelected && (
                <circle cx={x} cy={y} r="3" fill="none" stroke="#fbbf24" strokeWidth="0.3" opacity="0.6">
                  <animate attributeName="r" from="2" to="6" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.8" to="0" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              {gpsIssue && (
                <circle cx={x} cy={y} r="2.5" fill="none" stroke={gpsIssue} strokeWidth="0.2" opacity="0.5">
                  <animate attributeName="r" from="2" to="5" dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.7" to="0" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={x} cy={y} r={isSelected ? 1.5 : 1} fill={color} stroke="#fff" strokeWidth="0.2" />
              <text x={x} y={y - 2.5} fontSize="1.5" fill="#fff" textAnchor="middle" fontWeight="bold">
                {t.id}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-2 right-2 text-[9px] text-slate-500 bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
        Aegis Map · TX Region · {trucks.length} trucks
      </div>
      <div className="absolute bottom-2 left-2 text-[9px] text-slate-300 bg-slate-900/85 px-2 py-1 rounded border border-slate-800 flex items-center gap-3">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Moving</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Idle</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> Offline</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" /> Marginal GPS</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Spoofed</span>
      </div>
      <div className="absolute top-2 left-2 text-[9px] text-slate-500 bg-slate-900/80 px-2 py-1 rounded border border-slate-800 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        live telemetry · 10s refresh
      </div>
    </div>
  );
}

// ───────────────────── Privacy Guardian components ─────────────────────

function RoleToggle({
  role,
  setRole,
  onShowInfo,
}: {
  role: PrivacyRole;
  setRole: (r: PrivacyRole) => void;
  onShowInfo: () => void;
}) {
  const labels: PrivacyRole[] = ['manager', 'agent', 'viewer'];
  const icons: Record<PrivacyRole, React.ReactNode> = {
    manager: <ShieldCheck className="w-3.5 h-3.5" />,
    agent: <Eye className="w-3.5 h-3.5" />,
    viewer: <EyeOff className="w-3.5 h-3.5" />,
  };
  return (
    <div className="hidden sm:flex items-center gap-2">
      <div className="inline-flex rounded-md border border-slate-700 bg-slate-900/60 p-0.5">
        {labels.map((l) => {
          const active = role === l;
          return (
            <button
              key={l}
              onClick={() => setRole(l)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] uppercase tracking-widest font-bold transition ${
                active
                  ? l === 'manager'
                    ? 'bg-amber-500 text-slate-900'
                    : 'bg-slate-700 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={`View as ${l}`}
            >
              {icons[l]}
              <span>{l}</span>
            </button>
          );
        })}
      </div>
      <button
        onClick={onShowInfo}
        className="p-1.5 rounded border border-slate-700 text-slate-400 hover:text-amber-300 hover:border-amber-500/50 transition"
        title="About Privacy Guardian"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function PrivacyStrip({
  role,
  onShowInfo,
}: {
  role: PrivacyRole;
  onShowInfo: () => void;
}) {
  const label =
    role === 'agent'
      ? 'Drivers shown as initials — Agent role, no CDL/phone/dob access'
      : 'Drivers fully masked — Viewer role, no name/contact info';
  const Icon = role === 'agent' ? Eye : EyeOff;
  return (
    <button
      onClick={onShowInfo}
      className="mt-3 w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition group"
    >
      <div className="flex items-center gap-2 text-amber-300 text-xs">
        <ShieldAlert className="w-4 h-4" />
        <Icon className="w-3.5 h-3.5" />
        <span className="uppercase tracking-widest text-[10px] font-bold">Privacy Guardian · {role}</span>
        <span className="text-slate-400 normal-case tracking-normal font-normal">{label}</span>
      </div>
      <span className="text-[10px] uppercase tracking-widest text-amber-400 font-medium opacity-0 group-hover:opacity-100 transition">
        How it works &rarr;
      </span>
    </button>
  );
}

function DriverName({
  driver,
  role,
  compact,
}: {
  driver?: Driver;
  role: PrivacyRole;
  compact?: boolean;
}) {
  if (!driver) return <span>—</span>;
  const masked = role !== 'manager';
  if (!masked) {
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-200">
        {driver.name}
        <ShieldCheck className="w-3 h-3 text-emerald-400" aria-label="PII unlocked" />
      </span>
    );
  }
  const initials = driver.name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .join('.');
  return (
    <span className="inline-flex items-center gap-1.5 text-slate-400">
      <span className={`font-mono ${compact ? '' : 'px-1.5 py-0.5 bg-slate-800 rounded text-[11px]'}`}>
        {initials}.
      </span>
      <Lock className="w-3 h-3 text-amber-400" aria-label="PII locked" />
    </span>
  );
}

function RoleCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded border border-slate-800 bg-slate-900/40">
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-slate-100 text-xs uppercase tracking-widest">{title}</div>
        <div className="text-xs text-slate-400 mt-1">{body}</div>
      </div>
    </div>
  );
}
