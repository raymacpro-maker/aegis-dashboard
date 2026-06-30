import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAllDrivers, getAllTrucks, getDriver, getTruck, maskDriver, type Role } from '@/lib/fleet-store';
import { assessJamming, assessFleetJamming, type JammingAssessment } from '@/lib/jamming-detector';

/**
 * Aegis Telematics — Fleet Operations API
 *
 * Real fleet data model for SMB fleets (5-50 trucks).
 * Mock data simulating Samsara/Motive/Geotab telematics streams.
 *
 * GET /api/telematics              — list all trucks
 * GET /api/telematics?truck=T-47   — single truck detail
 * GET /api/telematics?driver=D-001 — list trucks for a driver
 * GET /api/telematics?role=agent   — Privacy Guardian mask level (manager|agent|viewer)
 *
 * The mutating endpoint is POST /api/driver/event (HMAC-authed).
 */

type Fleet = {
  id: string;
  name: string;
  trucks: ReturnType<typeof getAllTrucks>;
  drivers: ReturnType<typeof getAllDrivers>;
  lastUpdateTs: number;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const truckId = url.searchParams.get('truck');
  const driverId = url.searchParams.get('driver');
  const role = (url.searchParams.get('role') as Role) || 'manager';

  if (truckId) {
    const truck = getTruck(truckId);
    if (!truck) {
      return NextResponse.json({ error: 'truck_not_found', truckId }, { status: 404 });
    }
    const driver = getDriver(truck.driverId);
    const jammingZones = await fetchOsirisJammingZones().catch(() => []);
    return NextResponse.json({
      truck,
      driver: driver ? maskDriver(driver, role) : null,
      gps_quality: {
        accuracy_m: truck.location.accuracyM,
        satellites_used: truck.location.satellitesUsed,
        cn0_avg_dbhz: truck.location.cn0AvgDbhz,
        cn0_min_dbhz: truck.location.cn0MinDbhz,
        spoofing_suspected: truck.location.spoofingSuspected ?? false,
        fix_source: truck.location.fixSource ?? 'unknown',
        gnss_ts: truck.location.gnssTs,
      },
      jamming: assessJamming(truck, jammingZones),
      privacy: {
        role,
        driverNameMasked: role !== 'manager',
        note: 'Privacy Guardian: Driver PII is encrypted at rest and masked in agent contexts. Request role=manager to view full names.',
      },
      timestamp: new Date().toISOString(),
    });
  }

  if (driverId) {
    const driver = getDriver(driverId);
    if (!driver) {
      return NextResponse.json({ error: 'driver_not_found', driverId }, { status: 404 });
    }
    const trucks = getAllTrucks().filter((t) => t.driverId === driverId);
    return NextResponse.json({
      driver: maskDriver(driver, role),
      trucks,
      privacy: { role, driverNameMasked: role !== 'manager' },
      timestamp: new Date().toISOString(),
    });
  }

  // Default: full fleet
  const allDrivers = getAllDrivers();
  const allTrucks = getAllTrucks();
  const jammingZones = await fetchOsirisJammingZones().catch(() => []);
  const jammingMap = assessFleetJamming(allTrucks, jammingZones);
  const jammedCount = Object.values(jammingMap).filter((j) => j.in_jammed_area).length;

  const fleet: Fleet = {
    id: 'aegis-demo-fleet-001',
    name: 'Demo Logistics LLC',
    trucks: allTrucks,
    drivers: allDrivers.map((d) => maskDriver(d, role)),
    lastUpdateTs: Date.now(),
  };

  return NextResponse.json({
    fleet,
    summary: {
      totalTrucks: allTrucks.length,
      moving: allTrucks.filter((t) => t.status === 'moving').length,
      idle: allTrucks.filter((t) => t.status === 'idle').length,
      maintenance: allTrucks.filter((t) => t.status === 'maintenance').length,
      offline: allTrucks.filter((t) => t.status === 'offline').length,
      criticalFaults: allTrucks.reduce((sum, t) => sum + t.faults.filter((f) => f.severity === 'critical').length, 0),
      warnings: allTrucks.reduce((sum, t) => sum + t.faults.filter((f) => f.severity === 'warning').length, 0),
      driversOnDuty: allTrucks.filter((t) => t.status === 'moving' || t.status === 'idle').length,
      hosWarnings: allTrucks.filter((t) => t.hos.nextBreakRequiredIn < 0.5).length,
      lowFuel: allTrucks.filter((t) => t.fuel.levelPct < 0.25).length,
      dotInspectionsDueSoon: allTrucks.filter((t) => t.maintenance.daysUntilDOT < 14).length,
      trucksInJammedArea: jammedCount,
    },
    jamming: jammingMap,
    privacy: {
      role,
      driverNamesMasked: role !== 'manager',
      policyVersion: '1.0.0',
      note: 'Privacy Guardian v1.0 — driver PII isolated. Agents see masked names; managers see full names.',
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Pull the current OSIRIS jamming zones from the same source as the /globe page.
 * Cached briefly in-memory to avoid hammering /api/flights.
 */
let jammingCache: { zones: any[]; at: number } | null = null;
const JAMMING_CACHE_MS = 30_000;
async function fetchOsirisJammingZones(): Promise<any[]> {
  if (jammingCache && Date.now() - jammingCache.at < JAMMING_CACHE_MS) {
    return jammingCache.zones;
  }
  const base = process.env.AEGIS_INTERNAL_URL ?? 'http://127.0.0.1:3000';
  try {
    const res = await fetch(`${base}/api/flights`, { cache: 'no-store' });
    if (!res.ok) return jammingCache?.zones ?? [];
    const data = await res.json();
    const zones = Array.isArray(data?.gps_jamming) ? data.gps_jamming : [];
    jammingCache = { zones, at: Date.now() };
    return zones;
  } catch {
    return jammingCache?.zones ?? [];
  }
}

export async function POST(request: Request) {
  // Used by external telematics providers (Samsara/Motive/Geotab) in production.
  // For Compass-driver events, use /api/driver/event instead.
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({
    accepted: true,
    ingestId: randomUUID(),
    note: 'Mock endpoint — real telematics provider webhooks go here in production.',
    received: body,
  });
}
