'use client';

import { useEffect, useState } from 'react';
import { Anchor, AlertTriangle, TrendingUp } from 'lucide-react';

type Chokepoint = {
  name: string;
  lat: number;
  lng: number;
  traffic: string;
  risk: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
};

type Port = {
  name: string;
  country: string;
  lat: number;
  lng: number;
  volume: string;
  rank?: number;
  congestion?: string;
};

const RISK_COLOR: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  LOW:       { bg: 'bg-emerald-500/10', text: 'text-emerald-300', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  MODERATE:  { bg: 'bg-blue-500/10',    text: 'text-blue-300',    border: 'border-blue-500/30',    dot: 'bg-blue-400' },
  ELEVATED:  { bg: 'bg-amber-500/10',   text: 'text-amber-300',   border: 'border-amber-500/30',   dot: 'bg-amber-400' },
  HIGH:      { bg: 'bg-orange-500/10',  text: 'text-orange-300',  border: 'border-orange-500/30',  dot: 'bg-orange-400' },
  CRITICAL:  { bg: 'bg-red-500/10',     text: 'text-red-300',     border: 'border-red-500/30',     dot: 'bg-red-400' },
};

export default function MaritimeOverview() {
  const [chokepoints, setChokepoints] = useState<Chokepoint[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const r = await fetch('/api/maritime');
        const data = await r.json();
        if (cancelled) return;
        setChokepoints(data.chokepoints || []);
        setPorts((data.ports || []).slice(0, 5));
      } catch (e) {
        console.error('MaritimeOverview fetch failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    const iv = setInterval(fetchData, 600_000); // 10 min — chokepoint risk doesn't change fast
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Anchor className="w-4 h-4 text-cyan-400" />
          <h3 className="text-[10px] uppercase tracking-[0.25em] text-slate-300 font-bold">
            Maritime Lanes
          </h3>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          {chokepoints.length} chokepoints
        </div>
      </div>

      {loading ? (
        <div className="text-[10px] text-slate-500 py-3 text-center">loading maritime data…</div>
      ) : (
        <>
          {/* Chokepoints (the "lanes") */}
          <div className="space-y-1.5">
            {chokepoints.slice(0, 5).map((cp) => {
              const c = RISK_COLOR[cp.risk] || RISK_COLOR.LOW;
              return (
                <div
                  key={cp.name}
                  className={`p-2 rounded border ${c.border} ${c.bg} flex items-center justify-between gap-2`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${c.dot} flex-shrink-0`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-slate-100 font-medium truncate">{cp.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{cp.traffic}</div>
                    </div>
                  </div>
                  <span className={`text-[9px] uppercase tracking-widest font-bold ${c.text} flex-shrink-0`}>
                    {cp.risk}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Top ports */}
          {ports.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-800">
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-2 flex items-center gap-1">
                <TrendingUp className="w-2.5 h-2.5" />
                Top Container Ports
              </div>
              <div className="space-y-1">
                {ports.map((p, i) => (
                  <div key={p.name} className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-slate-500 font-mono w-4 text-right">{i + 1}.</span>
                      <span className="text-slate-300 truncate">{p.name}</span>
                      <span className="text-slate-500 text-[9px]">{p.country}</span>
                    </div>
                    <span className="text-slate-500 font-mono text-[9px] truncate ml-2">{p.volume}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2 text-[9px] text-slate-500 text-center">
            Risk levels reflect geopolitical exposure, piracy, congestion · refresh 10 min
          </div>
        </>
      )}
    </div>
  );
}