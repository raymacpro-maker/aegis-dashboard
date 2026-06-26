import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Aegis Agent — FleetGPT-powered chat endpoint.
 *
 * Uses Ollama M3 (cloud) as the base LLM with a minimal trucking-corpus RAG.
 * The full FleetGPT corpus crawl is a W2 deliverable; for W1 Day 5 prototype
 * we ship a seeded RAG with the most-requested trucking knowledge.
 *
 * POST /api/agent/chat
 *   body: { message: string, truckId?: string, context?: { truckData?: any } }
 *   returns: { reply: string, citations?: string[], suggestions?: string[] }
 *
 * Privacy Guardian: messages are NOT logged in prototype. Production: tenant-isolated,
 * encrypted at rest, with audit log + retention policy.
 */

// Seeded trucking knowledge — replaced by full corpus in W2
const CORPUS: Array<{ source: string; text: string }> = [
  {
    source: 'FMCSA 49 CFR §395.3 — Maximum Driving Time',
    text: 'A driver may not drive more than 11 cumulative hours following 10 consecutive hours off-duty. A driver may not drive after the 14th hour on duty following 10 consecutive hours off-duty. A driver may not drive more than 60 hours in 7 consecutive days or 70 hours in 8 consecutive days.',
  },
  {
    source: 'FMCSA 49 CFR §395.3(a)(3)(ii) — 30-Minute Break',
    text: 'Drivers must take a 30-minute break after 8 cumulative hours of driving without at least 30 consecutive minutes off-duty, off-duty in the sleeper berth, or on-duty not driving.',
  },
  {
    source: 'FMCSA ELD Rule §395.20',
    text: 'Most commercial motor vehicles operated by drivers who are required to maintain RODS must use an ELD. The ELD automatically records driving time, engine hours, vehicle miles, and location.',
  },
  {
    source: 'IFTA Articles of Agreement — Quarterly Filing',
    text: 'IFTA quarterly returns are due by the last day of the month following the close of the quarter. Q1: Apr 30, Q2: Jul 31, Q3: Oct 31, Q4: Jan 31. The return reports total miles per jurisdiction and total fuel purchased per jurisdiction.',
  },
  {
    source: 'SAE J1939 — SPN 100 FMI 1',
    text: 'SPN 100 (Engine Oil Pressure) FMI 1 (Low — Most Severe) indicates engine oil pressure is below the manufacturer-specified minimum. Stop the vehicle safely as soon as possible to prevent engine damage. Do not continue driving.',
  },
  {
    source: 'SAE J1939 — SPN 110 FMI 0',
    text: 'SPN 110 (Engine Coolant Temperature) FMI 0 (Above Normal — Most Severe) indicates engine coolant temperature exceeds the maximum threshold. Reduce load, increase idle to cool, check coolant level. Stop if temperature continues to rise.',
  },
  {
    source: 'SAE J1939 — SPN 3251 FMI 0',
    text: 'SPN 3251 (DPF Soot Load) FMI 0 (Above Normal) indicates the diesel particulate filter soot load is high. A regen cycle is needed. If a parked regen is required, follow OEM procedure. Continued driving without regen can cause forced derate.',
  },
  {
    source: 'FMCSA §396.11 — Driver Vehicle Inspection Report (DVIR)',
    text: 'Drivers must complete a written DVIR at the end of each driving day. The report must identify the vehicle and list any defects or deficiencies that would affect safety or result in mechanical breakdown.',
  },
  {
    source: 'CVSA Out-of-Service Criteria — Brake Inspection',
    text: 'A vehicle will be placed out of service if 20% or more of its brake adjusters are out of adjustment, if any brake component is missing or broken, or if there are audible air leaks at the brake chamber.',
  },
];

// Simple TF-IDF-ish retrieval — replaced by vector search in W2
function retrieve(query: string, topK: number = 3): Array<{ source: string; text: string; score: number }> {
  const q = query.toLowerCase();
  const scored = CORPUS.map(doc => {
    const text = doc.text.toLowerCase();
    const source = doc.source.toLowerCase();
    let score = 0;
    // Simple keyword matching with bonus for J1939 codes
    const words = q.split(/\s+/).filter(w => w.length > 2);
    for (const w of words) {
      if (text.includes(w)) score += 1;
      if (source.includes(w)) score += 0.5;
    }
    // Bonus for numeric J1939 codes (SPN-100, FMI-1, etc)
    const spnMatch = q.match(/spn[- ]?(\d+)/i);
    if (spnMatch && source.includes(`spn ${spnMatch[1]}`)) score += 5;
    const fmiMatch = q.match(/fmi[- ]?(\d+)/i);
    if (fmiMatch && source.includes(`fmi ${fmiMatch[1]}`)) score += 3;
    return { ...doc, score };
  });
  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
}

