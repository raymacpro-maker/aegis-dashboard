// src/lib/jamming-detector.ts
// Cross-references truck GPS quality against OSIRIS-derived jamming zones.
//
// OSIRIS infers jamming zones from ADS-B `nac_p` drops (JAMMING_NACAP_THRESHOLD = 4).
// Compass (this product) measures GPS quality directly from Android GnssMeasurement
// (accuracy_m, satellites_used, cn0_avg_dbhz, spoofing_suspected).
//
// This module answers: "is THIS truck currently in a likely-jammed environment?"
//
// Confidence ladder:
//   - "direct": truck reports spoofing_suspected=true OR cn0_avg < 20
//   - "probable": truck reports accuracy > 30m AND in OSIRIS jamming zone
//   - "possible": truck reports accuracy > 30m OR in OSIRIS jamming zone
//   - "none": nothing flagged
//
// Cross-referencing the two independent sources (ADS-B sky + driver phone) is the
// Aegis moat: Samsara/Motive/Geotab see only truck GPS, never both.

import type { Truck } from './fleet-store';

type JammingZone = { lat: number; lng: number; severity: number; count?: number };

export type JammingAssessment = {
  level: 'direct' | 'probable' | 'possible' | 'none';
  /** Convenience flag for UI. true when level !== 'none'. */
  in_jammed_area: boolean;
  /** A short human-readable reason, for the dashboard tooltip / agent reply. */
  reason: string;
  /** Severity 0..100. Combines OSIRIS zone severity + truck-side metrics. */
  severity: number;
};

/**
 * Rough haversine distance in km. Good enough for "within 50 km" checks.
 * Avoids importing a geo lib for one function.
 */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const aH =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(aH));
}

/**
 * Find the nearest OSIRIS jamming zone to a truck within `radiusKm`.
 * Returns the zone and the distance, or null if none within radius.
 */
function nearestJammingZone(
  truck: { location: { lat: number; lng: number } },
  zones: JammingZone[],
  radiusKm = 100,
): { zone: JammingZone; distanceKm: number } | null {
  let best: { zone: JammingZone; distanceKm: number } | null = null;
  for (const z of zones) {
    const d = haversineKm(truck.location, z);
    if (d <= radiusKm && (!best || d < best.distanceKm)) {
      best = { zone: z, distanceKm: d };
    }
  }
  return best;
}

/**
 * Assess whether a truck is in a likely-jammed environment.
 *
 * Pure function — no side effects. Safe to call from API handlers / SSE listeners.
 */
export function assessJamming(
  truck: Truck,
  osirisZones: JammingZone[],
): JammingAssessment {
  const loc = truck.location;

  // ── Truck-side signals ────────────────────────────────────────────
  const spoof = loc.spoofingSuspected === true;
  const lowCn0 = typeof loc.cn0AvgDbhz === 'number' && loc.cn0AvgDbhz < 20;
  const highAccuracy = typeof loc.accuracyM === 'number' && loc.accuracyM > 30;
  const fewSats =
    typeof loc.satellitesUsed === 'number' && loc.satellitesUsed < 6;

  const truckSignalScore =
    (spoof ? 80 : 0) +
    (lowCn0 ? 40 : 0) +
    (highAccuracy ? 25 : 0) +
    (fewSats ? 15 : 0);

  // ── OSIRIS-side signals (independent ADS-B feed) ─────────────────
  const zoneHit = nearestJammingZone(truck, osirisZones);
  const osirisScore = zoneHit ? Math.min(100, zoneHit.zone.severity) : 0;

  // ── Combine ───────────────────────────────────────────────────────
  const combined = Math.min(100, Math.max(truckSignalScore, osirisScore));

  let level: JammingAssessment['level'] = 'none';
  let reason = 'GPS nominal';

  if (spoof || lowCn0) {
    level = 'direct';
    reason = spoof
      ? `Driver phone reports spoofing (Cn0 avg ${loc.cn0AvgDbhz?.toFixed(0)} dBHz)`
      : `Driver phone reports degraded GNSS (Cn0 avg ${loc.cn0AvgDbhz?.toFixed(0)} dBHz)`;
  } else if (highAccuracy && zoneHit) {
    level = 'probable';
    reason = `Truck accuracy ${loc.accuracyM?.toFixed(0)}m AND OSIRIS jamming zone ${zoneHit.distanceKm.toFixed(0)}km away (severity ${zoneHit.zone.severity})`;
  } else if (highAccuracy || zoneHit) {
    level = 'possible';
    const parts: string[] = [];
    if (highAccuracy) parts.push(`truck accuracy ${loc.accuracyM?.toFixed(0)}m`);
    if (zoneHit) parts.push(`OSIRIS zone ${zoneHit.distanceKm.toFixed(0)}km away`);
    reason = parts.join(' + ') || 'GPS marginal';
  }

  return {
    level,
    in_jammed_area: level !== 'none',
    reason,
    severity: combined,
  };
}

/**
 * Bulk assessment for the whole fleet. Returns a map of truckId → assessment.
 */
export function assessFleetJamming(
  trucks: Truck[],
  osirisZones: JammingZone[],
): Record<string, JammingAssessment> {
  const out: Record<string, JammingAssessment> = {};
  for (const t of trucks) {
    out[t.id] = assessJamming(t, osirisZones);
  }
  return out;
}