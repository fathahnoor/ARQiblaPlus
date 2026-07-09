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
   * Wait for first location fix
   */
  _waitForLocation() {
    const check = () => {
      const pos = GeolocationService.getLastPosition();
      if (pos) {
        // Initialize map with user's location
        MapMode.init(pos.latitude, pos.longitude);
        AppState.userLocation = pos;
        AppState.qiblaBearing = calculateQibla(pos.latitude, pos.longitude);
      } else {
        // Retry every second
        setTimeout(check, 1000);
      }
    };

    const unsub = EventBus.on('location:update', (pos) => {
      if (!AppState.userLocation) {
        unsub();
        MapMode.init(pos.latitude, pos.longitude);
        AppState.userLocation = pos;
        AppState.qiblaBearing = calculateQibla(pos.latitude, pos.longitude);

        // Fetch mosques
        MosqueService.fetchMosques(pos.latitude, pos.longitude, MosqueService.radius);
      }
    });

    // Also try to get immediately
    setTimeout(check, 500);
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
