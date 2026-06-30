// src/app/api/sa-trucking-news/route.ts
//
// Aegis — South Africa Trucking News API.
//
// Aggregates 2 SA-specific trucking RSS feeds:
//   - satrucker.co.za (driver-focused, breaking news, fuel prices, ports)
//   - truckandfreight.co.za (industry insider, RFA-aligned)
//
// Each item is classified by SA trucking region based on title keywords:
//   - National: applies to all of SA (diesel prices, border policy, SARS, etc.)
//   - Gauteng: JHB, Pretoria, City Deep, OR Tambo, N1/N14/R21
//   - KZN: Durban, Pietermaritzburg, Richards Bay, N2/N3, Port of Durban
//   - Western Cape: Cape Town, Paarl, N1/N2/N7, Port of Cape Town
//   - Eastern Cape: Port Elizabeth, East London, M19/N2
//   - Mpumalanga: Nelspruit, N4 (Maputo corridor), Komatipoort, Lebombo border
//   - Limpopo: Beitbridge border, Polokwane, N1 north
//
// Each region has its own coordinate for map display:
//   - Gauteng: -26.2041, 28.0473 (Johannesburg)
//   - KZN: -29.8587, 31.0218 (Durban)
//   - Western Cape: -33.9249, 18.4241 (Cape Town)
//   - Eastern Cape: -33.9608, 25.6022 (Port Elizabeth)
//   - Mpumalanga: -25.4753, 30.9694 (Nelspruit)
//   - Limpopo: -23.9045, 29.4687 (Polokwane)
//
// Cache: 10 minutes (SA trucking news doesn't break every minute).

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 600;

const FEEDS = [
  {
    url: 'https://satrucker.co.za/feed/',
    source: 'SATrucker',
    fallbackUrl: 'https://www.satrucker.co.za/feed/',
  },
  {
    url: 'https://truckandfreight.co.za/feed/',
    source: 'Truck & Freight',
  },
];

const MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours
const MAX_ITEMS_PER_REGION = 8;
const MAX_ITEMS_TOTAL = 25;

type Region = 'national' | 'gauteng' | 'kzn' | 'western-cape' | 'eastern-cape' | 'mpumalanga' | 'limpopo';

type RegionMeta = {
  key: Region;
  label: string;
  city: string;
  lat: number;
  lng: number;
  keywords: RegExp[];
};

