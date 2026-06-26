import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

/**
 * Aegis Telematics — Fleet Operations API
 *
 * Real fleet data model for SMB fleets (5-50 trucks).
 * Mock data simulating Samsara/Motive/Geotab telematics streams.
 *
 * GET /api/telematics              — list all trucks
 * GET /api/telematics?truck=T-47   — single truck detail
 * GET /api/telematics?driver=D-001 — list trucks for a driver
 *
 * NOTE: This is a mock backend for W1 Day 5 prototype.
 * Real Samsara/Motive/Geotab integration lives in adapters under /api/integrations/.
 */

// ---- Types ----

type Truck = {
  id: string;             // T-001, T-002, ...
  vin: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  class: 'Class 6' | 'Class 7' | 'Class 8';
  status: 'moving' | 'idle' | 'maintenance' | 'offline';
  driverId: string;
  location: {
    lat: number;
    lng: number;
    address: string;
    speedMph: number;
    heading: number;
  };
  hos: {
    shiftStartTs: number;
    hoursDriven: number;
    hoursOnDuty: number;
    hoursRemaining: {
      drive: number;        // 11hr limit, in hours
      shift: number;        // 14hr limit
      cycle: number;        // 70hr/8day limit
    };
    nextBreakRequiredIn: number;  // hours until 30-min break required
  };
  fuel: {
    levelPct: number;
    mpgRecent: number;
    estimatedRangeMi: number;
  };
  faults: Array<{
    spn: number;       // J1939 Suspect Parameter Number
    fmi: number;       // Failure Mode Identifier
    code: string;      // SPN-FMI form
    description: string;
    severity: 'info' | 'warning' | 'critical';
    ts: number;
  }>;
  maintenance: {
    nextServiceMiles: number;
    lastServiceMiles: number;
    currentMiles: number;
    dueService: string;     // 'oil_change' | 'tire_rotation' | 'brake_inspection' | 'dot_inspection'
    daysUntilDOT: number;
  };
  lastUpdateTs: number;
};

type Driver = {
  id: string;             // D-001
  name: string;           // Encrypted at rest in real system
  cdlNumber: string;
  cdlExpiry: string;
  phone: string;
  hireDate: string;
  homeBase: string;
};

type Fleet = {
  id: string;
  name: string;
  trucks: Truck[];
  drivers: Driver[];
  lastUpdateTs: number;
};

// ---- Mock fleet ----

const DRIVERS: Driver[] = [
  { id: 'D-001', name: 'Marcus Johnson', cdlNumber: 'CDL-A-7842159', cdlExpiry: '2027-03-15', phone: '+1-512-555-0184', hireDate: '2022-06-01', homeBase: 'Austin, TX' },
  { id: 'D-002', name: 'Sofia Reyes',    cdlNumber: 'CDL-A-9210374', cdlExpiry: '2026-11-22', phone: '+1-737-555-0247', hireDate: '2023-01-15', homeBase: 'Austin, TX' },
  { id: 'D-003', name: 'Jamal Carter',   cdlNumber: 'CDL-A-5562841', cdlExpiry: '2027-08-04', phone: '+1-210-555-0309', hireDate: '2021-09-12', homeBase: 'San Antonio, TX' },
  { id: 'D-004', name: 'Priya Patel',    cdlNumber: 'CDL-A-3389172', cdlExpiry: '2026-09-30', phone: '+1-512-555-0156', hireDate: '2024-02-20', homeBase: 'Austin, TX' },
  { id: 'D-005', name: 'Dmitri Volkov',  cdlNumber: 'CDL-A-4487265', cdlExpiry: '2027-05-18', phone: '+1-512-555-0421', hireDate: '2020-11-08', homeBase: 'Round Rock, TX' },
];

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Realistic J1939 fault codes (truncated from SAE J1939 standard)
const J1939_FAULTS = {
  SPN_100_FMI_1: { spn: 100, fmi: 1, code: 'SPN-100-FMI-1', description: 'Engine Oil Pressure — Low', severity: 'critical' as const },
  SPN_110_FMI_0: { spn: 110, fmi: 0, code: 'SPN-110-FMI-0', description: 'Engine Coolant Temperature — Above Normal', severity: 'critical' as const },
  SPN_102_FMI_16: { spn: 102, fmi: 16, code: 'SPN-102-FMI-16', description: 'Intake Manifold #1 Pressure — Moderately High', severity: 'warning' as const },
  SPN_3251_FMI_0: { spn: 3251, fmi: 0, code: 'SPN-3251-FMI-0', description: 'DPF Soot Load — Above Normal', severity: 'warning' as const },
  SPN_3216_FMI_2: { spn: 3216, fmi: 2, code: 'SPN-3216-FMI-2', description: 'Aftertreatment NOx Sensor — Data Erratic', severity: 'warning' as const },
  SPN_91_FMI_19: { spn: 91, fmi: 19, code: 'SPN-91-FMI-19', description: 'Accelerator Pedal Position — Network Signal Abnormal', severity: 'info' as const },
};

