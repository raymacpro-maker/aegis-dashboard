import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAllDrivers, getAllTrucks, getDriver, getTruck, maskDriver, type Role } from '@/lib/fleet-store';

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
    return NextResponse.json({
      truck,
      driver: driver ? maskDriver(driver, role) : null,
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
    },
    privacy: {
      role,
      driverNamesMasked: role !== 'manager',
      policyVersion: '1.0.0',
      note: 'Privacy Guardian v1.0 — driver PII isolated. Agents see masked names; managers see full names.',
    },
    timestamp: new Date().toISOString(),
  });
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
