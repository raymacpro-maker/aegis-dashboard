import { NextResponse } from 'next/server';
import { applyDriverEvent, type DriverEvent } from '@/lib/fleet-store';
import { verifyWebhookSignature } from '@/lib/webhook-auth';

/**
 * Aegis → Compass Driver Event Webhook
 *
 * Receives duty-status changes, location updates, fault events, and heartbeats
 * from the Compass ELD Android app (or any HMAC-signed client).
 *
 * Auth: HMAC-SHA256 signature in `X-Aegis-Signature` header. See lib/webhook-auth.ts.
 *
 * Idempotency: Optional `event_id` from Compass. Repeated events within 10 min are no-ops.
 *
 * Example events:
 *   { event_id: "evt_123", truck_id: "T-22", driver_id: "D-002",
 *     event_type: "duty_status_change", duty_status: "DRIVING",
 *     lat: 30.5, lng: -97.7, speed_mph: 55, ts: 1735555200000 }
 *   { event_id: "evt_124", truck_id: "T-22", driver_id: "D-002",
 *     event_type: "fault_event", spn: 100, fmi: 1, fault_code: "SPN-100-FMI-1",
 *     fault_description: "Engine Oil Pressure — Low", fault_severity: "critical",
 *     ts: 1735555260000 }
 */

export async function POST(request: Request) {
  // Read raw body for HMAC verification
  const rawBody = await request.text();

  // Verify signature BEFORE parsing (prevents signature downgrade attacks via partial JSON)
  const verify = verifyWebhookSignature(rawBody, request.headers);
  if (!verify.ok) {
    console.warn('[aegis/webhook] rejected:', verify.reason);
    return NextResponse.json(
      { error: 'unauthorized', reason: verify.reason },
      { status: 401 }
    );
  }

  // Parse JSON
  let body: DriverEvent;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // Schema sanity
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }
  if (!body.truck_id || !body.driver_id || !body.event_type) {
    return NextResponse.json(
      { error: 'missing_required_fields', required: ['truck_id', 'driver_id', 'event_type'] },
      { status: 400 }
    );
  }

  // Apply to fleet state
  const result = applyDriverEvent(body);

  if (!result.accepted) {
    return NextResponse.json(
      { accepted: false, reason: result.reason, event_id: body.event_id },
      { status: 400 }
    );
  }

  // In production: also emit to SSE bus so dashboards refresh in real-time.
  // For W1: dashboard polls every 10s, which is fine.

  return NextResponse.json({
    accepted: true,
    event_id: body.event_id,
    truck_id: body.truck_id,
    truck_status: result.truck?.status,
    applied_at: new Date().toISOString(),
  });
}

/** For local dev convenience: GET returns the route's purpose & schema. */
export async function GET() {
  return NextResponse.json({
    endpoint: 'POST /api/driver/event',
    auth: 'HMAC-SHA256 in X-Aegis-Signature header',
    fields: {
      event_id: 'optional idempotency key (string)',
      truck_id: 'required (e.g. T-22)',
      driver_id: 'required (e.g. D-002)',
      ts: 'required epoch ms',
      event_type: 'required (duty_status_change|location_update|fault_event|hos_break_complete|ignition|fuel_update|heartbeat)',
      // event-specific
      duty_status: 'OFF_DUTY|SLEEPER|ON_DUTY|DRIVING (for duty_status_change)',
      lat: 'number (location_update)',
      lng: 'number (location_update)',
      speed_mph: 'number (location_update)',
      heading: 'number (location_update)',
      spn: 'number (fault_event)',
      fmi: 'number (fault_event)',
      fault_code: 'SPN-XXX-FMI-X (fault_event)',
      fault_description: 'string (fault_event)',
      fault_severity: 'info|warning|critical (fault_event)',
      fuel_level_pct: '0..1 (fuel_update)',
    },
  });
}
