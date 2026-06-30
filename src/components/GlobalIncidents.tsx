'use client';

import { useEffect, useState } from 'react';
import { Truck, ExternalLink, TrendingUp, AlertTriangle, Radio } from 'lucide-react';

type NewsItem = {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  ageHours: number;
  source: string;
  sourceUrl: string;
  category: 'industry' | 'rates' | 'safety' | 'drivers';
};

const CATEGORY_META: Record<NewsItem['category'], { label: string; color: string; bg: string; border: string; dot: string }> = {
  industry: { label: 'Industry', color: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   dot: 'bg-amber-400' },
  rates:    { label: 'Rates',    color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  safety:   { label: 'Safety',   color: 'text-red-300',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     dot: 'bg-red-400' },
  drivers:  { label: 'Drivers',  color: 'text-blue-300',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    dot: 'bg-blue-400' },
};

function timeAgo(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function freshDot(hours: number): string {
  if (hours < 1) return 'bg-emerald-400';
  if (hours < 6) return 'bg-amber-400';
  return 'bg-slate-500';
}

export default function GlobalIncidents() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const r = await fetch('/api/trucking-news');
        const data = await r.json();
        if (cancelled) return;
        setItems(data.items || []);
        setTotal(data.total);
        setLastUpdate(Date.now());
      } catch (e) {
        console.error('Trucking news fetch failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    // Refresh every 5 min — news doesn't need to be real-time
    const iv = setInterval(fetchData, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  // Live counter — seconds since last fetch
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const secondsAgo = lastUpdate ? Math.round((Date.now() - lastUpdate) / 1000) : null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-amber-400" />
          <h3 className="text-[10px] uppercase tracking-[0.25em] text-slate-300 font-bold">
            Trucking News
          </h3>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          {loading ? 'loading…' : total !== null ? `${total} today` : ''}
        </div>
      </div>

      {/* Category legend */}
      <div className="flex items-center gap-2 mb-3 text-[9px] text-slate-500">
        {Object.entries(CATEGORY_META).map(([key, m]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`w-1 h-1 rounded-full ${m.dot}`} />
            <span>{m.label}</span>
          </span>
        ))}
      </div>

      {loading ? (
        <div className="text-[10px] text-slate-500 py-3 text-center">loading trucking news…</div>
      ) : items.length === 0 ? (
        <div className="text-[10px] text-slate-500 py-3 text-center">
          No trucking stories in the last 24h
        </div>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
          {items.map((n) => {
            const meta = CATEGORY_META[n.category] || CATEGORY_META.industry;
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
                      <span className={`uppercase tracking-widest font-bold ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-400 truncate max-w-[120px]" title={n.source}>
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
        </div>
      )}

      <div className="mt-2 text-[9px] text-slate-500 text-center flex items-center justify-center gap-1.5">
        <Radio className="w-2.5 h-2.5" />
        Google News RSS · 4 feeds · last 24h · refresh 5m
        {secondsAgo !== null && tick > 0 && (
          <span className="text-slate-600">· {secondsAgo}s ago</span>
        )}
      </div>
    </div>
  );
}