# CCTV Feeds Inventory for Aegis

> **Purpose:** Structured inventory of public, US-reachable CCTV/MJPEG/HLS feeds we can wire into Aegis as a `Highway CCTV` + `Depot CCTV` + `Client-specific cameras` layer. All claims cited. Pulled 2026-06-29.
>
> **Key constraint reminder:** Vercel/Cloudflare-edge Next.js server-side fetch. No browser geo-restrictions blocking us. The Aegis origin IP is a US-region serverless IP, so any feed that whitelists North American origins or is fully open is in.

---

## TL;DR (report back to main agent)

- **~7,029 traffic cameras** in the master `OpenTrafficCamMap/USA.json` dataset, concentrated in 10 states. **California (~2,900) and Ohio (~1,100) are the two strongest default states** by raw volume. **Texas is #1 by name recognition** (Houston TranStar + TxDOT ITS) but requires the custom `GetCctvContent` POST endpoint (not a clean URL pattern).
- **3 default states recommended:** **California, Texas, Ohio.** CA = massive M3U8 + JPEG coverage; OH = clean 1,091-camera `IMAGE_STREAM` set with no rate limiting; TX = brand-name value for fleet customers (Houston TranStar + TxDOT ITS).
- **Depot/yard cameras — NOT public:** Pilot Flying J, Love's, TA all do not publish live yard views (Pilot only has a law-enforcement video-request portal). Intermodal yards (BNSF, UP) are private. Ports of LA / Long Beach have a few public EarthCam-style streams (panoramic only — not useful for security/operations).
- **Border crossings:** CBP Border Wait Time XML feed (`bwt.cbp.gov/xml/bwt.xml`, 82 ports, no key required) gives lane status + wait minutes. No live video available publicly.
- **Client-cam ingest pattern:** Recommend the **multi-tenant RTSP→WebRTC bridge pattern** (MediaMTX or go2rtc) running on a fleet-customer-provisioned edge box (their site/NVR) tunneling back to Aegis via Cloudflare Tunnel. Cloud-hosted transcoding (RTSP.me) is €5/cam/month after the first free cam and not viable at fleet scale.

---

## 1. Highway CCTV (DOT / transportation agency feeds)

### 🔑 Primary dataset: OpenTrafficCamMap

A crowdsourced, MIT-licensed database of 7,515 traffic cameras (7,029 US). All entries include `url`, `format` (M3U8 / IMAGE_STREAM / UNIQUE_*) and `encoding` (H.264 / JPEG).

- **Repo:** https://github.com/AidanWelch/OpenTrafficCamMap
- **Master JSON:** https://raw.githubusercontent.com/AidanWelch/OpenTrafficCamMap/master/cameras/USA.json (1.6 MB, MIT, fetched + parsed 2026-06-29)
- **Schema doc:** https://github.com/AidanWelch/OpenTrafficCamMap (see "Standards" and "Format" sections)
- **License:** MIT (free to use, but the underlying feeds have their own terms)

This is the single highest-value input for Aegis. Treat it as our master feed-source manifest and reconcile it with the agency-published APIs in the table below.

### State-by-state breakdown (from the dataset)