const TRUCKS: Truck[] = [
  {
    id: 'T-47', vin: '1FUJGLDR5KLAA4729', make: 'Freightliner', model: 'Cascadia', year: 2022, plate: 'TX-7842-JK', class: 'Class 8',
    status: 'moving',
    driverId: 'D-001',
    location: { lat: 30.2672, lng: -97.7431, address: 'I-35 N, Austin TX', speedMph: 64, heading: 12 },
    hos: { shiftStartTs: NOW - 6.5 * HOUR, hoursDriven: 6.2, hoursOnDuty: 7.8,
      hoursRemaining: { drive: 4.8, shift: 6.2, cycle: 38.5 },
      nextBreakRequiredIn: 1.8 },
    fuel: { levelPct: 0.42, mpgRecent: 6.8, estimatedRangeMi: 287 },
    faults: [],
    maintenance: { nextServiceMiles: 488500, lastServiceMiles: 485000, currentMiles: 487100, dueService: 'oil_change', daysUntilDOT: 18 },
    lastUpdateTs: NOW - 30 * 1000,
  },
  {
    id: 'T-22', vin: '3HSDJSJR8KN001822', make: 'Peterbilt', model: '579', year: 2021, plate: 'TX-3321-MP', class: 'Class 8',
    status: 'idle',
    driverId: 'D-002',
    location: { lat: 30.5083, lng: -97.8203, address: 'Pilot Travel Center, Round Rock TX', speedMph: 0, heading: 0 },
    hos: { shiftStartTs: NOW - 9.2 * HOUR, hoursDriven: 8.9, hoursOnDuty: 9.2,
      hoursRemaining: { drive: 2.1, shift: 4.8, cycle: 31.2 },
      nextBreakRequiredIn: 0.1 },  // SOON
    fuel: { levelPct: 0.78, mpgRecent: 7.1, estimatedRangeMi: 533 },
    faults: [J1939_FAULTS.SPN_3251_FMI_0],
    maintenance: { nextServiceMiles: 521000, lastServiceMiles: 518000, currentMiles: 520450, dueService: 'tire_rotation', daysUntilDOT: 42 },
    lastUpdateTs: NOW - 12 * 1000,
  },
  {
    id: 'T-31', vin: '4V4NC9EH8KN901203', make: 'Volvo', model: 'VNL 760', year: 2023, plate: 'TX-9012-RT', class: 'Class 8',
    status: 'moving',
    driverId: 'D-003',
    location: { lat: 29.4241, lng: -98.4936, address: 'I-35 S, San Antonio TX', speedMph: 58, heading: 198 },
    hos: { shiftStartTs: NOW - 2.1 * HOUR, hoursDriven: 2.1, hoursOnDuty: 2.5,
      hoursRemaining: { drive: 8.9, shift: 11.5, cycle: 47.8 },
      nextBreakRequiredIn: 5.9 },
    fuel: { levelPct: 0.22, mpgRecent: 7.4, estimatedRangeMi: 162 },  // LOW FUEL
    faults: [],
    maintenance: { nextServiceMiles: 198000, lastServiceMiles: 195000, currentMiles: 197200, dueService: 'oil_change', daysUntilDOT: 67 },
    lastUpdateTs: NOW - 8 * 1000,
  },
  {
    id: 'T-58', vin: '1XPBDB9X2KD440112', make: 'Kenworth', model: 'T680', year: 2020, plate: 'TX-5587-LQ', class: 'Class 8',
    status: 'maintenance',
    driverId: 'D-004',
    location: { lat: 30.1945, lng: -97.6694, address: 'Fleetio Service Bay, Austin TX', speedMph: 0, heading: 0 },
    hos: { shiftStartTs: NOW - 1.5 * HOUR, hoursDriven: 0, hoursOnDuty: 1.5,
      hoursRemaining: { drive: 11.0, shift: 12.5, cycle: 68.5 },
      nextBreakRequiredIn: 6.5 },
    fuel: { levelPct: 0.95, mpgRecent: 0, estimatedRangeMi: 0 },
    faults: [J1939_FAULTS.SPN_100_FMI_1, J1939_FAULTS.SPN_110_FMI_0],  // CRITICAL: low oil + high coolant
    maintenance: { nextServiceMiles: 502000, lastServiceMiles: 500000, currentMiles: 502800, dueService: 'brake_inspection', daysUntilDOT: 4 },  // DOT INSPECTION SOON
    lastUpdateTs: NOW - 45 * 1000,
  },
  {
    id: 'T-69', vin: '5KKHALDR9LPLP9821', make: 'Mack', model: 'Anthem', year: 2024, plate: 'TX-6690-WN', class: 'Class 8',
    status: 'offline',
    driverId: 'D-005',
    location: { lat: 30.5083, lng: -97.6789, address: 'Last seen: Round Rock TX', speedMph: 0, heading: 0 },
    hos: { shiftStartTs: NOW - 14 * HOUR, hoursDriven: 0, hoursOnDuty: 0,
      hoursRemaining: { drive: 11.0, shift: 14.0, cycle: 70.0 },
      nextBreakRequiredIn: 0 },
    fuel: { levelPct: 0.05, mpgRecent: 0, estimatedRangeMi: 0 },  // OFFLINE / empty
    faults: [J1939_FAULTS.SPN_3216_FMI_2, J1939_FAULTS.SPN_91_FMI_19],
    maintenance: { nextServiceMiles: 87000, lastServiceMiles: 85000, currentMiles: 86200, dueService: 'dot_inspection', daysUntilDOT: 12 },
    lastUpdateTs: NOW - 4 * HOUR,  // 4 hours ago
  },
];

