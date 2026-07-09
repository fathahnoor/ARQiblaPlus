/**
 * ARQiblaPlus — Utility Functions
 * Haversine, destination point, bearing, debounce, formatting helpers
 */

/**
 * Calculate Haversine distance between two coordinates in meters
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate destination point given start point, bearing, and distance
 * Uses spherical earth model
 */
function destinationPoint(lat, lon, bearing, distance) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  const lat1 = toRad(lat);
  const lon1 = toRad(lon);
  const brng = toRad(bearing);
  const dr = distance / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dr) +
      Math.cos(lat1) * Math.sin(dr) * Math.cos(brng)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(dr) * Math.cos(lat1),
      Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    latitude: toDeg(lat2),
    longitude: ((toDeg(lon2) + 540) % 360) - 180,
  };
}

/**
 * Normalize bearing/angle to 0–360 range
 */
function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

/**
 * Format distance in meters to human-readable string
 */
function formatDistance(meters) {
  if (meters < 1000) {
    return Math.round(meters) + ' m';
  }
  return (meters / 1000).toFixed(1) + ' km';
}

/**
 * Debounce function
 */
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Simple event bus (Pub/Sub)
 */
const EventBus = {
  events: {},
  on(event, callback) {
    (this.events[event] = this.events[event] || []).push(callback);
    return () => this.off(event, callback);
  },
  off(event, callback) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter((cb) => cb !== callback);
  },
  emit(event, data) {
    (this.events[event] || []).forEach((cb) => cb(data));
  },
};