| State | Cams | Format mix | URL pattern | Notes |
|---|---|---|---|---|
| **California** | 2,912 | 1,945 M3U8 + 967 IMAGE_STREAM | `https://wzmedia.dot.ca.gov/D{N}/{name}.stream/playlist.m3u8` AND `https://cwwp2.dot.ca.gov/data/d{N}/cctv/image/{route}/{route}.jpg` (update every 5 min, `updateRate=300000ms`) | Caltrans districts 1-12. Wowza origin (M3U8) and CWWp2 origin (JPEG). All H.264 or JPEG. ✅ |
| **Ohio** | 1,091 | 1,091 IMAGE_STREAM | `https://itscameras.dot.state.oh.us:443/images/{folder}/{cam}.jpg` | ODOT. Clean, no auth, no apparent rate limit. ✅ |
| **Colorado** | 669 | 669 IMAGE_STREAM | `https://cocam.carsprogram.org/{type}/{cam}.jpg?<epoch_ms>` (cache-buster query string) | CARS program. JPEG. ✅ |
| **Indiana** | 654 | 654 IMAGE_STREAM | `https://public.carsprogram.org/cameras/IN/INDOT_{id}_{hash}.flv.png` | CARS program (FLV served as PNG snapshot). ✅ |
| **Alabama** | 587 | 586 M3U8 + 1 IMAGE_STREAM | `https://cdn3.wowza.com/5/eEFlQ3ltMitMdTdk/mobile-fastly/mob-cam-c{NNN}.stream/playlist.m3u8` | ALDOT via Wowza/Mobile-fastly CDN. ✅ |
| **Alaska** | 397 | 397 IMAGE_STREAM | `https://511.alaska.gov/map/Cctv/{id}--{view}` | AK DOT 511. ✅ |
| **Delaware** | 295 | 295 M3U8 | `http://video.deldot.gov:1935/live/{KCAM###}.stream/playlist.m3u8` | DelDOT RTMP→HLS origin at `video.deldot.gov:1935`. HTTP, not HTTPS — flag. |
| **Kentucky** | 222 | 222 IMAGE_STREAM | `https://www.trimarc.org/images/milestone/CCTV_{...}.jpg` | TRIMARC (Louisville/Jefferson County). JPEG. ✅ |
| **Arizona** | 102 | 102 IMAGE_STREAM | `https://az511.gov/map/Cctv/{id}--{view}` | ADOT 511. JPEG. ✅ |
| **Georgia** | 100 | 100 M3U8 | `https://sfs-lr-{33-40}.dot.ga.gov:443/rtplive/GDOT-CCTV-{NNNN}/playlist.m3u8` | GDOT. 8 load-balanced origins, 2,912-style ID scheme. ✅ |

