/**
 * ARQiblaPlus - AR Mode
 * AR.js scene initialization, AR markers for Qibla and mosques, toggle, HUD
 */

const ARMode = {
  scene: null,
  camera: null,
  qiblaMarker: null,
  mosqueMarkers: [],
  mosqueVisible: true,
  sceneReady: false,
  needsUpdate: false,

  QIBLA_DISTANCE: 1000, // fixed visual distance for Qibla marker (meters)
  MAX_MOSQUE_MARKERS: 30,
  _gpsUpdateHandler: null,
  _gpsUpdateTimer: null,

  /**
   * Initialize AR scene.
   * Returns a promise that resolves to true when the scene is ready,
   * or false if initialization fails.
   */
  async init() {
    // Reset state for re-entry
    if (this.sceneReady) {
      this.destroy();
    }

    // Clear any pending debounced update from a previous session
    clearTimeout(this._gpsUpdateTimer);
    this._gpsUpdateTimer = null;

    const sceneEl = document.getElementById('ar-scene');

    if (!sceneEl) {
      console.error('AR scene element not found');
      EventBus.emit('ar:error', 'Elemen AR tidak ditemukan');
      return false;
    }

    // Check camera permission
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      // Stop the test stream; AR.js will request its own
      stream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      console.warn('Camera permission denied:', err);
      EventBus.emit('ar:error', 'Izin kamera diperlukan untuk mode AR');
      return false;
    }

    // Show camera loading indicator
    const loadingEl = document.getElementById('ar-loading');
    if (loadingEl) loadingEl.style.display = 'flex';

    // Dynamically add arjs attribute to start AR.js (prevents camera from starting on page load)
    sceneEl.setAttribute('arjs', 'sourceType: webcam; videoTexture: true; debugUIEnabled: false');

    // Re-initialize gps-new-camera component since AR.js system just became available
    const cameraEl = sceneEl.querySelector('[gps-new-camera]');
    if (cameraEl) {
      cameraEl.removeAttribute('gps-new-camera');
      cameraEl.setAttribute('gps-new-camera', 'gpsMinDistance: 2; gpsMinAccuracy: 50');
    }

    this.scene = sceneEl;
    this.scene.setAttribute('visible', 'true');

    // Register custom A-Frame components before creating entities
    this._registerComponents();

    // Listen for GPS camera position updates
    this._gpsUpdateHandler = (e) => {
      this._onGpsUpdate(e.detail);
    };
    sceneEl.addEventListener('gps-camera-update-position', this._gpsUpdateHandler);

    return new Promise((resolve) => {
      let resolved = false;

      const onSceneReady = () => {
        if (resolved) return;
        resolved = true;
        this.sceneReady = true;
        if (loadingEl) loadingEl.style.display = 'none';
        EventBus.emit('ar:ready');
        this._setupScene();
        resolve(true);
      };

      if (sceneEl.hasLoaded) {
        onSceneReady();
      } else {
        sceneEl.addEventListener('loaded', onSceneReady, { once: true });
      }

      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (loadingEl) loadingEl.style.display = 'none';
          EventBus.emit('ar:error', 'Gagal memuat AR. Coba lagi.');
          resolve(false);
        }
      }, 10000);
    });
  },

  /**
   * Register custom A-Frame components
   */
  _registerComponents() {
    // Fixed scale component (keeps Qibla marker size constant)
    if (!AFRAME.components['fixed-scale']) {
      AFRAME.registerComponent('fixed-scale', {
        schema: { scale: { default: 15 } },
        tick: function () {
          const s = this.data.scale;
          this.el.object3D.scale.set(s, s, s);
        },
      });
    }

    // Distance-based scale component for mosque markers
    if (!AFRAME.components['distance-scale']) {
      AFRAME.registerComponent('distance-scale', {
        schema: {
          minScale: { default: 3 },
          maxScale: { default: 40 },
          minDistance: { default: 50 },
          maxDistance: { default: 5000 },
        },
        tick: function () {
          const camera = document.querySelector('[gps-new-camera]');
          if (!camera) return;

          const camPos = camera.object3D.position;
          const entityPos = this.el.object3D.position;
          const distance = camPos.distanceTo(entityPos);

          const ratio = Math.max(
            0,
            Math.min(1, (this.data.maxDistance - distance) / (this.data.maxDistance - this.data.minDistance))
          );
          const scale = this.data.minScale + ratio * (this.data.maxScale - this.data.minScale);

          this.el.object3D.scale.set(scale, scale, scale);
        },
      });
    }
  },

  /**
   * Setup AR scene entities after scene is loaded
   */
  _setupScene() {
    const cameraEl = this.scene.querySelector('[gps-new-camera]');
    if (cameraEl) {
      this.camera = cameraEl;
    }

    this._createQiblaMarker();
    this._updateMosqueMarkers();
    this._createHUD();

    // Listen for location and mosque updates
    this._unsubLocation = EventBus.on('location:update', () => this._onLocationUpdate());
    this._unsubMosques = EventBus.on('mosques:loaded', () => this._updateMosqueMarkers());
    this._unsubSignificant = EventBus.on('location:significant', () => this._updateMosqueMarkers());
  },

  /**
   * Create AR Qibla marker (fixed size, placed at computed point)
   */
  _createQiblaMarker() {
    if (!this.scene) return;

    const pos = GeolocationService.getLastPosition();
    if (!pos) return;

    const qiblaBearing = calculateQibla(pos.latitude, pos.longitude);
    const dummyPoint = destinationPoint(pos.latitude, pos.longitude, qiblaBearing, this.QIBLA_DISTANCE);

    const entity = document.createElement('a-entity');
    entity.setAttribute('id', 'qibla-marker');
    entity.setAttribute('gps-new-entity-place', {
      latitude: dummyPoint.latitude,
      longitude: dummyPoint.longitude,
    });
    // fixed-scale is added after gps-new-entity-place so its tick runs later
    // and keeps the marker size constant regardless of distance.
    entity.setAttribute('fixed-scale', { scale: 40 });
    entity.setAttribute('look-at', '[gps-new-camera]');

    // Gold cylinder as Kaaba marker
    const cylinder = document.createElement('a-cylinder');
    cylinder.setAttribute('color', '#FFD700');
    cylinder.setAttribute('radius', '2');
    cylinder.setAttribute('height', '5');
    cylinder.setAttribute('position', '0 2.5 0');
    entity.appendChild(cylinder);

    // Text label
    const label = document.createElement('a-text');
    label.setAttribute('value', 'Kiblat');
    label.setAttribute('align', 'center');
    label.setAttribute('position', '0 8 0');
    label.setAttribute('scale', '20 20 20');
    label.setAttribute('color', '#FFD700');
    entity.appendChild(label);

    this.scene.appendChild(entity);
    this.qiblaMarker = entity;
  },

  /**
   * Update mosque markers in AR scene
   */
  _updateMosqueMarkers() {
    if (!this.scene || !this.sceneReady) {
      this.needsUpdate = true;
      return;
    }

    // Remove old mosque markers
    this._clearMosqueMarkers();

    // Get nearest mosques (limit for performance)
    const mosques = MosqueService.getNearest(this.MAX_MOSQUE_MARKERS);

    mosques.forEach((mosque) => {
      const entity = this._createMosqueEntity(mosque);
      this.scene.appendChild(entity);
      this.mosqueMarkers.push(entity);
    });
  },

  /**
   * Create a single AR mosque marker entity
   */
  _createMosqueEntity(mosque) {
    const entity = document.createElement('a-entity');
    entity.setAttribute('class', 'mosque-marker');
    entity.setAttribute('gps-new-entity-place', {
      latitude: mosque.latitude,
      longitude: mosque.longitude,
    });
    entity.setAttribute('distance-scale', '');
    entity.setAttribute('visible', this.mosqueVisible);

    // Green box marker
    const box = document.createElement('a-box');
    box.setAttribute('color', '#2E7D32');
    box.setAttribute('depth', '1');
    box.setAttribute('height', '3');
    box.setAttribute('width', '1');
    box.setAttribute('position', '0 3 0');
    entity.appendChild(box);

    // Name + distance label
    const label = document.createElement('a-text');
    label.setAttribute('value', mosque.name + '\n' + formatDistance(mosque.distance));
    label.setAttribute('align', 'center');
    label.setAttribute('position', '0 7 0');
    label.setAttribute('look-at', '[gps-new-camera]');
    label.setAttribute('scale', '15 15 15');
    label.setAttribute('color', '#FFFFFF');
    label.setAttribute('width', '20');
    entity.appendChild(label);

    // Store reference for updating
    entity._mosqueData = mosque;

    return entity;
  },

  /**
   * Clear all mosque marker entities from scene
   */
  _clearMosqueMarkers() {
    this.mosqueMarkers.forEach((m) => {
      if (m.parentNode) m.parentNode.removeChild(m);
    });
    this.mosqueMarkers = [];
  },

  /**
   * Create HUD overlay for Qibla direction
   */
  _createHUD() {
    const container = document.getElementById('ar-qibla-hud');
    if (!container) return;

    container.innerHTML = `
      <div class="ar-compass-dial" id="ar-compass-dial">
        <div class="ar-compass-qibla" id="ar-compass-qibla">⬆</div>
      </div>
      <div class="ar-compass-label" id="ar-compass-label">Kompas belum siap</div>
    `;

    this._unsubCompass = EventBus.on('compass:heading', (data) => {
      this._updateHUD(data.heading);
    });
  },

  /**
   * Update AR Qibla HUD overlay
   * Arrow always points toward Qibla direction
   */
  _updateHUD(deviceHeading) {
    const qiblaBearing = AppState.qiblaBearing;
    if (!qiblaBearing) return;

    const dial = document.getElementById('ar-compass-dial');
    const arrow = document.getElementById('ar-compass-qibla');
    const label = document.getElementById('ar-compass-label');

    const relAngle = ((qiblaBearing - deviceHeading) % 360 + 360) % 360;

    // Arrow points toward qibla relative to current heading
    if (arrow) {
      arrow.style.transform = `rotate(${relAngle}deg)`;
    }

    const pos = GeolocationService.getLastPosition();
    if (pos && label) {
      const dist = haversine(pos.latitude, pos.longitude, KAABA.latitude, KAABA.longitude);
      const distKm = Math.round(dist / 1000);
      if (relAngle < 15 || relAngle > 345) {
        label.textContent = 'Kiblat ✓';
        label.className = 'ar-compass-label qibla-aligned';
      } else {
        label.textContent = `${qiblaBearing.toFixed(0)}° • ${distKm} km`;
        label.className = 'ar-compass-label';
      }
    }
  },

  /**
   * Handle GPS camera position update
   */
  _onGpsUpdate(detail) {
    if (!this.qiblaMarker) return;

    const pos = GeolocationService.getLastPosition();
    if (!pos) return;

    // Debounce updates to avoid jitter from rapid/noisy GPS events.
    // The latest event in a 500ms window is applied.
    clearTimeout(this._gpsUpdateTimer);
    this._gpsUpdateTimer = setTimeout(() => {
      this._applyGpsUpdate(pos);
    }, 500);
  },

  /**
   * Apply the actual GPS update (recalculate Qibla dummy point and refresh labels)
   */
  _applyGpsUpdate(pos) {
    if (!this.qiblaMarker) return;

    AppState.qiblaBearing = calculateQibla(pos.latitude, pos.longitude);
    const dummyPoint = destinationPoint(
      pos.latitude,
      pos.longitude,
      AppState.qiblaBearing,
      this.QIBLA_DISTANCE
    );

    // Update Qibla marker position
    this.qiblaMarker.setAttribute('gps-new-entity-place', {
      latitude: dummyPoint.latitude,
      longitude: dummyPoint.longitude,
    });

    // Update mosque labels
    this.mosqueMarkers.forEach((entity) => {
      if (!entity._mosqueData) return;
      const mosque = entity._mosqueData;
      const newDist = haversine(pos.latitude, pos.longitude, mosque.latitude, mosque.longitude);
      const label = entity.querySelector('a-text');
      if (label) {
        label.setAttribute('value', mosque.name + '\n' + formatDistance(newDist));
      }
    });
  },

  /**
   * Handle location update while in AR mode
   */
  _onLocationUpdate() {
    if (this.needsUpdate) {
      this._updateMosqueMarkers();
      this.needsUpdate = false;
    }
  },

  /**
   * Toggle mosque markers visibility
   * Returns the new visibility state
   */
  toggleMosques() {
    this.mosqueVisible = !this.mosqueVisible;
    this.mosqueMarkers.forEach((m) => m.setAttribute('visible', this.mosqueVisible));

    // Qibla marker always visible
    if (this.qiblaMarker) {
      this.qiblaMarker.setAttribute('visible', true);
    }

    return this.mosqueVisible;
  },

  /**
   * Cleanup AR mode resources
   */
  destroy() {
    // Remove event listeners
    if (this._unsubLocation) this._unsubLocation();
    if (this._unsubMosques) this._unsubMosques();
    if (this._unsubCompass) this._unsubCompass();
    if (this._unsubSignificant) this._unsubSignificant();

    this._unsubLocation = null;
    this._unsubMosques = null;
    this._unsubCompass = null;
    this._unsubSignificant = null;

    // Remove GPS camera update listener
    if (this.scene && this._gpsUpdateHandler) {
      this.scene.removeEventListener('gps-camera-update-position', this._gpsUpdateHandler);
      this._gpsUpdateHandler = null;
    }

    // Cancel pending debounced GPS update
    clearTimeout(this._gpsUpdateTimer);
    this._gpsUpdateTimer = null;

    // Clear markers
    this._clearMosqueMarkers();
    if (this.qiblaMarker && this.qiblaMarker.parentNode) {
      this.qiblaMarker.parentNode.removeChild(this.qiblaMarker);
    }
    this.qiblaMarker = null;

    // Hide scene & stop AR.js camera
    if (this.scene) {
      this.scene.setAttribute('visible', 'false');
      this.scene.removeAttribute('arjs');

      // Stop camera stream
      const video = document.querySelector('#ar-scene video, video');
      if (video && video.srcObject) {
        video.srcObject.getTracks().forEach((track) => track.stop());
        video.remove();
      }
    }

    // Clear HUD
    const hud = document.getElementById('ar-qibla-hud');
    if (hud) hud.innerHTML = '';

    this.sceneReady = false;
  },
};