// Order matters: more specific patterns first
const REGIONS: RegionMeta[] = [
  {
    key: 'gauteng',
    label: 'Gauteng',
    city: 'Johannesburg',
    lat: -26.2041,
    lng: 28.0473,
    keywords: [
      /\bJohannesburg\b/i, /\bJHB\b/, /\bPretoria\b/i, /\bTshwane\b/i,
      /\bGauteng\b/i, /\bCity Deep\b/i, /\bOR Tambo\b/i, /\bGermiston\b/i,
      /\bBoksburg\b/i, /\bBenoni\b/i, /\bMidrand\b/i, /\bSandton\b/i,
      /\bN14\b/, /\bR21\b/, /\bR24\b/, /\bN1 (north|south).*Gauteng/i,
      /\bGauteng.*N1/i, /\bEast Rand\b/i, /\bWest Rand\b/i,
    ],
  },
  {
    key: 'kzn',
    label: 'KwaZulu-Natal',
    city: 'Durban',
    lat: -29.8587,
    lng: 31.0218,
    keywords: [
      /\bDurban\b/i, /\bKZN\b/, /\bKwaZulu\b/i, /\bPietermaritzburg\b/i,
      /\bPMB\b/, /\bRichards Bay\b/i, /\bNewcastle\b/i, /\bLadysmith\b/i,
      /\bN3\b/, /\bN2.*KZN/i, /\bSouth Coast\b/i, /\bNorth Coast\b/i,
      /\bPort of Durban\b/i, /\bIsipingo\b/i, /\bRossburgh\b/i,
      /\bEdwin Swales\b/i, /\bM4\b.*KZN/i, /\bPinetown\b/i,
    ],
  },
  {
    key: 'western-cape',
    label: 'Western Cape',
    city: 'Cape Town',
    lat: -33.9249,
    lng: 18.4241,
    keywords: [
      /\bCape Town\b/i, /\bWestern Cape\b/i, /\bPaarl\b/i, /\bStellenbosch\b/i,
      /\bWorcester\b/i, /\bGeorge\b/i, /\bKnysna\b/i, /\bMossel Bay\b/i,
      /\bN1.*Cape/i, /\bN2.*Cape/i, /\bN7\b/, /\bM1\b.*Cape/i,
      /\bPort of Cape Town\b/i, /\bMelkbosstrand\b/i, /\bTable Bay\b/i,
    ],
  },
  {
    key: 'eastern-cape',
    label: 'Eastern Cape',
    city: 'Port Elizabeth',
    lat: -33.9608,
    lng: 25.6022,
    keywords: [
      /\bPort Elizabeth\b/i, /\bGqeberha\b/i, /\bPE\b.*truck/i,
      /\bEast London\b/i, /\bEastern Cape\b/i, /\bUitenhage\b/i,
      /\bMthatha\b/i, /\bUmtata\b/i, /\bM19\b/, /\bN2.*Eastern/i,
      /\bPort of PE\b/i, /\bPort of East London\b/i,
    ],
  },
  {
    key: 'mpumalanga',
    label: 'Mpumalanga',
    city: 'Nelspruit',
    lat: -25.4753,
    lng: 30.9694,
    keywords: [
      /\bNelspruit\b/i, /\bMbombela\b/i, /\bMpumalanga\b/i,
      /\bN4\b/, /\bMaputo\b/i, /\bKomatipoort\b/i, /\bLebombo\b/i,
      /\bWitbank\b/i, /\bemalahleni\b/i, /\bMiddelburg\b/i, /\bSecunda\b/i,
      /\bTrichardt\b/i, /\bKranskop\b/i, /\bHazyview\b/i,
    ],
  },
  {
    key: 'limpopo',
    label: 'Limpopo',
    city: 'Polokwane',
    lat: -23.9045,
    lng: 29.4687,
    keywords: [
      /\bLimpopo\b/i, /\bPolokwane\b/i, /\bPietersburg\b/i,
      /\bBeitbridge\b/i, /\bMusina\b/i, /\bLouis Trichardt\b/i,
      /\bMakhado\b/i, /\bTzaneen\b/i, /\bPhalaborwa\b/i,
      /\bN1 (north.*Limpopo|Limpopo.*N1)/i, /\bGroblersbrug\b/i,
    ],
  },
];

const NATIONAL_KEYWORDS = [
  /\bdiesel\b/i, /\bfuel price\b/i, /\bpump price\b/i,
  /\bSARS\b/i, /\btax\b/i, /\bFMCSA\b/i,  // unlikely in SA but safety net
  /\border\b/i, /\bcross-border\b/i, /\bcustoms\b/i,
  /\bprotest\b/i, /\bnational shutdown\b/i, /\bload shedding\b/i,
  /\beskom\b/i,
  /\bTransnet\b/i, /\bSARS\b/i,
  /\bfreight association\b/i, /\bRFA\b/i, /\bFTA\b/i,
  /\bAssociation of Fleet Professionals\b/i,
  /\bRoad Freight Association\b/i,
  /\bSouth Africa.*truck/i, /\bSA.*trucker/i,
  /\bSouth Africa\b/i,  // generic catch-all
  /\bnational\b/i,
];

type NewsItem = {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  pubDateRaw: string;
  ageHours: number;
  source: string;
  region: Region;
  regionLabel: string;
  regionCity: string;
  regionLat: number;
  regionLng: number;
};

