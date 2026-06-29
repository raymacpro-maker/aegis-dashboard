'use client';

import { useEffect, useState } from 'react';
import { Loader2, ArrowUpRight } from 'lucide-react';

type Truck = {
  id: string;
  location: { lat: number; lng: number; address: string };
};

type CamSummary = {
  total: number;
  byState: Record<string, number>;
  byFormat: Record<string, number>;
};

type NearbyCam = {
  id: string;
  state: string;
  description: string;
  lat: number;
  lng: number;
  format: string;
  url: string;
};

// Highway CCTV — cameras within radius of the selected truck, with master summary
export default function HighwayCCTV({ truck }: { truck: Truck }) {
  const [summary, setSummary] = useState<CamSummary | null>(null);
  const [nearby, setNearby] = useState<NearbyCam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1) master summary (cheap)
        const s = await fetch('/api/cameras?summary=1').then((r) => r.json());
        if (!cancelled)
          setSummary({ total: s.total, byState: s.byState, byFormat: s.byFormat } as CamSummary);
        // 2) cameras within ~30mi of this truck (~0.5 deg lat)
        const r = await fetch(
          `/api/cameras?near=${truck.location.lat},${truck.location.lng}&radiusDeg=0.5&limit=12`
        ).then((r) => r.json());
        if (!cancelled) setNearby((r.cameras ?? []) as NearbyCam[]);
      } catch (e) {
        console.error('HighwayCCTV load failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [truck.location.lat, truck.location.lng]);

  const topStates = summary
    ? Object.entries(summary.byState).sort((a, b) => b[1] - a[1]).slice(0, 6)
    : [];

  return (
    <div className="mb-6 p-4 rounded border border-slate-800 bg-slate-900/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] uppercase tracking-[0.25em] text-slate-500 font-bold">
          Highway CCTV · OpenTrafficCamMap
        </h3>
        <a
          href={`/api/cameras?near=${truck.location.lat},${truck.location.lng}&radiusDeg=0.5&limit=200`}
          target="_blank"
          rel="noopener"
          className="text-[10px] text-slate-500 hover:text-amber-300 transition"
        >
          API JSON ↗
        </a>
      </div>

      {/* Summary strip */}
      {summary && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="p-2 rounded border border-slate-800 bg-slate-900/40">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Total cams</div>
            <div className="text-xl font-bold text-amber-400 font-mono">{summary.total.toLocaleString()}</div>
          </div>
          <div className="p-2 rounded border border-slate-800 bg-slate-900/40">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">States</div>
            <div className="text-xl font-bold text-emerald-400 font-mono">
              {Object.keys(summary.byState).length}
            </div>
          </div>
          <div className="p-2 rounded border border-slate-800 bg-slate-900/40">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">H.264 streams</div>
            <div className="text-xl font-bold text-blue-400 font-mono">
              {summary.byFormat.M3U8?.toLocaleString() ?? 0}
            </div>
          </div>
        </div>
      )}

      {/* Top states */}
      {topStates.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">By state</div>
          <div className="flex flex-wrap gap-2">
            {topStates.map(([s, n]) => (
              <span
                key={s}
                className="text-[10px] uppercase tracking-widest px-2 py-1 rounded border border-slate-800 bg-slate-900/40 text-slate-300"
              >
                {s} <span className="text-amber-400 font-mono ml-1">{n.toLocaleString()}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Nearby cameras */}
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">
        Within ~30 mi of {truck.id}{' '}
        <span className="text-slate-400 normal-case tracking-normal">
          ({truck.location.lat.toFixed(3)}, {truck.location.lng.toFixed(3)})
        </span>
      </div>
      {loading ? (
        <div className="text-xs text-slate-500 py-3 flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> loading…
        </div>
      ) : nearby.length === 0 ? (
        <div className="text-xs text-slate-500 py-3">
          No OpenTrafficCamMap cams within radius in this state. (Texas feeds use Houston TranStar + TxDOT ITS — coming soon.)
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {nearby.map((c) => (
            <a
              key={c.id}
              href={c.url}
              target="_blank"
              rel="noopener"
              className="p-2 rounded border border-slate-800 bg-slate-900/40 hover:border-amber-500/40 hover:bg-amber-500/5 transition flex items-start gap-2 group"
            >
              <div
                className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                  c.format === 'M3U8' ? 'bg-blue-400' : 'bg-emerald-400'
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-200 truncate group-hover:text-amber-300">
                  {c.description}
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">
                  {c.state} · {c.format === 'M3U8' ? 'HLS stream' : 'JPEG · refresh'}
                </div>
              </div>
              <ArrowUpRight className="w-3 h-3 text-slate-600 group-hover:text-amber-400 mt-0.5 flex-shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
