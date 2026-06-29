// src/lib/fleet-store.ts
// Aegis shared in-memory fleet state.
// - Module-level mutable arrays (Node.js process singletons; survive across requests in dev)
// - Mutations are synchronous + atomic for prototype. Production: swap to Postgres or Redis with row-level locking.
// - All timestamps are generated fresh on module load so demo data is always recent.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const bootMs = Date.now();

// ─── Types ────────────────────────────────────────────────────────────

export type Driver = {
  id: string;             // D-001
  name: string;
  cdlNumber: string;
  cdlExpiry: string;
  phone: string;
  hireDate: string;
  homeBase: string;
};

export type TruckStatus = 'moving' | 'idle' | 'maintenance' | 'offline';

export type DutyStatus = 'OFF_DUTY' | 'SLEEPER' | 'ON_DUTY' | 'DRIVING';

export type J1939Fault = {
  spn: number;
  fmi: number;
  code: string;       // SPN-100-FMI-1
  description: string;
  severity: 'info' | 'warning' | 'critical';
  ts: number;
};

export type Truck = {
  id: string;          // T-22
  vin: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  class: 'Class 6' | 'Class 7' | 'Class 8';
  status: TruckStatus;
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
    hoursRemaining: { drive: number; shift: number; cycle: number };
    nextBreakRequiredIn: number;
  };
  fuel: { levelPct: number; mpgRecent: number; estimatedRangeMi: number };
  faults: J1939Fault[];
  maintenance: {
    nextServiceMiles: number;
    lastServiceMiles: number;
    currentMiles: number;
    dueService: string;
    daysUntilDOT: number;
  };
  lastUpdateTs: number;
};

// Inbound driver-event from Compass
export type DriverEvent = {
  event_id?: string;                       // idempotency key from Compass
  truck_id: string;
  driver_id: string;
  ts: number;                              // epoch ms
  event_type:
    | 'duty_status_change'
    | 'location_update'
    | 'fault_event'
    | 'hos_break_complete'
    | 'ignition'
    | 'fuel_update'
    | 'heartbeat';
  // Event-specific
  duty_status?: DutyStatus;                // for duty_status_change
  lat?: number;                            // for location_update
  lng?: number;
  speed_mph?: number;
  heading?: number;
  // Fault
  spn?: number;
  fmi?: number;
  fault_code?: string;
  fault_description?: string;
  fault_severity?: 'info' | 'warning' | 'critical';
  // Misc
  fuel_level_pct?: number;
  notes?: string;
};

// ─── Seed data ────────────────────────────────────────────────────────

const J1939_FAULTS = {
  SPN_100_FMI_1: { spn: 100, fmi: 1, code: 'SPN-100-FMI-1', description: 'Engine Oil Pressure — Low', severity: 'critical' as const },
  SPN_110_FMI_0: { spn: 110, fmi: 0, code: 'SPN-110-FMI-0', description: 'Engine Coolant Temperature — Above Normal', severity: 'critical' as const },
  SPN_102_FMI_16: { spn: 102, fmi: 16, code: 'SPN-102-FMI-16', description: 'Intake Manifold #1 Pressure — Moderately High', severity: 'warning' as const },
  SPN_3251_FMI_0: { spn: 3251, fmi: 0, code: 'SPN-3251-FMI-0', description: 'DPF Soot Load — Above Normal', severity: 'warning' as const },
  SPN_3216_FMI_2: { spn: 3216, fmi: 2, code: 'SPN-3216-FMI-2', description: 'Aftertreatment NOx Sensor — Data Erratic', severity: 'warning' as const },
  SPN_91_FMI_19: { spn: 91, fmi: 19, code: 'SPN-91-FMI-19', description: 'Accelerator Pedal Position — Network Signal Abnormal', severity: 'info' as const },
};

