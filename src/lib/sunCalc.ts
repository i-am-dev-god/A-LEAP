/**
 * Solar position for Hyderabad (NOAA solar-position algorithm).
 * Powers the real-time day/night lighting rig of the 3D scene.
 */
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface SunPosition {
  /** Degrees clockwise from true north. */
  azimuthDeg: number;
  /** Degrees above the horizon (negative at night). */
  elevationDeg: number;
  declinationDeg: number;
  equationOfTimeMin: number;
  hourAngleDeg: number;
  isDay: boolean;
}

export function solarPosition(date: Date, lat: number, lon: number): SunPosition {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;

  const L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

  const Mrad = M * RAD;
  const C =
    Math.sin(Mrad) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mrad) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mrad) * 0.000289;

  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);

  const meanObliq = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(omega * RAD);

  const declination = Math.asin(Math.sin(obliq * RAD) * Math.sin(appLong * RAD)) * DEG;

  const varY = Math.tan((obliq * RAD) / 2) ** 2;
  const eqTime =
    4 *
    DEG *
    (varY * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(Mrad) +
      4 * e * varY * Math.sin(Mrad) * Math.cos(2 * L0 * RAD) -
      0.5 * varY * varY * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * Mrad));

  const utcMinutes =
    date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const trueSolarTime = utcMinutes + eqTime + 4 * lon;
  const hourAngle = trueSolarTime / 4 - 180;

  const latR = lat * RAD;
  const decR = declination * RAD;
  const haR = hourAngle * RAD;

  const cosZenith =
    Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(haR);
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith))) * DEG;

  let elevation = 90 - zenith;

  // Atmospheric refraction near the horizon
  const refraction =
    elevation > 85
      ? 0
      : 58.1 / Math.tan(elevation * RAD) -
        0.07 / Math.tan(elevation * RAD) ** 3 +
        0.000086 / Math.tan(elevation * RAD) ** 5;
  if (elevation > -0.575) elevation += refraction / 3600;

  const azimuth =
    (Math.atan2(
      Math.sin(haR),
      Math.cos(haR) * Math.sin(latR) - Math.tan(decR) * Math.cos(latR)
    ) * DEG +
      180 +
      360) %
    360;

  return {
    azimuthDeg: azimuth,
    elevationDeg: elevation,
    declinationDeg: declination,
    equationOfTimeMin: eqTime,
    hourAngleDeg: hourAngle,
    isDay: elevation > 0,
  };
}

/** Hyderabad wall-clock minutes (0–1440) → UTC instant on the current UTC date. */
export function hyderabadInstant(minutes: number, base = new Date()): Date {
  const utcMidnight = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  return new Date(utcMidnight + (minutes - 330) * 60000); // IST = UTC+5:30
}

export function currentHyderabadMinutes(base = new Date()): number {
  const ist = new Date(base.getTime() + 330 * 60000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

export function sunDirection(azimuthDeg: number, elevationDeg: number): { east: number; north: number; up: number } {
  const az = azimuthDeg * RAD;
  const el = Math.max(-8, elevationDeg) * RAD;
  const cosEl = Math.cos(el);
  return { east: Math.sin(az) * cosEl, north: Math.cos(az) * cosEl, up: Math.sin(el) };
}
