/**
 * ARQiblaPlus - Compass Service
 * Handles DeviceOrientation API for compass heading across Android and iOS
 */

const CompassService = {
  heading: null,
  accuracy: null,
  active: false,
  orientationHandler: null,

  /**
   * Request permission (iOS 13+) and start listening
   * Must be called from a user gesture on iOS
   */
  async requestAndStart() {
    // iOS 13+ requires explicit permission request from user gesture
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          EventBus.emit('compass:denied');
          return false;
        }
        this._startListening();
        return true;
      } catch (err) {
        console.warn('Compass permission error:', err);
        EventBus.emit('compass:denied');
        return false;
      }
    } else {
      // Android or older iOS - start directly
      this._startListening();
      return true;
    }
  },

  /**
   * Start listening to device orientation events
   */
  _startListening() {
    if (this.active) return;

    this.orientationHandler = (event) => {
      let heading = null;
      let accuracy = null;

      // Both Android Chrome and iOS Safari provide webkitCompassHeading
      // which returns degrees clockwise from north (0 = North, 90 = East)
      if (event.webkitCompassHeading !== undefined) {
        heading = normalizeAngle(event.webkitCompassHeading);
        accuracy = event.webkitCompassAccuracy || null;
      }
      // Fallback: use event.alpha from DeviceOrientationEvent
      // event.alpha is counter-clockwise from north in W3C spec,
      // so convert to clockwise: 360 - alpha
      else if (event.alpha != null) {
        heading = normalizeAngle(360 - event.alpha);
      }

      if (heading !== null) {
        this.heading = heading;
        this.accuracy = accuracy;
        EventBus.emit('compass:heading', { heading, accuracy });
      }
    };

    // Try absolute orientation first (Android Chrome)
    window.addEventListener('deviceorientationabsolute', this.orientationHandler, true);

    // Also listen to deviceorientation as fallback
    window.addEventListener('deviceorientation', this.orientationHandler, true);

    this.active = true;
    EventBus.emit('compass:active', true);
  },

  /**
   * Stop listening
   */
  stop() {
    if (!this.active) return;
    window.removeEventListener('deviceorientationabsolute', this.orientationHandler, true);
    window.removeEventListener('deviceorientation', this.orientationHandler, true);
    this.orientationHandler = null;
    this.heading = null;
    this.active = false;
    EventBus.emit('compass:active', false);
  },

  /**
   * Get current heading
   */
  getHeading() {
    return this.heading;
  },
};
