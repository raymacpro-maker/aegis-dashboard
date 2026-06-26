'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Truck, AlertTriangle, Activity, Fuel, Wrench, Clock, MapPin, MessageSquare, X, Send, Shield, Loader2 } from 'lucide-react';

type TruckData = {
  id: string;
  status: 'moving' | 'idle' | 'maintenance' | 'offline';
  driverId: string;
  location: { lat: number; lng: number; address: string; speedMph: number };
  hos: { hoursDriven: number; hoursOnDuty: number; hoursRemaining: { drive: number; shift: number; cycle: number }; nextBreakRequiredIn: number };
  fuel: { levelPct: number; mpgRecent: number; estimatedRangeMi: number };
  faults: Array<{ code: string; description: string; severity: 'info' | 'warning' | 'critical' }>;
  maintenance: { daysUntilDOT: number; dueService: string; currentMiles: number; nextServiceMiles: number };
  lastUpdateTs: number;
};

type FleetSummary = {
  totalTrucks: number; moving: number; idle: number; maintenance: number; offline: number;
  criticalFaults: number; warnings: number; hosWarnings: number; lowFuel: number; dotInspectionsDueSoon: number;
};

type Driver = { id: string; name: string; nameEncrypted?: boolean; homeBase: string };

export default function AegisDashboard() {
  const [summary, setSummary] = useState<FleetSummary | null>(null);
  const [trucks, setTrucks] = useState<TruckData[]>([]);
  const [drivers, setDrivers] = useState<Record<string, Driver>>({});
  const [selectedTruck, setSelectedTruck] = useState<string | null>('T-22');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'aegis'; content: string; citations?: string[] }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Fetch fleet data
  useEffect(() => {
    const fetchFleet = async () => {
      try {
        const r = await fetch('/api/telematics');
        const data = await r.json();
        setSummary(data.summary);
        setTrucks(data.fleet.trucks);
        const driverMap: Record<string, Driver> = {};
        for (const d of data.fleet.drivers) driverMap[d.id] = d;
        setDrivers(driverMap);
      } catch (e) {
        console.error('Failed to fetch fleet:', e);
      }
    };
    fetchFleet();
    const iv = setInterval(fetchFleet, 10000); // refresh every 10s
    return () => clearInterval(iv);
  }, []);

  // Send chat message
  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatMessages(m => [...m, { role: 'user', content: userMsg }]);
    setChatInput('');
    setChatLoading(true);
    try {
      const selectedTruckData = selectedTruck ? trucks.find(t => t.id === selectedTruck) : undefined;
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
      setChatMessages(m => [...m, { role: 'aegis', content: data.reply, citations: data.citations }]);
    } catch (e) {
      setChatMessages(m => [...m, { role: 'aegis', content: 'Sorry, I lost connection. Try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Quick question
  const askQuick = (q: string) => {
    setChatInput(q);
    setTimeout(() => sendChat(), 100);
  };

  const sel = selectedTruck ? trucks.find(t => t.id === selectedTruck) : null;
  const selDriver = sel ? drivers[sel.driverId] : null;

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-slate-100 font-sans">
      {/* Header */}
      <header className="border-b border-amber-500/20 bg-gradient-to-r from-[#0a0e1a] via-[#0f1424] to-[#0a0e1a] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Aegis logo - shield */}
            <div className="relative w-10 h-10 flex items-center justify-center">
              <Shield className="w-10 h-10 text-amber-500 fill-amber-500/20" strokeWidth={1.5} />
              <span className="absolute text-amber-400 font-bold text-sm">Æ</span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-wider text-amber-400">AEGIS</h1>
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Fleet Operations Command</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400">LIVE</span>
            </div>
            <div className="text-slate-500 font-mono">{new Date().toUTCString().split(' ')[4]} UTC</div>
            <div className="px-3 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px] uppercase tracking-widest">
              Demo Logistics LLC
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Fleet List (Left) */}
        <aside className="w-80 border-r border-slate-800 overflow-y-auto">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-3">Fleet Status</h2>
            {summary && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Moving" value={summary.moving} color="emerald" />
                <Stat label="Idle" value={summary.idle} color="amber" />
                <Stat label="Service" value={summary.maintenance} color="blue" />
                <Stat label="Offline" value={summary.offline} color="slate" />
              </div>
            )}
            {summary && (summary.criticalFaults > 0 || summary.hosWarnings > 0 || summary.lowFuel > 0) && (
              <div className="mt-3 p-2 rounded bg-red-500/10 border border-red-500/30 text-xs space-y-1">
                {summary.criticalFaults > 0 && <Alert icon={<AlertTriangle className="w-3 h-3" />} text={`${summary.criticalFaults} critical fault${summary.criticalFaults > 1 ? 's' : ''}`} />}
                {summary.hosWarnings > 0 && <Alert icon={<Clock className="w-3 h-3" />} text={`${summary.hosWarnings} HOS break${summary.hosWarnings > 1 ? 's' : ''} due`} />}
                {summary.lowFuel > 0 && <Alert icon={<Fuel className="w-3 h-3" />} text={`${summary.lowFuel} low fuel`} />}
                {summary.dotInspectionsDueSoon > 0 && <Alert icon={<Wrench className="w-3 h-3" />} text={`${summary.dotInspectionsDueSoon} DOT due in 14d`} />}
              </div>
            )}
          </div>

          <div className="p-2">
            <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-2 px-2">Trucks</h2>
            {trucks.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTruck(t.id)}
                className={`w-full text-left p-3 rounded mb-1 border transition ${
                  selectedTruck === t.id
                    ? 'bg-amber-500/10 border-amber-500/50'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-amber-300">{t.id}</span>
                  <StatusPill status={t.status} />
                </div>
                <div className="text-xs text-slate-400">{drivers[t.driverId]?.name || t.driverId}</div>
                <div className="text-[10px] text-slate-500 mt-1">{t.location.address}</div>
                <div className="flex gap-2 mt-1.5 text-[10px]">
                  {t.faults.filter(f => f.severity === 'critical').length > 0 && <span className="text-red-400">● {t.faults.filter(f => f.severity === 'critical').length} critical</span>}
                  {t.faults.filter(f => f.severity === 'warning').length > 0 && <span className="text-amber-400">● {t.faults.filter(f => f.severity === 'warning').length} warn</span>}
                  {t.fuel.levelPct < 0.25 && <span className="text-orange-400">● fuel</span>}
                  {t.hos.nextBreakRequiredIn < 0.5 && <span className="text-yellow-400">● break</span>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Main (Center) — Truck Detail + Map */}
        <main className="flex-1 overflow-y-auto p-6">
          {sel ? (
            <div>
              {/* Fleet Map — hero, top of detail */}
              <div className="mb-6 p-4 rounded border border-slate-800 bg-slate-900/50">
                <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-3">Fleet Map</h3>
                <div className="aspect-[21/9] bg-gradient-to-br from-slate-800 to-slate-900 rounded relative overflow-hidden">
                  <FleetMap
                    trucks={trucks.map(t => ({ id: t.id, lat: t.location.lat, lng: t.location.lng, status: t.status, address: t.location.address }))}
                    selectedTruck={sel.id}
                    onSelect={(id) => setSelectedTruck(id)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-3xl font-bold text-amber-400 tracking-wider">{sel.id}</h2>
                  <p className="text-sm text-slate-400">{selDriver?.name || sel.driverId} • {sel.location.address}</p>
                </div>
                <StatusPill status={sel.status} large />
              </div>

              {/* Telemetry cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <TelemetryCard icon={<Clock className="w-5 h-5" />} label="HOS Drive Left" value={`${sel.hos.hoursRemaining.drive.toFixed(1)}h`} sub={`${sel.hos.hoursDriven.toFixed(1)}h driven`} color={sel.hos.hoursRemaining.drive < 2 ? 'red' : sel.hos.hoursRemaining.drive < 4 ? 'amber' : 'emerald'} />
                <TelemetryCard icon={<Clock className="w-5 h-5" />} label="HOS Shift Left" value={`${sel.hos.hoursRemaining.shift.toFixed(1)}h`} sub={`${sel.hos.hoursOnDuty.toFixed(1)}h on duty`} color={sel.hos.hoursRemaining.shift < 2 ? 'red' : sel.hos.hoursRemaining.shift < 4 ? 'amber' : 'emerald'} />
                <TelemetryCard icon={<Fuel className="w-5 h-5" />} label="Fuel" value={sel.status === 'offline' ? '—' : `${(sel.fuel.levelPct * 100).toFixed(0)}%`} sub={sel.status === 'offline' ? 'no telemetry' : `${sel.fuel.estimatedRangeMi} mi range`} color={sel.fuel.levelPct < 0.25 ? 'red' : 'emerald'} />
                <TelemetryCard icon={<Activity className="w-5 h-5" />} label="Speed" value={sel.status === 'offline' || sel.status === 'maintenance' ? 'Parked' : `${sel.location.speedMph} mph`} sub={sel.status === 'maintenance' ? 'in service bay' : `${sel.fuel.mpgRecent.toFixed(1)} mpg recent`} color="blue" />
              </div>

              {/* Faults */}
              {sel.faults.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-2">J1939 Faults</h3>
                  <div className="space-y-2">
                    {sel.faults.map(f => (
                      <div key={f.code} className={`p-3 rounded border ${
                        f.severity === 'critical' ? 'bg-red-500/10 border-red-500/40' :
                        f.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/40' :
                        'bg-slate-800/50 border-slate-700'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-bold">{f.code}</span>
                          <span className={`text-[10px] uppercase tracking-widest ${
                            f.severity === 'critical' ? 'text-red-400' :
                            f.severity === 'warning' ? 'text-amber-400' :
                            'text-slate-400'
                          }`}>{f.severity}</span>
                        </div>
                        <p className="text-sm mt-1">{f.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Maintenance */}
              <div className="mb-6 p-4 rounded border border-slate-800 bg-slate-900/50">
                <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-3">Maintenance</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-slate-500 text-xs">Next Service</div>
                    <div className="font-mono">{sel.maintenance.dueService.replace('_', ' ')}</div>
                    <div className="text-xs text-slate-500">in {(sel.maintenance.nextServiceMiles - sel.maintenance.currentMiles).toLocaleString()} mi</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs">DOT Inspection</div>
                    <div className={`font-mono ${sel.maintenance.daysUntilDOT < 14 ? 'text-amber-400' : 'text-slate-200'}`}>
                      {sel.maintenance.daysUntilDOT} days
                    </div>
                    <div className="text-xs text-slate-500">{sel.maintenance.currentMiles.toLocaleString()} mi on odometer</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-slate-500">Select a truck to view details</div>
          )}
        </main>
      </div>

      {/* Chat FAB */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className="fixed bottom-6 right-6 px-4 h-14 rounded-full bg-amber-500 text-slate-900 flex items-center gap-2 shadow-lg shadow-amber-500/30 hover:scale-105 transition font-bold text-sm"
      >
        <MessageSquare className="w-5 h-5" />
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
                  <div className="font-bold text-amber-400">Aegis</div>
                  <div className="text-[10px] text-slate-500">FleetGPT • {sel ? `Context: ${sel.id}` : 'Fleet-wide'}</div>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-sm">
                  <div className="mb-4">Ask Aegis anything about your fleet:</div>
                  <div className="space-y-2 text-left">
                    <button onClick={() => askQuick('What is the current fleet status?')} className="w-full text-left text-xs p-2 rounded bg-slate-800/50 hover:bg-slate-800">
                      → What is the current fleet status?
                    </button>
                    <button onClick={() => askQuick('Which trucks have critical faults?')} className="w-full text-left text-xs p-2 rounded bg-slate-800/50 hover:bg-slate-800">
                      → Which trucks have critical faults?
                    </button>
                    <button onClick={() => askQuick('Are any drivers approaching HOS limits?')} className="w-full text-left text-xs p-2 rounded bg-slate-800/50 hover:bg-slate-800">
                      → Are any drivers approaching HOS limits?
                    </button>
                    {sel && (
                      <button onClick={() => askQuick(`What does ${sel.faults[0]?.code || 'this fault code'} mean for ${sel.id}?`)} className="w-full text-left text-xs p-2 rounded bg-slate-800/50 hover:bg-slate-800">
                        → What does {sel.faults[0]?.code || 'this fault'} mean for {sel.id}?
                      </button>
                    )}
                  </div>
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded text-sm ${
                    m.role === 'user' ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-100'
                  }`}>
                    <div className="whitespace-pre-wrap">{m.content}</div>
                    {m.citations && m.citations.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-700 text-[10px] text-slate-500">
                        <div className="uppercase tracking-widest mb-1">Sources</div>
                        {m.citations.map((c, j) => <div key={j}>• {c}</div>)}
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
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendChat()}
                  placeholder="Ask Aegis..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                />
                <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} className="px-3 py-2 bg-amber-500 text-slate-900 rounded disabled:opacity-50">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/30 px-6 py-2 text-[10px] text-slate-600 flex items-center justify-between">
        <span>Aegis v0.1.0 • W1 Day 5 prototype</span>
        <span>Privacy Guardian v1.0 • Driver PII isolated</span>
        <span>FleetGPT RAG: 9 docs (W2: full corpus)</span>
      </footer>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: 'emerald' | 'amber' | 'blue' | 'slate' }) {
  const colorMap = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    blue: 'text-blue-400',
    slate: 'text-slate-500',
  };
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded p-2">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${colorMap[color]}`}>{value}</div>
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
    <span className={`inline-flex items-center gap-1.5 rounded uppercase tracking-widest ${
      large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-[10px]'
    } ${c.bg} ${c.text}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === 'moving' ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  );
}

function TelemetryCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: 'emerald' | 'amber' | 'red' | 'blue' }) {
  const colorMap = {
    emerald: 'text-emerald-400 border-emerald-500/30',
    amber: 'text-amber-400 border-amber-500/30',
    red: 'text-red-400 border-red-500/30',
    blue: 'text-blue-400 border-blue-500/30',
  };
  return (
    <div className={`p-4 rounded border bg-slate-900/50 ${colorMap[color]}`}>
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
        {icon}
        <span className="uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-2xl font-bold font-mono">{value}</div>
      <div className="text-[10px] text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

function Alert({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 text-red-300">
      {icon}
      <span>{text}</span>
    </div>
  );
}

// SVG map: simple stylized Texas region with truck markers
function FleetMap({ trucks, selectedTruck, onSelect }: {
  trucks: Array<{ id: string; lat: number; lng: number; status: string; address: string }>;
  selectedTruck: string;
  onSelect: (id: string) => void;
}) {
  // Austin-area bounds
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

  return (
    <div className="w-full h-full relative">
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
        {/* Grid background */}
        <defs>
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#1e293b" strokeWidth="0.2"/>
          </pattern>
          <radialGradient id="mapGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0f172a" stopOpacity="0"/>
            <stop offset="100%" stopColor="#000" stopOpacity="0.4"/>
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />
        <rect width="100" height="100" fill="url(#mapGlow)" />

        {/* Simulated I-35 corridor */}
        <line x1="35" y1="0" x2="65" y2="100" stroke="#fbbf24" strokeWidth="0.3" strokeOpacity="0.3" strokeDasharray="2,2"/>

        {/* City labels */}
        <text x="48" y="32" fontSize="1.5" fill="#64748b" textAnchor="middle">AUSTIN</text>
        <text x="62" y="38" fontSize="1.2" fill="#64748b" textAnchor="middle">ROUND ROCK</text>
        <text x="42" y="86" fontSize="1.2" fill="#64748b" textAnchor="middle">SAN ANTONIO</text>

        {/* Truck markers */}
        {trucks.map(t => {
          const { x, y } = project(t.lat, t.lng);
          const isSelected = t.id === selectedTruck;
          const color = statusColor[t.status] || '#64748b';
          return (
            <g key={t.id} onClick={() => onSelect(t.id)} style={{ cursor: 'pointer' }}>
              {/* Pulse ring for selected */}
              {isSelected && (
                <circle cx={x} cy={y} r="3" fill="none" stroke="#fbbf24" strokeWidth="0.3" opacity="0.6">
                  <animate attributeName="r" from="2" to="6" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.8" to="0" dur="2s" repeatCount="indefinite" />
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
      <div className="absolute bottom-2 right-2 text-[9px] text-slate-500 bg-slate-900/80 px-2 py-1 rounded">
        Aegis Map • TX Region • 5 trucks
      </div>
    </div>
  );
}
