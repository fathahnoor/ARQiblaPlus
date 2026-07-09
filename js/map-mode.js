/**
 * ARQiblaPlus - Map Mode
 * Leaflet map with user marker, mosque markers, Qibla line, and mosque list
 */

const MapMode = {
  map: null,
  userMarker: null,
  accuracyCircle: null,
  qiblaLine: null,
  qiblaEndpoint: null,
  mosqueMarkers: [],
  mosqueLayerGroup: null,
  showQiblaLine: true,

  /**
   * Initialize Leaflet map
   */
  init(latitude, longitude) {
    // Create map instance
    this.map = L.map('map-container', {
      preferCanvas: true,
      zoomControl: false,
      attributionControl: true,
    }).setView([latitude, longitude], 15);

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(this.map);

    // Add zoom control to bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Layer group for mosque markers
    this.mosqueLayerGroup = L.layerGroup().addTo(this.map);

    // Add user marker
    this._createUserMarker(latitude, longitude);

    // Invalidate size after container becomes visible
    setTimeout(() => this.map.invalidateSize(), 100);

    // Listen for location updates
    EventBus.on('location:update', (pos) => this._onLocationUpdate(pos));
    EventBus.on('mosques:loaded', (mosques) => this._onMosquesLoaded(mosques));
    EventBus.on('compass:heading', (data) => this._onCompassUpdate(data));

    this._bindUIControls();
  },

  /**
   * Create user location marker with accuracy circle
   */
  _createUserMarker(lat, lon) {
    const userIcon = L.divIcon({
      className: 'user-marker-icon',
      html: `<div class="user-dot"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    this.userMarker = L.marker([lat, lon], { icon: userIcon, zIndexOffset: 1000 }).addTo(this.map);

    this.accuracyCircle = L.circle([lat, lon], {
      radius: 0,
      color: '#2196F3',
      fillColor: '#2196F3',
      fillOpacity: 0.1,
      weight: 1,
    }).addTo(this.map);
  },

  /**
   * Handle location update events
   */
  _onLocationUpdate(position) {
    if (!this.map) return;

    const { latitude, longitude, accuracy } = position;
    const latlng = [latitude, longitude];

    // Update user marker
    if (this.userMarker) {
      this.userMarker.setLatLng(latlng);
    }

    // Update accuracy circle
    if (this.accuracyCircle) {
      this.accuracyCircle.setLatLng(latlng);
      this.accuracyCircle.setRadius(accuracy || 5);
    }

    // Update Qibla line
    if (this.showQiblaLine) {
      this._updateQiblaLine(latitude, longitude);
    }

    // Update distances in mosque list
    this._updateMosqueList();
  },

  /**
   * Handle mosque data loaded
   */
  _onMosquesLoaded(mosques) {
    this._renderMosqueMarkers(mosques);
    this._renderMosqueList(mosques);

    // Update Qibla line if we have a position
    const pos = GeolocationService.getLastPosition();
    if (pos && this.showQiblaLine) {
      this._updateQiblaLine(pos.latitude, pos.longitude);
    }
  },

  /**
   * Handle compass heading update
   * Rotates the compass dial to match device heading.
   * The Qibla marker (Kaaba icon) always points toward the Qibla direction.
   */
  _onCompassUpdate(data) {
    if (!AppState.qiblaBearing) return;

    const dial = document.getElementById('compass-dial');
    const qiblaMarker = document.getElementById('compass-qibla');
    const label = document.getElementById('compass-label');

    // Rotate dial so North stays at correct world position
    // When deviceHeading=0 (facing North), dial doesn't rotate
    // When deviceHeading=90 (facing East), dial rotates -90 so N appears on the left
    if (dial) {
      dial.style.transform = `rotate(${-data.heading}deg)`;
    }

    // Position the Qibla marker on the dial at the qibla bearing angle
    if (qiblaMarker) {
      const angleRad = (AppState.qiblaBearing * Math.PI) / 180;
      const radius = 30; // distance from center to marker (inside the 80px dial)
      const x = Math.sin(angleRad) * radius;
      const y = -Math.cos(angleRad) * radius;
      qiblaMarker.style.top = `${40 + y - 7}px`;
      qiblaMarker.style.left = `${40 + x - 7}px`;
      qiblaMarker.style.transform = 'none';
      qiblaMarker.style.display = 'block';
    }

    // Show distance info
    if (label) {
      const relAngle = ((AppState.qiblaBearing - data.heading) % 360 + 360) % 360;
      const pos = GeolocationService.getLastPosition();
      if (pos) {
        const dist = haversine(pos.latitude, pos.longitude, KAABA.latitude, KAABA.longitude);
        const distKm = Math.round(dist / 1000);
        if (relAngle < 15 || relAngle > 345) {
          label.textContent = 'Kiblat ✓';
          label.className = 'compass-label qibla-aligned';
        } else {
          label.textContent = `${AppState.qiblaBearing.toFixed(0)}° • ${distKm} km`;
          label.className = 'compass-label';
        }
      }
    }
  },

  /**
   * Draw Qibla line from user position
   */
  _updateQiblaLine(userLat, userLon) {
    if (!this.map) return;

    const qiblaBearing = calculateQibla(userLat, userLon);
    AppState.qiblaBearing = qiblaBearing;

    // Calculate endpoint at ~500m visual distance
    const endPoint = destinationPoint(userLat, userLon, qiblaBearing, 500);

    const lineCoords = [
      [userLat, userLon],
      [endPoint.latitude, endPoint.longitude],
    ];

    if (this.qiblaLine) {
      this.qiblaLine.setLatLngs(lineCoords);
    } else {
      this.qiblaLine = L.polyline(lineCoords, {
        color: '#FFD700',
        weight: 3,
        dashArray: '10, 10',
        opacity: 0.8,
      }).addTo(this.map);
    }

    // Qibla endpoint marker (Kaaba icon at the end)
    if (this.qiblaEndpoint) {
      this.qiblaEndpoint.setLatLng([endPoint.latitude, endPoint.longitude]);
    } else {
      const kaabaIcon = L.divIcon({
        className: 'kaaba-marker-icon',
        html: `<div class="kaaba-dot">🕋</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      this.qiblaEndpoint = L.marker([endPoint.latitude, endPoint.longitude], {
        icon: kaabaIcon,
        zIndexOffset: 999,
      }).addTo(this.map);
    }
  },

  /**
   * Render mosque markers on map
   */
  _renderMosqueMarkers(mosques) {
    if (!this.mosqueLayerGroup) return;

    // Clear existing markers
    this.mosqueLayerGroup.clearLayers();
    this.mosqueMarkers = [];

    const mosqueIcon = L.divIcon({
      className: 'mosque-marker-icon',
      html: `<div class="mosque-dot">🕌</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    mosques.forEach((mosque) => {
      const popupContent = `
        <div class="mosque-popup">
          <strong>${mosque.name}</strong><br>
          ${formatDistance(mosque.distance)}
        </div>
      `;

      const marker = L.marker([mosque.latitude, mosque.longitude], {
        icon: mosqueIcon,
      })
        .bindPopup(popupContent)
        .addTo(this.mosqueLayerGroup);

      marker._mosqueData = mosque;
      this.mosqueMarkers.push(marker);
    });
  },

  /**
   * Render sorted mosque list in the panel
   */
  _renderMosqueList(mosques) {
    const listEl = document.getElementById('mosque-list');
    if (!listEl) return;

    if (mosques.length === 0) {
      listEl.innerHTML =
        '<div class="mosque-empty">Tidak ada masjid dalam radius ini. Coba perbesar radius.</div>';
      return;
    }

    listEl.innerHTML = mosques
      .map(
        (m, i) => `
      <div class="mosque-item" data-index="${i}">
        <span class="mosque-item-icon">🕌</span>
        <span class="mosque-item-name">${m.name}</span>
        <span class="mosque-item-distance">${formatDistance(m.distance)}</span>
      </div>
    `
      )
      .join('');

    // Bind click events
    listEl.querySelectorAll('.mosque-item').forEach((item) => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index);
        const mosque = mosques[idx];
        if (mosque && this.map) {
          this.map.flyTo([mosque.latitude, mosque.longitude], 17);
          // Open popup on corresponding marker
          this.mosqueMarkers[idx]?.openPopup();
        }
      });
    });
  },

  /**
   * Update mosque list distances only (when user moves)
   */
  _updateMosqueList() {
    const listEl = document.getElementById('mosque-list');
    if (!listEl) return;

    const items = listEl.querySelectorAll('.mosque-item');
    const mosques = MosqueService.mosques;
    if (items.length !== mosques.length) return;

    items.forEach((item, i) => {
      const distEl = item.querySelector('.mosque-item-distance');
      if (distEl) {
        distEl.textContent = formatDistance(mosques[i].distance);
      }
    });
  },

  /**
   * Bind UI controls in Map Mode
   */
  _bindUIControls() {
    // Locate Me button
    const locateBtn = document.getElementById('btn-locate');
    if (locateBtn) {
      locateBtn.addEventListener('click', () => {
        if (this.map) {
          this.map.locate({ setView: true, maxZoom: 17 });
        }
      });
    }

    // Radius selector
    const radiusSelect = document.getElementById('radius-select');
    if (radiusSelect) {
      radiusSelect.addEventListener('change', () => {
        const radius = parseInt(radiusSelect.value);
        const pos = GeolocationService.getLastPosition();
        if (pos) {
          MosqueService.fetchMosques(pos.latitude, pos.longitude, radius);
        }
      });
    }

    // Toggle Qibla line
    const qiblaToggle = document.getElementById('btn-toggle-qibla');
    if (qiblaToggle) {
      qiblaToggle.addEventListener('click', () => {
        this.showQiblaLine = !this.showQiblaLine;
        if (this.qiblaLine) {
          this.qiblaLine.setStyle({ opacity: this.showQiblaLine ? 0.8 : 0 });
        }
        if (this.qiblaEndpoint) {
          this.qiblaEndpoint.setOpacity(this.showQiblaLine ? 1 : 0);
        }
        qiblaToggle.textContent = this.showQiblaLine ? 'Sembunyikan Kiblat' : 'Tampilkan Kiblat';
      });
    }
  },

  /**
   * Resume map mode (when switching from AR)
   */
  resume() {
    if (this.map) {
      setTimeout(() => this.map.invalidateSize(), 200);
    }
  },

  /**
   * Pause map mode (when switching to AR)
   */
  pause() {
    // Nothing needed - Leaflet handles itself
  },
};
