import crypto from 'crypto';

/**
 * HMAC-SHA256 webhook verification.
 *
 * Compass (or any trusted driver-app client) signs every event body with a shared secret.
 * Aegis verifies the signature with a constant-time comparison and rejects on mismatch.
 *
 * Setup:
 *   1. Generate a random secret: `openssl rand -hex 32`
 *   2. Set AEGIS_HMAC_SECRET=… in both Aegis and Compass env.
 *   3. Compass sends: `X-Aegis-Signature: sha256=<hex(hmac(secret, body))>`
 *   4. Aegis computes the same and compares.
 *
 * For dev/demo without HTTPS, set AEGIS_HMAC_SECRET to a known value.
 */

const SIG_HEADER = 'x-aegis-signature';
const TIMESTAMP_HEADER = 'x-aegis-timestamp';

export type VerifyResult = {
  ok: boolean;
  reason?: string;
};

export function verifyWebhookSignature(
  rawBody: string,
  headers: Headers,
  options?: {
    secret?: string;
    /** Reject events older than this many seconds (default 300 = 5 minutes) */
    toleranceSeconds?: number;
  }
): VerifyResult {
  const secret = options?.secret ?? process.env.AEGIS_HMAC_SECRET ?? '';
  if (!secret) {
    return { ok: false, reason: 'server_misconfigured:missing_secret' };
  }

  const sigHeader = headers.get(SIG_HEADER);
  const tsHeader = headers.get(TIMESTAMP_HEADER);
  if (!sigHeader || !tsHeader) {
    return { ok: false, reason: 'missing_signature_or_timestamp_header' };
  }

  // Optional replay-protection: reject events older than tolerance
  const toleranceSec = options?.toleranceSeconds ?? 300;
  const ts = parseInt(tsHeader, 10);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid_timestamp' };
  const ageSec = Math.abs(Date.now() / 1000 - ts);
  if (ageSec > toleranceSec) return { ok: false, reason: `event_too_old_or_skewed:${ageSec.toFixed(0)}s` };

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = sigHeader.replace(/^sha256=/, '');

  // Constant-time compare
  if (
    typeof provided !== 'string' ||
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
  ) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  return { ok: true };
}

/**
 * Helper: produce the headers a Compass client should send.
 * Exposed so the test/mock scripts use the same code path.
 */
export function signBody(rawBody: string, options?: { secret?: string; timestamp?: number }): Record<string, string> {
  const secret = options?.secret ?? process.env.AEGIS_HMAC_SECRET ?? '';
  const ts = (options?.timestamp ?? Math.floor(Date.now() / 1000)).toString();
  const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return {
    [TIMESTAMP_HEADER]: ts,
    [SIG_HEADER]: `sha256=${sig}`,
    'Content-Type': 'application/json',
  };
}