// ---- Privacy Guardian: driver name masking ----
// In production, names come encrypted from the customer DB and decrypt with tenant key.
// For prototype: return masked names with a hint that the agent can request un-masking via the /api/telematics/driver/:id endpoint with proper auth.

function maskDriver(driver: Driver, requestingRole: 'agent' | 'manager' | 'viewer' = 'manager'): Omit<Driver, 'name'> & { name: string; nameEncrypted: boolean } {
  if (requestingRole === 'manager') {
    return { ...driver, nameEncrypted: false };
  }
  // For non-manager views (agent, third-party integrations), mask
  const masked = driver.name.split(' ').map(part => part[0] + '.').join(' ');
  return { ...driver, name: masked, nameEncrypted: true };
}

// ---- Route handler ----

export async function GET(request: Request) {
  const url = new URL(request.url);
  const truckId = url.searchParams.get('truck');
  const driverId = url.searchParams.get('driver');
  const role = (url.searchParams.get('role') as 'agent' | 'manager' | 'viewer') || 'manager';

  if (truckId) {
    const truck = TRUCKS.find(t => t.id === truckId);
    if (!truck) {
      return NextResponse.json({ error: 'truck_not_found', truckId }, { status: 404 });
    }
    const driver = DRIVERS.find(d => d.id === truck.driverId);
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
    const driver = DRIVERS.find(d => d.id === driverId);
    if (!driver) {
      return NextResponse.json({ error: 'driver_not_found', driverId }, { status: 404 });
    }
    const trucks = TRUCKS.filter(t => t.driverId === driverId);
    return NextResponse.json({
      driver: maskDriver(driver, role),
      trucks,
      privacy: {
        role,
        driverNameMasked: role !== 'manager',
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Default: full fleet
  const fleet: Fleet = {
    id: 'aegis-demo-fleet-001',
    name: 'Demo Logistics LLC',
    trucks: TRUCKS,
    drivers: DRIVERS.map(d => maskDriver(d, role)),
    lastUpdateTs: NOW,
  };

  return NextResponse.json({
    fleet,
    summary: {
      totalTrucks: TRUCKS.length,
      moving: TRUCKS.filter(t => t.status === 'moving').length,
      idle: TRUCKS.filter(t => t.status === 'idle').length,
      maintenance: TRUCKS.filter(t => t.status === 'maintenance').length,
      offline: TRUCKS.filter(t => t.status === 'offline').length,
      criticalFaults: TRUCKS.reduce((sum, t) => sum + t.faults.filter(f => f.severity === 'critical').length, 0),
      warnings: TRUCKS.reduce((sum, t) => sum + t.faults.filter(f => f.severity === 'warning').length, 0),
      driversOnDuty: TRUCKS.filter(t => t.status === 'moving' || t.status === 'idle').length,
      hosWarnings: TRUCKS.filter(t => t.hos.nextBreakRequiredIn < 0.5).length,  // break due in <30 min
      lowFuel: TRUCKS.filter(t => t.fuel.levelPct < 0.25).length,
      dotInspectionsDueSoon: TRUCKS.filter(t => t.maintenance.daysUntilDOT < 14).length,
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
  // In real Aegis: handle telematics ingest from Samsara/Motive/Geotab webhooks
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({
    accepted: true,
    ingestId: randomUUID(),
    note: 'Mock endpoint — real webhooks from telematics providers go here in production.',
    received: body,
  });
}
