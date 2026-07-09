/**
 * ARQiblaPlus — Geolocation Service
 * Wraps navigator.geolocation.watchPosition with error handling and fallbacks
 */

const GeolocationService = {
  watchId: null,
  fallbackInterval: null,
  lastPosition: null,
  lastQueryPosition: null,

  /**
   * Start continuous GPS tracking
   * Falls back to getCurrentPosition polling if watchPosition fails
   */
  start() {
    if (!('geolocation' in navigator)) {
      EventBus.emit('location:error', {
        code: -1,
        message: 'Geolocation tidak didukung di browser ini',
      });
      return;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    };

    const onSuccess = (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      this.lastPosition = { latitude, longitude, accuracy, timestamp: position.timestamp };

      EventBus.emit('location:update', this.lastPosition);

      // Check if user moved far enough to re-query mosques
      if (
        !this.lastQueryPosition ||
        haversine(
          this.lastQueryPosition.latitude,
          this.lastQueryPosition.longitude,
          latitude,
          longitude
        ) > 1000
      ) {
        EventBus.emit('location:significant', this.lastPosition);
      }

      if (accuracy > 50) {
        EventBus.emit('location:low-accuracy', accuracy);
      }
    };

    const onError = (error) => {
      console.warn('Geolocation watch error:', error.message);
      EventBus.emit('location:error', error);

      if (error.code === error.PERMISSION_DENIED) {
        this.stop();
        return;
      }

      // Fallback: poll with getCurrentPosition every 5 seconds
      if (!this.fallbackInterval) {
        this.fallbackInterval = setInterval(() => {
          navigator.geolocation.getCurrentPosition(onSuccess, () => {}, options);
        }, 5000);
      }
    };

    this.watchId = navigator.geolocation.watchPosition(onSuccess, onError, options);
  },

  /**
   * Stop all GPS tracking
   */
  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
  },

  /**
   * Mark current position as query position (for cache key)
   */
  markQueryPosition() {
    if (this.lastPosition) {
      this.lastQueryPosition = { ...this.lastPosition };
    }
  },

  /**
   * Get last known position
   */
  getLastPosition() {
    return this.lastPosition;
  },
};