const seedDrivers: Driver[] = [
  { id: 'D-001', name: 'Marcus Johnson', cdlNumber: 'CDL-A-7842159', cdlExpiry: '2027-03-15', phone: '+1-512-555-0184', hireDate: '2022-06-01', homeBase: 'Austin, TX' },
  { id: 'D-002', name: 'Sofia Reyes',     cdlNumber: 'CDL-A-9210374', cdlExpiry: '2026-11-22', phone: '+1-737-555-0247', hireDate: '2023-01-15', homeBase: 'Austin, TX' },
  { id: 'D-003', name: 'Jamal Carter',    cdlNumber: 'CDL-A-5562841', cdlExpiry: '2027-08-04', phone: '+1-210-555-0309', hireDate: '2021-09-12', homeBase: 'San Antonio, TX' },
  { id: 'D-004', name: 'Priya Patel',     cdlNumber: 'CDL-A-3389172', cdlExpiry: '2026-09-30', phone: '+1-512-555-0156', hireDate: '2024-02-20', homeBase: 'Austin, TX' },
  { id: 'D-005', name: 'Dmitri Volkov',   cdlNumber: 'CDL-A-4487265', cdlExpiry: '2027-05-18', phone: '+1-512-555-0421', hireDate: '2020-11-08', homeBase: 'Round Rock, TX' },
];

const seedTrucks: Truck[] = [
  {
    id: 'T-47', vin: '1FUJGLDR5KLAA4729', make: 'Freightliner', model: 'Cascadia', year: 2022, plate: 'TX-7842-JK', class: 'Class 8',
    status: 'moving', driverId: 'D-001',
    location: { lat: 30.2672, lng: -97.7431, address: 'I-35 N, Austin TX', speedMph: 64, heading: 12 },
    hos: { shiftStartTs: bootMs - 6.5 * HOUR, hoursDriven: 6.2, hoursOnDuty: 7.8, hoursRemaining: { drive: 4.8, shift: 6.2, cycle: 38.5 }, nextBreakRequiredIn: 1.8 },
    fuel: { levelPct: 0.42, mpgRecent: 6.8, estimatedRangeMi: 287 },
    faults: [],
    maintenance: { nextServiceMiles: 488500, lastServiceMiles: 485000, currentMiles: 487100, dueService: 'oil_change', daysUntilDOT: 18 },
    lastUpdateTs: bootMs - 30 * 1000,
  },
  {
    id: 'T-22', vin: '3HSDJSJR8KN001822', make: 'Peterbilt', model: '579', year: 2021, plate: 'TX-3321-MP', class: 'Class 8',
    status: 'idle', driverId: 'D-002',
    location: { lat: 30.5083, lng: -97.8203, address: 'Pilot Travel Center, Round Rock TX', speedMph: 0, heading: 0 },
    hos: { shiftStartTs: bootMs - 9.2 * HOUR, hoursDriven: 8.9, hoursOnDuty: 9.2, hoursRemaining: { drive: 2.1, shift: 4.8, cycle: 31.2 }, nextBreakRequiredIn: 0.1 },
    fuel: { levelPct: 0.78, mpgRecent: 7.1, estimatedRangeMi: 533 },
    faults: [J1939_FAULTS.SPN_3251_FMI_0],
    maintenance: { nextServiceMiles: 521000, lastServiceMiles: 518000, currentMiles: 520450, dueService: 'tire_rotation', daysUntilDOT: 42 },
    lastUpdateTs: bootMs - 12 * 1000,
  },
  {
    id: 'T-31', vin: '4V4NC9EH8KN901203', make: 'Volvo', model: 'VNL 760', year: 2023, plate: 'TX-9012-RT', class: 'Class 8',
    status: 'moving', driverId: 'D-003',
    location: { lat: 29.4241, lng: -98.4936, address: 'I-35 S, San Antonio TX', speedMph: 58, heading: 198 },
    hos: { shiftStartTs: bootMs - 2.1 * HOUR, hoursDriven: 2.1, hoursOnDuty: 2.5, hoursRemaining: { drive: 8.9, shift: 11.5, cycle: 47.8 }, nextBreakRequiredIn: 5.9 },
    fuel: { levelPct: 0.22, mpgRecent: 7.4, estimatedRangeMi: 162 },
    faults: [],
    maintenance: { nextServiceMiles: 198000, lastServiceMiles: 195000, currentMiles: 197200, dueService: 'oil_change', daysUntilDOT: 67 },
    lastUpdateTs: bootMs - 8 * 1000,
  },
  {
    id: 'T-58', vin: '1XPBDB9X2KD440112', make: 'Kenworth', model: 'T680', year: 2020, plate: 'TX-5587-LQ', class: 'Class 8',
    status: 'maintenance', driverId: 'D-004',
    location: { lat: 30.1945, lng: -97.6694, address: 'Fleetio Service Bay, Austin TX', speedMph: 0, heading: 0 },
    hos: { shiftStartTs: bootMs - 1.5 * HOUR, hoursDriven: 0, hoursOnDuty: 1.5, hoursRemaining: { drive: 11.0, shift: 12.5, cycle: 68.5 }, nextBreakRequiredIn: 6.5 },
    fuel: { levelPct: 0.95, mpgRecent: 0, estimatedRangeMi: 0 },
    faults: [J1939_FAULTS.SPN_100_FMI_1, J1939_FAULTS.SPN_110_FMI_0],
    maintenance: { nextServiceMiles: 502000, lastServiceMiles: 500000, currentMiles: 502800, dueService: 'brake_inspection', daysUntilDOT: 4 },
    lastUpdateTs: bootMs - 45 * 1000,
  },
  {
    id: 'T-69', vin: '5KKHALDR9LPLP9821', make: 'Mack', model: 'Anthem', year: 2024, plate: 'TX-6690-WN', class: 'Class 8',
    status: 'offline', driverId: 'D-005',
    location: { lat: 30.5083, lng: -97.6789, address: 'Last seen: Round Rock TX', speedMph: 0, heading: 0 },
    hos: { shiftStartTs: bootMs - 14 * HOUR, hoursDriven: 0, hoursOnDuty: 0, hoursRemaining: { drive: 11.0, shift: 14.0, cycle: 70.0 }, nextBreakRequiredIn: 0 },
    fuel: { levelPct: 0.05, mpgRecent: 0, estimatedRangeMi: 0 },
    faults: [J1939_FAULTS.SPN_3216_FMI_2, J1939_FAULTS.SPN_91_FMI_19],
    maintenance: { nextServiceMiles: 87000, lastServiceMiles: 85000, currentMiles: 86200, dueService: 'dot_inspection', daysUntilDOT: 12 },
    lastUpdateTs: bootMs - 4 * HOUR,
  },
];

