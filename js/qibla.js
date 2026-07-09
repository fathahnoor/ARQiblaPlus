/**
 * ARQiblaPlus — Qibla Calculation
 * Calculates Qibla bearing from user's location to the Kaaba
 */

const KAABA = {
  latitude: 21.4225,
  longitude: 39.8262,
};

/**
 * Calculate Qibla bearing (degrees clockwise from True North)
 * Uses Great Circle bearing formula with spherical trigonometry
 */
function calculateQibla(userLat, userLon) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const phi1 = toRad(userLat);
  const phi2 = toRad(KAABA.latitude);
  const deltaLambda = toRad(KAABA.longitude - userLon);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const bearing = toDeg(Math.atan2(y, x));
  return normalizeAngle(bearing);
}

/**
 * Get relative bearing (how much user needs to turn)
 * relativeBearing = 0 means facing Qibla
 */
function getRelativeBearing(qiblaBearing, deviceHeading) {
  if (qiblaBearing === null || deviceHeading === null) return null;
  const relative = ((qiblaBearing - deviceHeading) % 360 + 360) % 360;
  return relative;
}

/**
 * Get human-readable direction instruction
 */
function getQiblaInstruction(relativeBearing) {
  if (relativeBearing === null) return 'Kompas belum siap';

  const angle = normalizeAngle(relativeBearing);
  if (angle < 15 || angle > 345) {
    return 'Kiblat: Lurus ke depan ✓';
  } else if (angle < 180) {
    return `Kiblat: Putar ke kanan ${Math.round(angle)}°`;
  } else {
    return `Kiblat: Putar ke kiri ${Math.round(360 - angle)}°`;
  }
}
