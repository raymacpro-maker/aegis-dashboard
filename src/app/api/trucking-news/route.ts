// src/app/api/trucking-news/route.ts
//
// Aegis — Trucking Industry News API.
//
// Aggregates 4 Google News RSS feeds (US, en-US) covering:
//   - "trucking" + "freight" + "FMCSA" + "ELD" + "HOS"
//   - "trucking accident" + "highway safety"
//   - "freight rates" + "spot rates" + "freight market"
//   - "trucker" + "CDL" + "driver shortage"
//
// Each feed is filtered to items published in the last 36 hours
// (today + a small overnight window so we don't lose late posts).
// Items are deduped by normalized title, then sorted by date desc.
//
// Source: Google News RSS — 100s of trucking publications aggregated:
//   FreightWaves, Land Line Media, Journal of Commerce, DC Velocity,
//   Transport Topics, FleetOwner, Trucking Dive, Overdrive, CDLLife,
//   HDT, Truckers News, ABC7/CBS/NBC local news for trucking accidents,
//   FreightWaves SONAR, FMCSA press, OOIDA, ATA, etc.
//
// Cache: 10 minutes (trucking news doesn't break every minute).

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 600; // 10 min

const FEEDS = [
  // Core trucking + regulatory (FMCSA, HOS, ELD)
  'https://news.google.com/rss/search?q=%22trucking%22+OR+%22truck+driver%22+OR+%22FMCSA%22+OR+%22HOS%22+OR+%22ELD+rule%22&hl=en-US&gl=US&ceid=US:en',
  // Truckload rates + truckload freight market
  'https://news.google.com/rss/search?q=%22truckload+rates%22+OR+%22spot+rates%22+OR+%22dry+van%22+OR+%22reefer+rates%22&hl=en-US&gl=US&ceid=US:en',
  // Truck safety + highway accidents
  'https://news.google.com/rss/search?q=%22trucking+accident%22+OR+%22semi+truck+crash%22+OR+%22big+rig%22+OR+%22tractor+trailer%22&hl=en-US&gl=US&ceid=US:en',
  // Drivers + CDL + owner-operators
  'https://news.google.com/rss/search?q=%22CDL%22+OR+%22owner+operator%22+OR+%22trucker%22+OR+%22driver+shortage%22&hl=en-US&gl=US&ceid=US:en',
];

// Blacklist: drop items that are mostly about non-trucking modes
// (ocean shipping, rail freight, harbor freight retail, etc).
const OFFTOPIC_TERMS = [
  /\bocean freight\b/i,
  /\bocean shipping\b/i,
  /\bmaritime shipping\b/i,
  /\brailway freight\b/i,
  /\brail freight\b/i,
  /\bharbor freight\b(?! from)/i,   // "harbor freight tools" retail store
  /\bcontainer shipping\b/i,
  /\bport congestion\b/i,
  /\bshipowner\b/i,
  /\bcruise ship\b/i,
  /\bFar East\b/i,                  // mostly about ocean shipping
  /\bshipping container\b/i,
  /\bcontainer port\b/i,
  /\bport of (los angeles|long beach|shanghai|singapore|rotterdam)/i,
];

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — today only
const MAX_ITEMS = 12;

type NewsItem = {
  id: string;
  title: string;
  link: string;
  pubDate: string;       // ISO 8601
  pubDateRaw: string;    // original RSS string
  ageHours: number;      // hours since published
  source: string;
  sourceUrl: string;
  category: 'industry' | 'rates' | 'safety' | 'drivers';
};

function parseRssDate(s: string): number {
  // RFC 822 e.g. "Tue, 30 Jun 2026 09:07:02 GMT"
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

function stripHtml(s: string): string {
  return s.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .trim();
}

function normalizeTitle(s: string): string {
  // Lowercase, strip punctuation, collapse whitespace, remove common
  // suffixes that vary between Google News duplicates.
  return s.toLowerCase()
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(the|a|an)\b/g, '')
    .replace(/\b(source|says|reports|according to)\b/g, '')
    .trim()
    .slice(0, 120);
}