// Module-level mutable singletons — survives across requests in dev.
// In production these would be a Postgres connection + Redis cache.
const driversState: Driver[] = [...seedDrivers];
const trucksState: Truck[] = JSON.parse(JSON.stringify(seedTrucks));

// Idempotency cache: track recent event_ids so retries don't double-process
const seenEvents = new Map<string, number>(); // event_id → ts
const SEEN_TTL_MS = 10 * 60 * 1000;

function pruneSeen() {
  const now = Date.now();
  for (const [k, ts] of seenEvents.entries()) {
    if (now - ts > SEEN_TTL_MS) seenEvents.delete(k);
  }
}

// ─── Read API ─────────────────────────────────────────────────────────

export function getAllDrivers(): Driver[] { return driversState; }
export function getAllTrucks(): Truck[] { return trucksState; }

export function getDriver(id: string): Driver | null {
  return driversState.find((d) => d.id === id) ?? null;
}

export function getTruck(id: string): Truck | null {
  return trucksState.find((t) => t.id === id) ?? null;
}

// ─── Privacy Guardian masker ──────────────────────────────────────────

export type Role = 'agent' | 'manager' | 'viewer';

export type MaskedDriver = Omit<Driver, 'name'> & { name: string; nameEncrypted: boolean };

export function maskDriver(driver: Driver, role: Role = 'manager'): MaskedDriver {
  if (role === 'manager') return { ...driver, nameEncrypted: false };
  const masked = driver.name.split(' ').map((p) => p[0] + '.').join(' ');
  return { ...driver, name: masked, nameEncrypted: true };
}

// ─── Mutations ────────────────────────────────────────────────────────

export type EventResult = {
  accepted: boolean;
  reason?: string;
  truck?: Truck;
  event_id?: string;
};

/**
 * Apply a Compass driver event to fleet state.
 * Idempotent on event_id within a 10-minute window.
 */
