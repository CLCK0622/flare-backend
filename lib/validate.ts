export function clampString(
  value: unknown,
  maxLength: number,
  fallback = ""
): string {
  if (typeof value !== "string") return fallback;
  return value.slice(0, maxLength);
}

export function validLat(value: unknown): boolean {
  return typeof value === "number" && value >= -90 && value <= 90;
}

export function validLng(value: unknown): boolean {
  return typeof value === "number" && value >= -180 && value <= 180;
}

export function positiveInt(value: unknown, fallback = 1): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
    return fallback;
  return value;
}