function extractItems(xml: string, category: NewsItem['category']): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const titleM = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkM = block.match(/<link>([\s\S]*?)<\/link>/);
    const pubM = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const sourceM = block.match(/<source[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/);
    if (!titleM || !linkM || !pubM) continue;
    const pubMs = parseRssDate(pubM[1]);
    if (!pubMs) continue;
    items.push({
      id: `${category}-${pubMs}-${titleM[1].slice(0, 40)}`,
      title: stripHtml(titleM[1]),
      link: stripHtml(linkM[1]),
      pubDate: new Date(pubMs).toISOString(),
      pubDateRaw: pubM[1],
      ageHours: Math.max(0, (Date.now() - pubMs) / (60 * 60 * 1000)),
      source: sourceM ? stripHtml(sourceM[2]) : 'Unknown',
      sourceUrl: sourceM ? sourceM[1] : '',
      category,
    });
  }
  return items;
}

async function fetchFeed(url: string, category: NewsItem['category']): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Aegis-NewsBot/1.0 (+trucking intelligence)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return extractItems(xml, category);
  } catch {
    return [];
  }
}

export async function GET() {
  const now = Date.now();
  // Fetch all 4 feeds in parallel
  const results = await Promise.all([
    fetchFeed(FEEDS[0], 'industry'),
    fetchFeed(FEEDS[1], 'rates'),
    fetchFeed(FEEDS[2], 'safety'),
    fetchFeed(FEEDS[3], 'drivers'),
  ]);

  // Merge + filter to last 36h, drop offtopic items, require trucking terms
  const TRUCKING_TERMS = [
    /truck/i, /trucker/i, /trucking/i, /FMCSA/i, /HOS/i, /ELD/i, /CDL/i,
    /owner[- ]operator/i, /tractor[- ]trailer/i, /semi/i, /big rig/i,
    /dry van/i, /reefer/i, /flatbed/i, /diesel/i, /freight rates/i,
    /spot rate/i, /truckload/i, /LTL/i, /drayage/i, /intermodal/i,
    /broker/i, /dispatcher/i, /detention/i, /hours of service/i,
  ];
  // Drop product listings, classifieds, obituaries, opinion pieces
  const DROP_PATTERNS = [
    /\$\d/,                  // anything with a $ sign in the title (price)
    /\bfor sale\b/i,
    /\bobituar/i,
    /\bdeaths?\b/i,
    /\bdies at\b/i,
    /\bhat\b/i,              // product merch "trucker hat"
    /\bapparel\b/i,
    /\bgift\b/i,
  ];
  // Spam/low-quality source domains we've seen
  const BLOCKED_SOURCES = [
    'santo andré biz',
    'yupoong',
  ];
  const all = results.flat().filter((n) => {
    if (now - new Date(n.pubDate).getTime() > MAX_AGE_MS) return false;
    if (OFFTOPIC_TERMS.some((re) => re.test(n.title))) return false;
    if (!TRUCKING_TERMS.some((re) => re.test(n.title))) return false;
    if (DROP_PATTERNS.some((re) => re.test(n.title))) return false;
    if (BLOCKED_SOURCES.some((s) => n.source.toLowerCase().includes(s))) return false;
    return true;
  });

  // Dedupe by normalized title
  const seen = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const n of all) {
    const key = normalizeTitle(n.title);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(n);
  }

  // Sort by date desc + cap at MAX_ITEMS
  deduped.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  const items = deduped.slice(0, MAX_ITEMS);

  return NextResponse.json(
    {
      items,
      total: items.length,
      total_collected: all.length,
      total_deduped: deduped.length,
      hours_window: MAX_AGE_MS / (60 * 60 * 1000),
      feeds: [
        { category: 'industry', url: FEEDS[0] },
        { category: 'rates',    url: FEEDS[1] },
        { category: 'safety',   url: FEEDS[2] },
        { category: 'drivers',  url: FEEDS[3] },
      ],
      source: 'Google News RSS aggregator (trucking/freight/FMCSA/HOS/safety/drivers)',
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
      },
    },
  );
}