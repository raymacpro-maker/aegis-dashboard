'use client';

import { useEffect, useState } from 'react';
import { Globe2, ExternalLink, AlertTriangle, Newspaper, Radio } from 'lucide-react';

type NewsItem = {
  id: string;
  title: string;
  description?: string;
  link?: string;
  published: string;
  source?: string;
};

type LiveFeed = {
  id: string;
  name: string;
  city?: string;
  country?: string;
  url: string;
  category?: string;
};

const SEVERITY_COLORS: Record<string, { dot: string; text: string; bg: string }> = {
  CRITICAL: { dot: 'bg-red-400',    text: 'text-red-300',    bg: 'bg-red-500/10 border-red-500/30' },
  HIGH:     { dot: 'bg-orange-400', text: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/30' },
  MEDIUM:   { dot: 'bg-amber-400',  text: 'text-amber-300',  bg: 'bg-amber-500/10 border-amber-500/30' },
  LOW:      { dot: 'bg-blue-400',   text: 'text-blue-300',   bg: 'bg-blue-500/10 border-blue-500/30' },
};

// Crude keyword-based severity for headlines
function severityOf(title: string): keyof typeof SEVERITY_COLORS {
  const t = title.toLowerCase();
  if (/\b(breach|attack|ransomware|exploit|0day|cve|shutdown|outage|cyber|critical)\b/.test(t)) return 'CRITICAL';
  if (/\b(hack|leak|vulnerability|exposed|stolen|malware|threat)\b/.test(t)) return 'HIGH';
  if (/\b(virus|phishing|scam|warning|alert|suspicious)\b/.test(t)) return 'MEDIUM';
  return 'LOW';
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function GlobalIncidents() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [liveFeeds, setLiveFeeds] = useState<LiveFeed[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const [newsRes, liveRes] = await Promise.allSettled([
          fetch('/api/news'),
          fetch('/api/live-news'),
        ]);
        if (cancelled) return;
        if (newsRes.status === 'fulfilled') {
          const data = await newsRes.value.json();
          // Filter out the obvious spam/auction posts
          const items = (data.news || [])
            .filter((n: NewsItem) => n.title && !/аукцион|ставк/i.test(n.title))
            .slice(0, 8);
          setNews(items);
        }
        if (liveRes.status === 'fulfilled') {
          const data = await liveRes.value.json();
          setLiveFeeds((data.feeds || []).filter((f: LiveFeed) => f.country === 'US').slice(0, 4));
        }
      } catch (e) {
        console.error('GlobalIncidents fetch failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    const iv = setInterval(fetchData, 180_000); // 3 min — news is time-sensitive
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-blue-400" />
          <h3 className="text-[10px] uppercase tracking-[0.25em] text-slate-300 font-bold">
            Global Incidents
          </h3>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          {news.length} stories
        </div>
      </div>

      {loading ? (
        <div className="text-[10px] text-slate-500 py-3 text-center">loading…</div>
      ) : (
        <>
          {/* News items */}
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {news.map((n) => {
              const sev = severityOf(n.title);
              const c = SEVERITY_COLORS[sev];
              return (
                <a
                  key={n.id}
                  href={n.link || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block p-2 rounded border ${c.bg} hover:opacity-80 transition`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${c.dot} mt-1.5 flex-shrink-0`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-slate-100 leading-snug line-clamp-2">
                        {n.title}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[9px] text-slate-500">
                        <span className="uppercase tracking-widest font-bold">{sev}</span>
                        <span>·</span>
                        <span>{timeAgo(n.published)}</span>
                        <ExternalLink className="w-2.5 h-2.5 ml-auto" />
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>

          {/* Live US news streams */}
          {liveFeeds.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-800">
              <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-2 flex items-center gap-1">
                <Radio className="w-2.5 h-2.5" />
                Live US News Streams
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {liveFeeds.map((f) => (
                  <a
                    key={f.id}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 p-1.5 rounded border border-slate-800 hover:border-blue-500/50 transition text-[10px]"
                  >
                    <Newspaper className="w-3 h-3 text-blue-400 flex-shrink-0" />
                    <span className="text-slate-200 truncate">{f.name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="mt-2 text-[9px] text-slate-500 text-center">
            Cyber + world news · severity by keyword heuristic · refresh 3 min
          </div>
        </>
      )}
    </div>
  );
}