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