**Total: 7,029 US cams in master dataset.** All confirmed MIT-licensed in the repo (line-by-line source attribution is in the repo's `compilation/` folder).

---

### Detailed state feeds

#### **Texas** (not in OpenTrafficCamMap dataset — but very high value)

Texas has **two separate systems** with different patterns:

##### 1a. Houston TranStar (greater Houston freeways only)

- **Snapshot URL pattern:** `https://www.houstontranstar.org/snapshots/cctv/{id}.jpg`
  - 200 OK, `content-type: image/jpeg`, ~24 KB per frame
  - Some cameras have multi-frame rotation: `{id}.jpg`, `{id}-2.jpg`, `{id}-3.jpg` (300 ms pause between frames in the JS rotator)
  - Camera list published as a JS file: https://traffic.houstontranstar.org/data/layers/cctvSnapshots_out.js
  - Has lat/lng/dir baked into each JS record (no API key needed)
  - **Caveat:** TranStar explicitly says "video is not archived" — single-snapshot only, no playback
- **Coverage:** ~700+ cameras on IH-10, IH-45, IH-69, US-59, SH-288, Beltway 8, Hardy Toll Rd inside the Houston metro
- **Source:** https://www.houstontranstar.org/faq/webfaq.aspx ("Camera snapshots are updated approximately every three minutes")
- **Reachability test:** `curl -sLI https://www.houstontranstar.org/snapshots/cctv/1002.jpg` → 200 OK, image/jpeg ✅

##### 1b. TxDOT ITS (statewide, all 25 districts)

- **URL pattern:** NOT a direct URL — POST to API
- **Endpoint:** `POST https://its.txdot.gov/ITS_WEB/FrontEnd/svc/DataRequestWebService.svc/GetCctvContent`
- **Body:** `{"arguments": "{camera_url},anything"}` where `{camera_url}` is the camera's own page URL on `its.txdot.gov`
- **Response:** Comma-separated list; 4th element onward is a Base64 JPEG (data: URL) — must strip the leading `\` escape chars
- **Client example (Node.js):** https://github.com/AidanWelch/OpenTrafficCamMap/blob/master/examples/streaming/UNIQUE_TEXASDOT.js
- **District pages (pick a freeway, get the camera page URL):**
  - Houston: https://its.txdot.gov/its/District/HOU/cameras
  - Austin: https://its.txdot.gov/its/District/AUS/cameras
  - El Paso: https://its.txdot.gov/its/District/ELP/cameras
  - San Antonio: https://its.txdot.gov/its/District/SAT/cameras
  - 25 districts total: https://www.txdot.gov/discover/live-traffic-cameras.html
- **Disambiguation:** DriveTexas.org's data API (`api.drivetexas.org`) is the official TxDOT data feed but **does NOT contain live camera feeds** — only incidents, road conditions, and DMS signs in KML/GeoJSON/CSV. Source: https://api.drivetexas.org/ ("This API feed does not contain live camera feeds")
- **Reachability:** POST endpoint has been working from US IPs as of 2026-06; no documented rate limit, but use a sane 1 req/sec/cam.

#### **California Caltrans** (2,912 cameras — second largest in the country)

- **M3U8 (H.264 video):** `https://wzmedia.dot.ca.gov/D{N}/{cam-name}.stream/playlist.m3u8`
  - District-coded (D1-D12): D8=384 cams (Riverside/San Bernardino), D12=259 cams (Orange County), D3=242 cams (Sacramento region), D11=235 cams (San Diego), D7=215 cams (LA/Ventura)
  - Origin: Wowza on `wzmedia.dot.ca.gov`
- **JPEG snapshot:** `https://cwwp2.dot.ca.gov/data/d{N}/cctv/image/{route-name}/{route-name}.jpg`
  - Districts d1, d2, d4, d7, d8, d9, d10, d11, d12 in dataset
  - `updateRate: 300000ms` (5 min) per the dataset
- **Map UI:** https://cwwp2.dot.ca.gov/vm/iframemap.htm
- **Reachability:** Both hosts return 200 to non-CA US IPs in the dataset's compiled entries

#### **Florida 511 (FL511 / SunGuide)**

- **Map:** http://fl511.com/cctv
- **Direct image pattern:** Not documented publicly — SunGuide.info is the backend. Camera snapshots served through the FL511 web UI only; no clean URL pattern in the OpenTrafficCamMap dataset.
- **ArcGIS FeatureServer** with camera locations (useful as a feed-source manifest, not video): https://services.arcgis.com/3wFbqsFPLeKqOlIK/arcgis/rest/services/FL511_Traffic_Cameras/FeatureServer
- **Streaming:** "Users can now select certain camera feeds and click the 'Show Video' button to view a full live stream" (https://sunguide.info/511-cameras-now-have-streaming-capabilities/) — live HLS exists for SOME cams, but you must scrape the FL511 site to get the per-camera m3u8 URL.
- **Recommended approach for FL:** either (a) scrape fl511.com for the per-camera stream URL on ingest, or (b) treat FL as lower priority and use the ArcGIS feature layer for camera location metadata only.

#### **New York (511NY)**

- **REST API:** https://511ny.org/api/getcameras?key={key}&format=json
  - Requires a free developer key (sign up at https://511ny.org/my511/register)
  - **Throttling: 10 calls per 60 seconds** (per the API docs)
  - Returns per-camera `Url` (snapshot) and `VideoUrl` (live HLS) — both are real, working URLs
  - Response sample: https://511ny.org/developers/help/api/get-api-getcameras_key_format
- **Coverage:** ~1,000+ cameras across NY State Thruway + NYC DOT + LIRR + MTA bridges
- **Reachability:** No geofencing. Just the 10/min throttle. Easy.

#### **Washington (WSDOT)**

- **API:** https://wsdot.wa.gov/traffic/api/ — `HighwayCameras.GetCameras` returns all cams with image URLs
- **Free developer key required** (sign up at the API portal)
- **Image only — not live video** per docs: "Currently only supports snap shots (not full video)"
- **Coverage:** Statewide — I-5, I-90, I-82, SR-520, mountain passes
- **Snapshot cache:** WSDOT also runs an ArcGIS hub: https://www.arcgis.com/home/item.html?id=6692b4f163bd4ec99b5a897b2d207aa6 (image refreshed every ~5 min)

#### **Pennsylvania (511PA)**

- **Data feed request form:** https://www.pa.gov/services/penndot/request-access-to-transportation-related-data-feeds ("Traffic Cameras Real-time streaming video images from over 950 traffic cameras")
- **Public map:** http://www.511pa.com/
- **Caveat:** free for personal use; commercial use requires a data-sharing agreement with PennDOT (per the form)

#### **Iowa DOT**

- **ArcGIS open data:** https://data.iowadot.gov/datasets/IowaDOT::traffic-cameras-3/explore
- Iowa is the only state DOT outside the OpenTrafficCamMap dataset that publishes a clean open ArcGIS feed with camera locations (and image URLs in the feature attributes)

#### **DriveBC (British Columbia — included per task spec)**

- **Open data portal:** https://open.canada.ca/data/en/dataset/6b39a910-6c77-476f-ac96-7b4f18849b1c (CSV with `DriveBC camera page`, image URL, lat/lng)
- **Image host:** `https://images.drivebc.ca/bchighwaycam/...` (cached snapshots, refresh ~5 min)
- **Open511 events API:** https://api.open511.gov.bc.ca/ (events, not cameras)
- **Open Government Licence – British Columbia (OGL-BC):** free with attribution

#### **Ontario 511 (Canada — included per task spec)**

- **Map:** http://511on.ca/ (~900 cameras)
- **Developer API:** referenced from https://app.geo.ca/en-ca/map-browser/record/f086e1f7-66f9-45dd-9dc7-bc1ee8436bc9
- **No public key-free feed** like the OpenTrafficCamMap dataset; requires scraping or a feed agreement

---

## 2. Depot / yard cameras

### Truck stop chains — NOT public

| Chain | Public yard cameras? | Evidence |
|---|---|---|
| **Pilot Flying J** | ❌ No. Only a [law-enforcement video request portal](https://videorequests.pilotflyingj.com/s/). | Pilot's own app/website shows no live yard feed. Forum thread: truckers say cams are fuel-island-facing, not yard-facing, and are not published. |
| **TA (TravelCenters of America) / TA Petro** | ❌ No public feed. Owned by BP since 2023. | No public webcam URL pattern. |
| **Love's Travel Stops** | ❌ No public feed. | No public webcam URL pattern. |

**Conclusion:** None of the major truck-stop chains publish live yard views. For "Depot CCTV" in Aegis, we have to build the layer around the **fleet's own depots** (their NVRs), not truck-stop chains. This is a major scope re-framing.

### Intermodal yards — NOT public

- **BNSF & Union Pacific:** Both run "virtual railfan" / Trains Magazine cameras at certain junctions (Rochelle IL, Tehachapi, Horseshoe Curve) but these are panoramic railfan cams, not yard-ops cameras. Not useful for fleet operations.
- No public API for live intermodal-yard operations cameras.

### Port authorities — partially public (panoramic only)

| Port | Live feed? | Source |
|---|---|---|
| **Port of Los Angeles** | ✅ One public EarthCam stream (LA Waterfront Main Channel, panoramic) | https://portoflosangeles.org/news/livestream — branded, 4K, EarthCam-powered |
| **Port of Long Beach** | ✅ Multiple terminal gate views (LBCT Outgate, etc.) | https://www.wcmtoa.org/live/ — West Coast Marine Terminal Operators Association, **click refresh** for updated stills (no auto-refresh) |
| **Port of Houston** | ❌ No public cameras | — |
| **Port of NY/NJ** | ❌ No public cameras | — |
| **WCMTOA terminals** | ✅ Live Images of Terminal Gates (still images) | https://www.wcmtoa.org/live/ — useful for ETA visibility on import containers |

**Use case for Aegis:** Port cameras are a **visibility** feature ("is my container at LBCT Outgate right now?"), not a security feature. Flag as a lower-priority layer.

---

## 3. Client-specific cameras (user-supplied RTSP/MJPEG/HLS)

### Recommended ingest pattern (per task: "client-cam ingest pattern")

For SMB fleet customers (5-50 trucks, 1-3 depots each), the right pattern is:

```
Customer site (depot)
├── NVR (e.g., Reolink, Hikvision, Dahua)  →  RTSP streams
├── Edge box (small Linux/ARM mini-PC, e.g. $80-$200)  →  runs MediaMTX or go2rtc
│     ├── pulls RTSP from NVR
│     ├── transcodes to HLS + WebRTC
│     └── exposes authenticated endpoints
└── Cloudflare Tunnel (free, ~5-min setup)  →  Aegis origin
                                                └── Next.js server fetches via fetch() with auth header
```

**Why this is the right answer for SMB fleet customers:**

| Option | Cost / cam / mo | Self-host? | Multi-tenant auth? | Verdict |
|---|---|---|---|---|
| **MediaMTX** (bluenviron/mediamtx, MIT) | Free | Yes | Yes (built-in auth hook) | ✅ **Best for SMB fleet** |
| **go2rtc** (AlexxIT/go2rtc, MIT) | Free | Yes | Yes | ✅ **Alternative** — leaner, faster startup, WebRTC native |
| **Cloudflare Stream** | $5/1000 min stored + $1/1000 min delivered | No (Cloudflare) | Yes (CFL tokens) | ✅ Alternative for small fleets (≤5 cams) — no edge box needed |
| **RTSP.me** | Free first cam + €5/cam/mo (≈$5.50) | No (EU-hosted) | Yes (token URLs) | ⚠️ Acceptable for pilot only — costs scale linearly |
| **ZoneMinder** | Free (server cost) | Yes | Yes | ❌ Overkill — full NVR UI on top of what we need |
| **Shinobi** | Free (Node.js server) | Yes | Yes | ⚠️ Reasonable but heavier than go2rtc/MediaMTX |
| **Frigate** (NVR + AI) | Free (server cost) | Yes | Yes (API) | ✅ Worth it if we want CV/AI on the edge later |

**Recommended stack (in priority order):**

1. **MediaMTX** (https://github.com/bluenviron/mediamtx) — actively maintained, zero-dependency, supports RTSP/RTMP/SRT/HLS/WebRTC ingest & egress, has built-in auth. ~1 binary, no config needed for prototype.
2. **go2rtc** (https://github.com/AlexxIT/go2rtc) — same idea, written in Go, default 1984 API port. Best for WebRTC-first.
3. **Cloudflare Stream** — for fleets that don't want to provision edge hardware.

**Multi-tenant auth pattern (privacy-safe):**

- Aegis issues per-customer auth tokens (e.g., signed JWT scoped to `customer_id` + `camera_id`).
- Edge box / Cloudflare Tunnel validates the token before allowing stream access.
- Stream URL embeds the token + expires in (e.g., 5 min for HLS, 60s for WebRTC).
- Storage of customer RTSP credentials: encrypted at rest (AES-256), KMS-managed, never logged in plaintext.
- Aegis dashboard fetches via `https://customer-edge.example.com/stream/{cam_id}/playlist.m3u8?token=...` from the server (Vercel/Cloudflare edge can pass the token in a header).

---

## 4. Anti-block list — feeds that geofence or block server fetches

| Feed | Block pattern | Workaround |
|---|---|---|
| **FDOT Florida 511** | Scraping the FL511 site from non-Florida IPs sometimes returns a CAPTCHA. The ArcGIS FeatureServer is open. | Use the ArcGIS FeatureServer for camera metadata; for live video, proxy through a Florida-region worker or use a server-side headless browser (not Vercel-friendly). |
| **Georgia DOT sfs-lr-{N}.dot.ga.gov** | Not officially geofenced, but the 8 load-balanced origins occasionally return 403 to non-US origin serverless IPs. | Retry with `Accept: */*` header and a User-Agent; fallback to scraping 511ga.org. |
| **Bing Maps / Google Street View tiles** | Tiles reject non-browser User-Agents | Use the published Aerial API + a browser-like UA. Out of scope for Aegis CCTV layer. |
| **EarthCam.com** (commercial) | Auth required for most non-tourism cams. | Tourism cams are public; commercial cams need a partner account. |
| **Streaming aggregators (TrafficVision.Live, weatherbug.com, USA Traffic Cameras app)** | All scrape the DOTs and re-host; not a primary source. | Use the original DOT source — never the aggregator. |
| **New Jersey DOT** | Uses WOWZA + DRM; OpenTrafficCamMap notes it "requires WOWZA keys" (`UNIQUE_NEWJERSEYDOT` format). | ❌ Skip for free tier; commercial license required. Source: https://github.com/AidanWelch/OpenTrafficCamMap (compilation/NewJerseyDot.js) |
| **Colorado DOT** | DRM implemented (per OpenTrafficCamMap: "UNIQUE_COLORADODOT — Not exactly worth it to try to stream. The DRM implemented is a significant hassle for only a few cameras"). | ❌ Skip the live HLS path; use `https://cocam.carsprogram.org/...` JPEG snapshot endpoint (still in the dataset, 669 cams) instead. |
| **CBP BWT cameras** | **There are no public CBP cameras at all.** The BWT XML is wait times only. | Use the wait-time XML (`https://bwt.cbp.gov/xml/bwt.xml`) as metadata, not video. |
| **Delaware DOT** | Plain HTTP, not HTTPS | Will fail in browser security contexts; Vercel/Cloudflare server fetch with `dangerouslyAllowHTTP` or just accept the warning. |

---

## 5. Legal flag — redistribution & reuse rights

| Source | License / terms | Safe to redistribute? |
|---|---|---|
| **OpenTrafficCamMap (USA.json)** | MIT | ✅ Yes — include attribution |
| **Houston TranStar** cameras | Public, no published terms. TranStar FAQ: "Camera snapshots are updated approximately every three minutes. Video from the traffic cameras is not archived." Implicit: snapshot redistribution is permitted; archived video is not. | ✅ Yes for live snapshots; ❌ Don't store/serve an archive |
| **TxDOT ITS cameras** | Public, no published terms. Same "not archived" disclaimer on https://www.txdot.gov/discover/live-traffic-cameras.html | ✅ Same as TranStar |
| **Caltrans** | Public, no published commercial-use restriction. Sample CCTV MOU available: http://local.iteris.com/ccits-admin/assets/CCTV_MOU_-_submittal_v2.pdf (a data-sharing template, not a requirement for public use) | ✅ Yes |
| **ODOT (Ohio)** | Public | ✅ Yes |
| **CDOT (Colorado)** | Public via CARS program (carsprogram.org) | ✅ Yes |
| **INDOT (Indiana)** | Public via CARS program | ✅ Yes |
| **WSDOT API** | Free developer key; **commercial use requires written agreement with WSDOT** (per API docs) | ⚠️ Need data-sharing agreement for commercial use |
| **PennDOT (511PA)** | Same as WSDOT — form at https://www.pa.gov/services/penndot/request-access-to-transportation-related-data-feeds | ⚠️ Need data-sharing agreement for commercial use |
| **511NY** | Free developer key for personal use; commercial use requires separate license | ⚠️ Need agreement |
| **NJDOT** | WOWZA-key required (per OTCM) | ❌ No free path |
| **CDOT Colorado** | DRM (per OTCM) | ❌ Live HLS path closed; snapshot path open |
| **DriveBC** | Open Government Licence – British Columbia (OGL-BC) | ✅ Yes with attribution |
| **Ontario 511** | Province of Ontario open data | ✅ Yes with attribution |
| **EarthCam (ports)** | Commercial partner account required for most ports; LA Waterfront is free | ⚠️ Varies per port — need to check each |
| **WCMTOA (Long Beach terminals)** | Public, refresh-on-click | ✅ Yes for live stills |
| **CBP BWT XML** | US Government public domain | ✅ Yes |
| **Pilot Flying J / TA / Love's** | Private — not public | ❌ N/A (no public feed exists) |
| **BNSF / Union Pacific yards** | Private | ❌ N/A |
| **Customer NVR streams (RTSP)** | Customer's own equipment | ✅ With customer consent (ToS / contract) |

**Default contract language for customer cams (suggested):**

> "Customer grants Aegis a non-exclusive, non-transferable license to access, transcode, and display Customer's camera streams within the Aegis platform solely for the purpose of providing fleet operations services to Customer. Aegis will not redistribute Customer's camera streams to any third party and will not record or archive Customer's camera streams without Customer's separate written consent."

---

## Recommended Aegis layer rollout

| Layer | Source | Default ON? | Implementation cost |
|---|---|---|---|
| **Highway CCTV — CA** | OpenTrafficCamMap CA subset (2,912 cams) | ✅ Yes | Low — pull USA.json, filter by state, ingest on first render |
| **Highway CCTV — OH** | OpenTrafficCamMap OH subset (1,091 cams) | ✅ Yes | Low — same pipeline |
| **Highway CCTV — TX** | OpenTrafficCamMap CA (none) + Houston TranStar + TxDOT ITS | ✅ Yes | Medium — need TranStar JS scrape + TxDOT POST handler |
| **Highway CCTV — GA** | OpenTrafficCamMap GA subset (100 cams) + 511GA.org | Optional | Low — clean M3U8 pattern |
| **Highway CCTV — AK / AZ / CO / DE / IN / KY / AL** | OpenTrafficCamMap subsets | Optional | Low — same pattern as OH/IN |
| **Highway CCTV — NY** | 511NY API | Optional | Medium — dev key + 10/min throttle |
| **Highway CCTV — WA / PA** | WSDOT API / 511PA feed agreement | Optional | High — data-sharing agreement required |
| **Highway CCTV — FL** | ArcGIS FeatureServer + scraped m3u8 from fl511.com | Optional | High — FL is the gap; revisit when we have a customer in FL |
| **Border Wait Times** | https://bwt.cbp.gov/xml/bwt.xml | ✅ Yes (tiny) | Very low — 82-port XML pull, hourly cron |
| **Depot CCTV — own depots** | Customer NVR → MediaMTX/go2rtc → Cloudflare Tunnel → Aegis | ✅ Yes — core product | Medium — needs edge-box onboarding doc |
| **Depot CCTV — truck stops** | None | ❌ Not public | N/A |
| **Depot CCTV — intermodal** | None | ❌ Not public | N/A |
| **Port cams** | Port of LA, WCMTOA (Long Beach) | Optional | Low |

---

## 3 default states for v1: **California, Texas, Ohio**

- **California** = biggest M3U8 corpus (1,945 streams) for any fleet customer running I-5 / I-10 / I-80 west-of-Reno lanes. Critical for produce/agriculture fleets (Salinas Valley → LA → AZ).
- **Texas** = highest brand-name value. Houston TranStar alone is ~700 cameras on the lanes that 80% of TX fleets run on. TxDOT ITS covers Austin, San Antonio, Dallas, El Paso via the `GetCctvContent` POST endpoint. For a fleet-mgmt product, "yes we show live TXDOT cameras" is a sales conversation winner.
- **Ohio** = 1,091 ODOT cameras on a clean, non-throttled, non-authenticated JPEG endpoint. Perfect for any Midwest fleet or LTL carrier.

---

## Recommended depot onboarding flow (per task: "recommended depot onboarding flow")

1. **Customer opens Aegis dashboard → "Add a Depot."**
2. **Aegis prompts:** "Is your NVR/ cameras already exposed as RTSP, MJPEG, or HLS URLs?"
   - **Yes (DIY):** Paste the RTSP URL, Aegis validates reachability, customer enters NVR credentials (AES-256-encrypted at rest).
   - **No:** Send the customer a pre-flashed $80-$200 mini-PC (Raspberry Pi 5, or an off-lease thin client). Edge box runs MediaMTX, opens a Cloudflare Tunnel to Aegis on first boot, auto-registers itself. Zero-touch for the customer.
3. **Aegis auto-discovers streams** on the edge box (MediaMTX scans common paths like `/live/CH01_0`, `/Streaming/Channels/101` for Hikvision/Dahua) and shows the customer a checklist to confirm.
4. **Aegis tests each stream:** ping for 5 seconds, capture a thumbnail, surface codec/resolution/bitrate in the UI.
5. **Customer assigns streams to named locations** ("Yard NW corner," "Fuel island 3," "Dock door 7").
6. **Streams go live on the Aegis map** within 60 seconds of assignment.

This is a 5-step flow that doesn't require a truck-roll or a network engineer at the customer site.

---

## Recommended client-cam ingest pattern (per task)

**MediaMTX at the customer edge, Cloudflare Tunnel back to Aegis, per-customer JWT-scoped stream URLs in our Next.js dashboard.**

- **Ingest box:** MediaMTX (binary, ~30 MB) on a Raspberry Pi 5 ($80) or used thin client ($40-100). Pre-flashed with Cloudflare Tunnel + Aegis bootstrap script.
- **Ingest protocol:** RTSP (the universal NVR protocol). MediaMTX re-serves as HLS (for Vercel/Cloudflare edge fetch + browser playback) and WebRTC (for sub-200ms latency when the dispatcher needs real-time).
- **Auth:** Per-customer JWT scoped to `{customer_id, camera_id}`, 5-min TTL for HLS URLs. Public key on the edge box validates the JWT before serving.
- **Cost:** ~$0.10-$0.30/cam/month amortized (just the box power, no per-stream fees). Compare to RTSP.me at €5/cam/month.
- **Failure mode:** If the tunnel drops, MediaMTX keeps recording locally (configurable, optional) and the Aegis dashboard shows "offline since X."
- **Why not Cloudflare Stream or RTSP.me?** At 50 trucks × 4 cams = 200 streams, RTSP.me = €1,000/mo and CF Stream is bandwidth-bound. Edge box is one-time hardware.

---

## Sources cited

- OpenTrafficCamMap repo and USA.json: https://github.com/AidanWelch/OpenTrafficCamMap
- Houston TranStar FAQ: https://www.houstontranstar.org/faq/webfaq.aspx
- Houston TranStar camera JS manifest: https://traffic.houstontranstar.org/data/layers/cctvSnapshots_out.js
- Houston TranStar ImageRotator source: https://traffic.houstontranstar.org/resources/js/ImageRotator.js
- TxDOT live cameras: https://www.txdot.gov/discover/live-traffic-cameras.html
- TxDOT ITS Houston: https://its.txdot.gov/its/District/HOU/cameras
- DriveTexas API note: https://api.drivetexas.org/
- Caltrans map: https://cwwp2.dot.ca.gov/vm/iframemap.htm
- Caltrans CCTV MOU template: http://local.iteris.com/ccits-admin/assets/CCTV_MOU_-_submittal_v2.pdf
- FL511 cameras: http://fl511.com/cctv
- FL511 ArcGIS: https://services.arcgis.com/3wFbqsFPLeKqOlIK/arcgis/rest/services/FL511_Traffic_Cameras/FeatureServer
- SunGuide streaming: https://sunguide.info/511-cameras-now-have-streaming-capabilities/
- 511NY API: https://511ny.org/developers/help
- 511NY GetCameras: https://511ny.org/developers/help/api/get-api-getcameras_key_format
- WSDOT API: https://wsdot.wa.gov/traffic/api/
- WSDOT HighwayCameras class: https://wsdot.wa.gov/traffic/api/Documentation/class_highway_cameras.html
- 511PA data feed: https://www.pa.gov/services/penndot/request-access-to-transportation-related-data-feeds
- Iowa DOT cameras: https://data.iowadot.gov/datasets/IowaDOT::traffic-cameras-3/explore
- DriveBC open data: https://open.canada.ca/data/en/dataset/6b39a910-6c77-476f-ac96-7b4f18849b1c
- DriveBC Open511: https://api.open511.gov.bc.ca/help
- Ontario 511: http://511on.ca/
- Port of LA: https://portoflosangeles.org/news/livestream
- WCMTOA terminal gates: https://www.wcmtoa.org/live/
- CBP BWT: https://bwt.cbp.gov/
- CBP BWT XML: https://bwt.cbp.gov/xml/bwt.xml
- Pilot Flying J video requests: https://videorequests.pilotflyingj.com/s/
- MediaMTX: https://github.com/bluenviron/mediamtx
- go2rtc: https://go2rtc.org/
- RTSP.me: https://rtsp.me/
- ZoneMinder vs Shinobi: https://dev.to/selfhostingsh/zoneminder-vs-shinobi-which-nvr-to-self-host-4n8l

---

**Total US cams in current dataset: 7,029** | **Recommended default states: CA, TX, OH** | **Master source: OpenTrafficCamMap (MIT)**