function buildPrompt(userMessage: string, contextDocs: Array<{ source: string; text: string }>, truckContext?: any): string {
  const systemRole = `You are Aegis, an AI fleet operations copilot. You help fleet managers make better decisions across telematics, ELD/HOS compliance, fuel, maintenance, and driver safety. You cite your sources. You are concise and operational — no fluff. If you don't know, say so.`;

  const contextStr = contextDocs.length > 0
    ? `\n\nRelevant trucking knowledge (cite these sources):\n${contextDocs.map(d => `[${d.source}]\n${d.text}`).join('\n\n')}`
    : '';

  const truckStr = truckContext
    ? `\n\nLive truck data:\n${JSON.stringify(truckContext, null, 2)}`
    : '';

  return `${systemRole}${contextStr}${truckStr}\n\nFleet manager: ${userMessage}\n\nAegis:`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { message, truckData, truckId } = body;

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'message_required' }, { status: 400 });
  }

  // 1. Retrieve relevant corpus docs
  const retrieved = retrieve(message, 3);

  // 2. Build prompt
  const prompt = buildPrompt(message, retrieved, truckData);

  // 3. Call Ollama M3 (or return local mock if not configured)
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'https://ollama.com';
  const ollamaKey = process.env.OLLAMA_API_KEY;

  let reply = '';
  let model = 'mock-v1';
  let tokens = 0;

  if (ollamaKey) {
    try {
      const r = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ollamaKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'minimax-m3:cloud',
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        }),
        // Timeout safety
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) {
        const data = await r.json();
        reply = data.message?.content || data.response || '';
        model = 'minimax-m3:cloud';
        tokens = data.eval_count || 0;
      } else {
        // Fall through to mock
        reply = buildMockReply(message, retrieved, truckData);
      }
    } catch (e) {
      // Fall through to mock
      reply = buildMockReply(message, retrieved, truckData);
    }
  } else {
    reply = buildMockReply(message, retrieved, truckData);
  }

  // Generate suggestions
  const suggestions = generateSuggestions(message, truckData);

  return NextResponse.json({
    reply,
    model,
    tokens,
    citations: retrieved.map(r => r.source),
    suggestions,
    privacy: {
      logged: false,
      note: 'W1 Day 5 prototype — messages not logged. Production: tenant-isolated, encrypted, audited.',
    },
    timestamp: new Date().toISOString(),
  });
}

// Mock reply for when Ollama is unavailable — uses RAG retrieval directly
function buildMockReply(message: string, retrieved: Array<{ source: string; text: string }>, truckData?: any): string {
  const m = message.toLowerCase();
  const isHOS = /hos|hours|driving|shift|break|11.?hour|14.?hour|70.?hour/.test(m);
  const isFuel = /fuel|mpg|gallon|diesel/.test(m);
  const isFault = /spn|fmi|fault|code|j1939|dtc|engine|coolant|oil|dpf/.test(m);
  const isMaintenance = /service|brake|tire|dot|inspect|maintenance/.test(m);
  const isDriver = /driver|sofia|marcus|jamal|priya|dmitri/.test(m);

  // Direct citations from RAG
  if (retrieved.length > 0) {
    const top = retrieved[0];
    let actionLine = '';
    if (truckData) {
      if (isHOS && truckData.hos?.hoursRemaining?.drive < 1) {
        actionLine = `\n\n**Action for ${truckData.id}:** Driver has less than 1 hour of drive time remaining. They need to find a safe place to stop within the next ${(truckData.hos.hoursRemaining.drive * 60).toFixed(0)} minutes, or they will be in violation of 49 CFR §395.3.`;
      }
      if (isFuel && truckData.fuel?.levelPct < 0.25) {
        actionLine = `\n\n**Action for ${truckData.id}:** Fuel level is ${(truckData.fuel.levelPct * 100).toFixed(0)}% (${truckData.fuel.estimatedRangeMi} mi range). Recommend refuel at next opportunity. Estimated nearest truck stop: see ${truckData.location?.address}.`;
      }
      if (isFault && truckData.faults?.length > 0) {
        const crit = truckData.faults.filter((f: any) => f.severity === 'critical');
        if (crit.length > 0) {
          actionLine = `\n\n**Action for ${truckData.id}:** CRITICAL fault(s): ${crit.map((f: any) => f.description).join('; ')}. Driver should be notified immediately. ${crit.some((f: any) => f.code === 'SPN-100-FMI-1') ? 'Low oil pressure means do NOT continue driving — engine damage is imminent.' : ''}`;
        }
      }
    }
    return `Per **${top.source}**:\n\n${top.text}${actionLine}${retrieved.length > 1 ? `\n\n(Also relevant: ${retrieved.slice(1).map(r => r.source).join('; ')})` : ''}`;
  }

  return `I don't have specific knowledge about "${message}" in the trucking corpus yet. Try asking about: HOS rules, IFTA, J1939 fault codes (SPN/FMI), DVIR, or fleet operations. (This is a W1 Day 5 prototype — full FleetGPT corpus ships in W2.)`;
}

function generateSuggestions(message: string, truckData?: any): string[] {
  const base = [
    'Show fleet status',
    'Any HOS violations in the last 24h?',
    'Which trucks are due for DOT inspection?',
  ];
  if (truckData?.faults?.length > 0) {
    base.push(`Explain the ${truckData.faults[0].code} fault`);
  }
  if (truckData?.hos?.hoursRemaining?.drive < 2) {
    base.push(`When does ${truckData.id} driver need to stop?`);
  }
  return base.slice(0, 4);
}

// Also handle GET for health check
export async function GET() {
  return NextResponse.json({
    status: 'operational',
    agent: 'Aegis FleetGPT (W1 Day 5 prototype)',
    baseModel: 'ollama/minimax-m3:cloud',
    rag: 'seeded trucking corpus (9 docs, FMCSA + J1939 + IFTA)',
    ragFullCorpus: 'W2 deliverable',
    privacy: 'messages not logged in prototype mode',
    timestamp: new Date().toISOString(),
  });
}