export function applyDriverEvent(evt: DriverEvent): EventResult {
  // Idempotency check
  if (evt.event_id) {
    pruneSeen();
    if (seenEvents.has(evt.event_id)) {
      return { accepted: true, reason: 'duplicate_event', truck: getTruck(evt.truck_id) ?? undefined, event_id: evt.event_id };
    }
    seenEvents.set(evt.event_id, Date.now());
  }

  const truck = getTruck(evt.truck_id);
  if (!truck) return { accepted: false, reason: `unknown_truck:${evt.truck_id}` };
  if (truck.driverId !== evt.driver_id) {
    // Log it but don't reject — driver reassignments are valid
  }

  const ts = evt.ts || Date.now();
  truck.lastUpdateTs = ts;

  switch (evt.event_type) {
    case 'duty_status_change': {
      const d = evt.duty_status;
      if (!d) return { accepted: false, reason: 'missing_duty_status' };

      // Map FMCSA duty status → Aegis truck status
      // DRIVING → moving; ON_DUTY → idle (working, not driving); OFF_DUTY/SLEEPER → idle (parked)
      truck.status = d === 'DRIVING' ? 'moving' : 'idle';
      truck.location.speedMph = d === 'DRIVING' ? (evt.speed_mph ?? 55) : 0;
      // Position often comes with duty_status_change events from the ELD — apply it
      if (typeof evt.lat === 'number') truck.location.lat = evt.lat;
      if (typeof evt.lng === 'number') truck.location.lng = evt.lng;
      if (typeof evt.heading === 'number') truck.location.heading = evt.heading;
      if (d === 'DRIVING' && truck.hos.hoursDriven === 0) {
        // Fresh shift start
        truck.hos.shiftStartTs = ts;
        truck.hos.hoursOnDuty = 0;
        truck.hos.hoursDriven = 0;
      }
      truck.location.address = d === 'DRIVING'
        ? `Driving · ${truck.location.address.split('·').pop()?.trim() ?? 'en route'}`
        : `Stopped · driver went ${d.toLowerCase().replace('_', ' ')}`;
      break;
    }

    case 'location_update': {
      if (typeof evt.lat === 'number') truck.location.lat = evt.lat;
      if (typeof evt.lng === 'number') truck.location.lng = evt.lng;
      if (typeof evt.speed_mph === 'number') {
        truck.location.speedMph = evt.speed_mph;
        truck.status = evt.speed_mph < 2 ? 'idle' : 'moving';
      }
      if (typeof evt.heading === 'number') truck.location.heading = evt.heading;
      break;
    }

    case 'fault_event': {
      const spn = evt.spn, fmi = evt.fmi;
      if (typeof spn !== 'number' || typeof fmi !== 'number' || !evt.fault_code || !evt.fault_description || !evt.fault_severity) {
        return { accepted: false, reason: 'invalid_fault_payload' };
      }
      // De-dupe: don't add a fault with the same code if already present
      if (!truck.faults.some((f) => f.code === evt.fault_code)) {
        truck.faults.push({
          spn, fmi,
          code: evt.fault_code,
          description: evt.fault_description,
          severity: evt.fault_severity,
          ts,
        });
      }
      break;
    }

    case 'hos_break_complete': {
      // After a 30-min break, reset the break-due clock
      truck.hos.nextBreakRequiredIn = 8; // 8 hours until next break
      truck.hos.hoursDriven = Math.max(0, truck.hos.hoursDriven - 0.5);
      break;
    }

    case 'ignition': {
      truck.status = truck.status === 'offline' ? 'idle' : truck.status;
      break;
    }

    case 'fuel_update': {
      if (typeof evt.fuel_level_pct === 'number') {
        truck.fuel.levelPct = evt.fuel_level_pct;
        truck.fuel.estimatedRangeMi = Math.round(evt.fuel_level_pct * 800); // rough
      }
      break;
    }

    case 'heartbeat': {
      // Just refresh lastUpdateTs — already done above
      break;
    }

    default:
      return { accepted: false, reason: `unknown_event_type:${(evt as any).event_type}` };
  }

  return { accepted: true, truck, event_id: evt.event_id };
}

/**
 * Reset fleet state to seed. For demo reset button.
 */
export function resetFleet(): void {
  driversState.splice(0, driversState.length, ...JSON.parse(JSON.stringify(seedDrivers)));
  trucksState.splice(0, trucksState.length, ...JSON.parse(JSON.stringify(seedTrucks)));
  seenEvents.clear();
}
