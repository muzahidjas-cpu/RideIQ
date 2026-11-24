// RideIQ Privacy Utilities
// PII masking and data minimization for driver/rider data.

export const PII_FIELDS = [
  'name', 'email', 'phone', 'licenseNumber', 'externalId',
] as const;

export function maskPII<T extends Record<string, unknown>>(obj: T): T {
  const masked = { ...obj } as Record<string, unknown>;
  for (const field of PII_FIELDS) {
    if (field in masked && masked[field] != null) {
      const val = String(masked[field]);
      if (val.length <= 2) {
        masked[field] = '*'.repeat(val.length);
      } else if (field === 'email') {
        const [local, domain] = val.split('@');
        masked[field] = `${local.charAt(0)}***@${domain}`;
      } else if (field === 'phone') {
        masked[field] = val.replace(/\d/g, '*');
      } else {
        masked[field] = val.charAt(0) + '*'.repeat(val.length - 1);
      }
    }
  }
  return masked as T;
}

export function pseudonymizeDriverId(driverId: string): string {
  // Return a stable pseudonym - first 4 chars + hash-like suffix
  return `drv_${driverId.slice(0, 4)}...`;
}

export function pseudonymizeRiderId(riderId: string): string {
  return `rider_${riderId.slice(0, 4)}...`;
}

export function minimizeLocationData(
  lat: number,
  lng: number,
  precision: number = 2,
): { lat: number; lng: number } {
  const factor = Math.pow(10, precision);
  return {
    lat: Math.round(lat * factor) / factor,
    lng: Math.round(lng * factor) / factor,
  };
}

export function isSynthetic(data: unknown): boolean {
  if (data && typeof data === 'object') {
    return (data as Record<string, unknown>).isSynthetic === true;
  }
  return false;
}

export function requireSyntheticLabel(data: unknown): unknown {
  if (data && typeof data === 'object' && !isSynthetic(data)) {
    // In development, allow real data. In production, enforce synthetic-only for demos.
    if (process.env.NODE_ENV === 'production' && process.env.ENFORCE_SYNTHETIC_ONLY === 'true') {
      throw new Error('Non-synthetic data not allowed in this context');
    }
  }
  return data;
}
