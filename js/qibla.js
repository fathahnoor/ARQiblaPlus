/**
 * ARQiblaPlus - Qibla Calculation
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