function parseRssDate(s: string): number {
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
          .replace(/&#8217;/g, "'")
          .replace(/&#8216;/g, "'")
          .replace(/&#8220;/g, '"')
          .replace(/&#8221;/g, '"')
          .trim();
}

function normalizeTitle(s: string): string {
  return s.toLowerCase()
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function classifyRegion(title: string): { region: Region; meta: RegionMeta } {
  // First, find ALL specific regions mentioned in the title
  // (a story can mention multiple regions, e.g. "N3 from Durban to JHB")
  const matchedRegions: RegionMeta[] = [];
  for (const meta of REGIONS) {
    if (meta.keywords.some((re) => re.test(title))) {
      matchedRegions.push(meta);
    }
  }
  if (matchedRegions.length === 1) {
    return { region: matchedRegions[0].key, meta: matchedRegions[0] };
  }
  if (matchedRegions.length > 1) {
    // Multi-region story — primary = first match (leftmost in REGIONS order)
    return { region: matchedRegions[0].key, meta: matchedRegions[0] };
  }
  // No specific region — check for national keywords
  const isNational = NATIONAL_KEYWORDS.some((re) => re.test(title));
  if (isNational) {
    return {
      region: 'national',
      meta: {
        key: 'national',
        label: 'National',
        city: 'All SA',
        lat: -28.5,
        lng: 25.0,
        keywords: [],
      },
    };
  }
  // Truly generic — fall through to national as a catch-all
  return {
    region: 'national',
    meta: {
      key: 'national',
      label: 'National',
      city: 'All SA',
      lat: -28.5,
      lng: 25.0,
      keywords: [],
    },
  };
}

function extractItems(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const titleM = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkM = block.match(/<link>([\s\S]*?)<\/link>/);
    const pubM = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (!titleM || !linkM || !pubM) continue;
    const pubMs = parseRssDate(pubM[1]);
    if (!pubMs) continue;

    const title = stripHtml(titleM[1]);
    const { region, meta } = classifyRegion(title);
    items.push({
      id: `${source}-${pubMs}-${title.slice(0, 40)}`,
      title,
      link: stripHtml(linkM[1]),
      pubDate: new Date(pubMs).toISOString(),
      pubDateRaw: pubM[1],
      ageHours: Math.max(0, (Date.now() - pubMs) / (60 * 60 * 1000)),
      source,
      region,
      regionLabel: meta.label,
      regionCity: meta.city,
      regionLat: meta.lat,
      regionLng: meta.lng,
    });
  }
  return items;
}

async function fetchFeed(feed: typeof FEEDS[number]): Promise<NewsItem[]> {
  const urls = [feed.url, feed.fallbackUrl].filter(Boolean) as string[];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Aegis-NewsBot/1.0 (+trucking intelligence, +27)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      return extractItems(xml, feed.source);
    } catch {
      continue;
    }
  }
  return [];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const regionFilter = (searchParams.get('region') || 'all') as Region | 'all';

  const now = Date.now();
  const results = await Promise.all(FEEDS.map(fetchFeed));
  let all = results.flat().filter((n) => now - new Date(n.pubDate).getTime() <= MAX_AGE_MS);

  // Dedupe by normalized title
  const seen = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const n of all) {
    const key = normalizeTitle(n.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(n);
  }

  // Sort by date desc
  deduped.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  // Filter by region if specified
  // IMPORTANT: Always include 'national' items even when a specific region
  // is selected — these are usually fuel prices, border policy, SARS, etc.
  // that affect ALL truckers regardless of where they operate.
  let filtered = deduped;
  if (regionFilter !== 'all') {
    filtered = deduped.filter(
      (n) => n.region === regionFilter || n.region === 'national',
    );
  }

  // Cap per region
  const perRegion: Record<string, number> = {};
  const capped: NewsItem[] = [];
  for (const n of filtered) {
    perRegion[n.region] = (perRegion[n.region] || 0) + 1;
    if (perRegion[n.region] <= MAX_ITEMS_PER_REGION && capped.length < MAX_ITEMS_TOTAL) {
      capped.push(n);
    }
  }

  // Group by region for UI
  const byRegion: Record<Region, NewsItem[]> = {
    national: [],
    gauteng: [],
    kzn: [],
    'western-cape': [],
    'eastern-cape': [],
    mpumalanga: [],
    limpopo: [],
  };
  for (const n of capped) {
    byRegion[n.region].push(n);
  }

  return NextResponse.json(
    {
      items: capped,
      total: capped.length,
      total_collected: all.length,
      total_deduped: deduped.length,
      region: regionFilter,
      byRegion,
      regions: REGIONS.map((r) => ({ key: r.key, label: r.label, city: r.city, lat: r.lat, lng: r.lng })),
      counts: {
        national: deduped.filter((n) => n.region === 'national').length,
        gauteng: deduped.filter((n) => n.region === 'gauteng').length,
        kzn: deduped.filter((n) => n.region === 'kzn').length,
        'western-cape': deduped.filter((n) => n.region === 'western-cape').length,
        'eastern-cape': deduped.filter((n) => n.region === 'eastern-cape').length,
        mpumalanga: deduped.filter((n) => n.region === 'mpumalanga').length,
        limpopo: deduped.filter((n) => n.region === 'limpopo').length,
      },
      feeds: FEEDS,
      hours_window: MAX_AGE_MS / (60 * 60 * 1000),
      source: 'SA trucking RSS aggregator (SATrucker + Truck & Freight)',
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
      },
    },
  );
}