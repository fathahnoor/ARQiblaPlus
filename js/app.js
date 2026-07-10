/**
 * ARQiblaPlus - Main App Controller
 * Mode switching, state management, app initialization
 */

const AppState = {
  mode: 'map',
  userLocation: null,
  deviceHeading: null,
  qiblaBearing: null,
  mosques: [],
  mosqueMarkersVisible: true,
  arSceneReady: false,
  compassActive: false,
};

const App = {
  /**
   * Initialize the application
   */
  async init() {
    this._checkFeatureSupport();
    this._bindGlobalEvents();
    this._bindEventBus();

    // Start geolocation
    GeolocationService.start();

    // Wait for first location fix, then init map
    this._waitForLocation();
  },

  /**
   * Check browser feature support
   */
  _checkFeatureSupport() {
    const support = {
      geolocation: 'geolocation' in navigator,
      camera: 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices,
      deviceOrientation: 'DeviceOrientationEvent' in window,
      webgl: (() => {
        try {
          return !!document.createElement('canvas').getContext('webgl');
        } catch (e) {
          return false;
        }
      })(),
      iosPermission:
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function',
    };

    // Show iOS notice
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      const notice = document.getElementById('ios-notice');
      if (notice) notice.style.display = 'block';
    }

    // Check Firefox
    const isFirefox = /Firefox/i.test(navigator.userAgent);
    if (isFirefox) {
      const overlay = document.getElementById('unsupported-overlay');
      if (overlay) {
        overlay.style.display = 'flex';
        overlay.querySelector('#unsupported-message').textContent =
          'Browser Anda (Firefox) tidak mendukung fitur AR. Gunakan Chrome di Android untuk pengalaman terbaik.';
      }
    }

    if (!support.webgl) {
      const overlay = document.getElementById('unsupported-overlay');
      if (overlay) {
        overlay.style.display = 'flex';
        overlay.querySelector('#unsupported-message').textContent =
          'Browser Anda tidak mendukung WebGL yang diperlukan untuk AR. Gunakan browser modern.';
      }
    }
  },

  /**
   * Wait for first location fix.
   * Falls back to a default location after 20 seconds if GPS is unavailable.
   */
  _waitForLocation() {
    let locationTimeout = null;
    let unsubscribe = null;
    let errorUnsubscribe = null;
    let resolved = false;

    const DEFAULT_LAT = -6.2088;
    const DEFAULT_LON = 106.8456;

    const cleanup = () => {
      clearTimeout(locationTimeout);
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      if (errorUnsubscribe) { errorUnsubscribe(); errorUnsubscribe = null; }
    };

    const initMap = (lat, lon, isFallback) => {
      if (resolved) return;
      resolved = true;

      MapMode.init(lat, lon);
      AppState.userLocation = { latitude: lat, longitude: lon, accuracy: isFallback ? 99999 : null };
      AppState.qiblaBearing = calculateQibla(lat, lon);

      if (isFallback) {
        this._showToast('GPS tidak tersedia. Gunakan lokasi default (Jakarta).');

        // Only update status badge if not already set by the permission-denied handler
        const gpsBadge = document.getElementById('gps-status');
        if (gpsBadge && !gpsBadge.textContent.includes('Izin')) {
          gpsBadge.textContent = '⚠ GPS tidak tersedia';
          gpsBadge.className = 'status-badge status-warn';
        }

        const listEl = document.getElementById('mosque-list');
        if (listEl) {
          listEl.innerHTML =
            '<div class="mosque-empty">GPS tidak terdeteksi. Aktifkan GPS dan muat ulang halaman.</div>';
        }
      } else {
        // Fetch mosques with real location
        MosqueService.fetchMosques(lat, lon, MosqueService.radius);
      }
    };

    // Fallback timeout: if no GPS after 20 seconds, initialize with default location
    locationTimeout = setTimeout(() => {
      cleanup();
      initMap(DEFAULT_LAT, DEFAULT_LON, true);
    }, 20000);

    // Listen for location updates
    unsubscribe = EventBus.on('location:update', (pos) => {
      if (!resolved) {
        cleanup();
        initMap(pos.latitude, pos.longitude, false);
      }
    });

    // Also listen for permission denied to short-circuit the timeout
    errorUnsubscribe = EventBus.on('location:error', (error) => {
      if (error.code === 1 && !resolved) {
        // Permission denied: fall back immediately
        cleanup();
        initMap(DEFAULT_LAT, DEFAULT_LON, true);
      }
    });

    // Kick off a quick poll in case watchPosition already cached something
    setTimeout(() => {
      if (!resolved) {
        const pos = GeolocationService.getLastPosition();
        if (pos) {
          cleanup();
          initMap(pos.latitude, pos.longitude, false);
        }
      }
    }, 500);
  },

  /**
   * Bind event bus listeners
   */
  _bindEventBus() {
    EventBus.on('location:update', (pos) => {
      AppState.userLocation = pos;
      if (pos) {
        AppState.qiblaBearing = calculateQibla(pos.latitude, pos.longitude);
      }
      this._updateStatusBar(pos);
    });

    EventBus.on('location:significant', (pos) => {
      MosqueService.fetchMosques(pos.latitude, pos.longitude, MosqueService.radius);
    });

    EventBus.on('location:low-accuracy', (accuracy) => {
      const gpsBadge = document.getElementById('gps-status');
      if (gpsBadge) {
        gpsBadge.textContent = '⚠ Akurasi rendah';
        gpsBadge.className = 'status-badge status-warn';
      }
    });

    EventBus.on('location:error', (error) => {
      const gpsBadge = document.getElementById('gps-status');
      if (gpsBadge) {
        if (error.code === 1) {
          gpsBadge.textContent = '⛔ Izin lokasi ditolak';
          gpsBadge.className = 'status-badge status-error';
          this._showModal('location-permission');
        } else {
          gpsBadge.textContent = '⚠ GPS error';
          gpsBadge.className = 'status-badge status-warn';
        }
      }
    });

    EventBus.on('compass:heading', (data) => {
      AppState.deviceHeading = data.heading;
    });

    EventBus.on('compass:denied', () => {
      const toast = document.getElementById('toast');
      if (toast) {
        this._showToast('Kompas dinonaktifkan. Arah kiblat mungkin tidak akurat.');
      }
    });

    EventBus.on('mosques:loaded', (mosques) => {
      AppState.mosques = mosques;
      if (mosques.length === 0) {
        this._showToast('Tidak ada masjid ditemukan dalam radius ini. Coba perbesar radius.');
      }

      // Update mosque count badge
      const badge = document.getElementById('mosque-count');
      if (badge) {
        badge.textContent = mosques.length + ' masjid';
      }
    });

    EventBus.on('mosques:loading', (loading) => {
      const badge = document.getElementById('mosque-count');
      if (badge && loading) {
        badge.textContent = 'Memuat...';
      }
    });

    EventBus.on('ar:ready', () => {
      AppState.arSceneReady = true;
    });

    EventBus.on('ar:error', (msg) => {
      this._showToast(msg);
      // Switch back to map mode if AR fails
      setTimeout(() => this.switchMode('map'), 1500);
    });
  },

  /**
   * Bind global UI events
   */
  _bindGlobalEvents() {
    // AR Mode button
    const arBtn = document.getElementById('btn-ar-mode');
    if (arBtn) {
      arBtn.addEventListener('click', () => this.switchMode('ar'));
    }

    // Map Mode button (back from AR)
    const mapBtn = document.getElementById('btn-map-mode');
    if (mapBtn) {
      mapBtn.addEventListener('click', () => this.switchMode('map'));
    }

    // Toggle mosque markers in AR
    const toggleBtn = document.getElementById('btn-toggle-mosques');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const visible = ARMode.toggleMosques();
        AppState.mosqueMarkersVisible = visible;
        toggleBtn.textContent = visible ? '👁' : '👁‍🗨';
      });
    }

    // Enable Compass button
    const compassBtn = document.getElementById('btn-enable-compass');
    if (compassBtn) {
      compassBtn.addEventListener('click', async () => {
        compassBtn.disabled = true;
        compassBtn.textContent = 'Memulai...';
        const ok = await CompassService.requestAndStart();
        if (ok) {
          compassBtn.textContent = '🧭 Aktif';
          compassBtn.className = 'btn btn-sm btn-compass active';
          AppState.compassActive = true;
        } else {
          compassBtn.textContent = '🧭 Ditolak';
          compassBtn.className = 'btn btn-sm btn-compass error';
          compassBtn.disabled = false;
        }
      });
    }

    // Close modals
    document.querySelectorAll('.modal-close').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.closest('.modal-overlay').style.display = 'none';
      });
    });

    // Close unsupported overlay
    const unsupportedClose = document.getElementById('unsupported-close');
    if (unsupportedClose) {
      unsupportedClose.addEventListener('click', () => {
        document.getElementById('unsupported-overlay').style.display = 'none';
      });
    }

    // Resize handler
    window.addEventListener('resize', () => {
      if (AppState.mode === 'map') {
        MapMode.resume();
      }
    });

    // Orientation change
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        if (AppState.mode === 'map') {
          MapMode.resume();
        }
      }, 300);
    });
  },

  /**
   * Switch between map and AR modes
   */
  async switchMode(targetMode) {
    if (targetMode === AppState.mode) return;

    if (targetMode === 'ar') {
      // Check camera permission
      if (!('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices)) {
        this._showToast('Browser Anda tidak mendukung kamera');
        return;
      }

      // Switch UI
      document.getElementById('map-container').classList.remove('active');
      document.getElementById('ar-container').classList.add('active');
      document.getElementById('map-toolbar').classList.remove('active');
      document.getElementById('ar-toolbar').classList.add('active');
      document.getElementById('status-bar').classList.add('ar-status');

      MapMode.pause();

      // Init AR if not already ready
      await ARMode.init();

      AppState.mode = 'ar';
      EventBus.emit('mode:change', 'ar');
    } else {
      // Switch to map
      ARMode.destroy();
      document.getElementById('ar-container').classList.remove('active');
      document.getElementById('map-container').classList.add('active');
      document.getElementById('ar-toolbar').classList.remove('active');
      document.getElementById('map-toolbar').classList.add('active');
      document.getElementById('status-bar').classList.remove('ar-status');

      MapMode.resume();

      AppState.mode = 'map';
      EventBus.emit('mode:change', 'map');
    }
  },

  /**
   * Update status bar with GPS info
   */
  _updateStatusBar(pos) {
    const gpsBadge = document.getElementById('gps-status');
    if (!gpsBadge || !pos) return;

    if (pos.accuracy <= 50) {
      gpsBadge.textContent = '● GPS: ' + Math.round(pos.accuracy) + 'm';
      gpsBadge.className = 'status-badge status-ok';
    } else {
      gpsBadge.textContent = '⚠ GPS: ' + Math.round(pos.accuracy) + 'm';
      gpsBadge.className = 'status-badge status-warn';
    }
  },

  /**
   * Show a toast message
   */
  _showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('show');

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  },

  /**
   * Show a modal
   */
  _showModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.style.display = 'flex';
    }
  },
};

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
