# Aegis — Agentic Fleet Operations Platform

**Status:** W1 Day 1 (2026-06-25) — vanilla upstream fork, no Aegis-specific changes yet.
**License:** MIT (inherited from upstream OSIRIS, see `LICENSE`)
**Upstream:** [simplifaisoul/osiris](https://github.com/simplifaisoul/osiris) @ `7e15725`

---

## What this repo is

**Aegis** is a fleet-manager-facing agentic AI platform that sees, analyzes, advises, and executes across telematics, video, financial, fuel, and maintenance data. It's the companion product to **Compass** (driver-facing ELD) and **Privacy Guardian** (OSS trust library).

This repo is the **dashboard layer** of Aegis — the Palantir-vibe real-time map UI that shows fleet managers what's happening with their trucks right now, what to do about it, and lets an AI agent (like Rover, Claude Code, or any LLM agent) act on their behalf.

---

## Origin

Aegis is forked from **OSIRIS** ([simplifaisoul/osiris](https://github.com/simplifaisoul/osiris)), a production-grade open-source global intelligence dashboard built with Next.js 16 + MapLibre GL. OSIRIS is MIT-licensed — see `LICENSE` in this directory.

**Why OSIRIS as the foundation:**
- MIT license (no copyleft contamination) — we can ship Aegis as closed-source SaaS
- 2,000+ CCTV streams already wired with `hls.js` (perfect base for our fleet camera wall wedge)
- 16 toggleable data layers (aviation, maritime, seismic, fires, news, cyber, conflict, sanctions, etc.) — we inherit the pattern, swap OSINT sources for fleet telematics
- MapLibre GL GPU rendering = 60fps at fleet scale
- Modern Next.js 16 + React 19

**What we keep from OSIRIS (~30%):**
- MapLibre GL GPU rendering pipeline
- HUD overlay system (Palantir-vibe panels)
- Viewport-aware data loading + layer caching
- HLS streaming infrastructure (extend CCTV adapters for fleet dashcams)
- Next.js + React + TypeScript foundation
- Docker + CasaOS deployment

**What we strip (~70%, in W1 Day 2-3):**
- OSINT-specific data sources (OpenSky flights, AIS maritime, USGS earthquakes, NASA FIRMS, etc.)
- Conflict zones, GDELT, sanctions search
- Recon toolkit (DNS/WHOIS/port scanner/CVE)
- Crypto wallet trace + OFAC mirror
- Telegram OSINT scraping
- The single meme-token ad in upstream README

**What we add (W1 Day 3+):**
- Telematics adapters (Samsara, Motive, Geotab) — same pattern as OSIRIS CCTV adapters
- Compass ELD adapter (our own driver app)
- Fleet dashcam adapters (Lytx, Netradyne, Samsara CM-31)
- Fuel card adapter (WEX → CSV fallback for MVP)
- Maintenance adapter (Fleetio → read-only sync)
- HMAC-signed agent channel (`/api/agent/publish` + `/api/agent/stream`) — clean-room from Shadowbroker pattern
- MCP server at `/api/mcp` — industry standard for LLM-to-tool interface
- `@aegis/plugin-sdk` — plugin manifest contract
- 5 first-party plugins
- Aegis-themed dashboard (colors, copy, brand)

---

## Attribution

OSIRIS © 2026 [simplifaisoul](https://github.com/simplifaisoul). Licensed under MIT.

This Aegis fork respects the MIT license:
- ✅ Original copyright + license preserved (`LICENSE` file untouched)
- ✅ Attribution to upstream in this file + every public-facing README
- ✅ Changes documented in the "Divergence Log" below
- ✅ Future Aegis code (added in W1 Day 2+) will be © Aegis contributors

We are deeply grateful to the OSIRIS contributors for building a production-grade dashboard we can build on. Their work saved us ~3-6 months of UI engineering.

---

## Divergence Log

| Date | Aegis commit | Change | Upstream sync? |
|---|---|---|---|
| 2026-06-25 | `aegis-baseline/upstream-7e15725` (tag) | Initial fork from OSIRIS @ 7e15725 | N/A — this is the baseline |
| _pending_ | _W1 Day 2-3_ | Strip OSINT-specific code (~70% removed) | No — permanent divergence |
| _pending_ | _W1 Day 4-5_ | Add Aegis branding + first telematics adapters | No |

---

## Development

```bash
# Install (vanilla OSIRIS deps — clean)
npm install

# Run dev server
npm run dev
# → http://localhost:3000 (vanilla OSIRIS UI at this point)

# Docker
docker compose up -d
# → http://localhost:3000

# Build
npm run build
npm start
```

---

## Related repos

- **Aegis backend** (planned, separate repo) — multi-tenant SaaS backend with Postgres + Redis + Fastify
- **Aegis mobile** (planned, RN + Expo) — fleet-manager companion app
- **Aegis agent skill** — at `~/.openclaw/workspace/skills/aegis/` (OpenClaw-native integration)
- **Compass** — driver-facing ELD app at `~/Projects/compass-mobile/`
- **Privacy Guardian** — OSS trust library at `~/Projects/privacy-guardian/`

---

*Last updated 2026-06-25 16:48 GMT+2 — W1 Day 1 baseline created.*
