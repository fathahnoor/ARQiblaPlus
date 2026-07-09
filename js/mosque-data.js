/**
 * ARQiblaPlus — Mosque Data Service
 * Queries Overpass API for nearby mosques and manages caching
 */

const MosqueService = {
  mosques: [],
  radius: 5000, // default 5km
  loading: false,
  lastQueryParams: null,
  retryCount: 0,

  OVERPASS_ENDPOINTS: [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ],

  /**
   * Fetch mosques near a given location
   */
  async fetchMosques(latitude, longitude, radius) {
    if (this.loading) return;
    this.loading = true;
    this.radius = radius;
    EventBus.emit('mosques:loading', true);

    const query = `
[out:json][timeout:25];
(
  node["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${latitude},${longitude});
  way["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${latitude},${longitude});
);
out center;
`;

    let data = null;
    let endpointIndex = 0;

    while (data === null && endpointIndex < this.OVERPASS_ENDPOINTS.length) {
      try {
        const response = await fetch(this.OVERPASS_ENDPOINTS[endpointIndex], {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query.trim()),
        });

        if (!response.ok) {
          if (response.status === 429) {
            // Rate limited — exponential backoff
            const delay = Math.min(1000 * Math.pow(2, this.retryCount), 16000);
            this.retryCount++;
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw new Error(`HTTP ${response.status}`);
        }

        data = await response.json();
        this.retryCount = 0;
      } catch (err) {
        console.warn(`Overpass endpoint ${endpointIndex} failed:`, err.message);
        endpointIndex++;
      }
    }

    this.loading = false;
    EventBus.emit('mosques:loading', false);

    if (!data || !data.elements) {
      // Try cache
      const cached = this._loadFromCache(latitude, longitude, radius);
      if (cached && cached.length > 0) {
        this.mosques = cached;
        EventBus.emit('mosques:loaded', this.mosques);
        return;
      }
      EventBus.emit('mosques:error', 'Gagal memuat data masjid');
      return;
    }

    // Parse elements
    this.mosques = data.elements.map((el) => {
      const lat = el.lat || el.center?.lat;
      const lon = el.lon || el.center?.lon;
      const distance = haversine(latitude, longitude, lat, lon);
      return {
        id: el.id,
        type: el.type,
        name: el.tags?.name || 'Masjid (Tanpa Nama)',
        latitude: lat,
        longitude: lon,
        distance: distance,
        tags: el.tags || {},
      };
    });

    // Sort by distance
    this.mosques.sort((a, b) => a.distance - b.distance);

    // Cache result
    this._saveToCache(latitude, longitude, radius, this.mosques);

    // Mark query position
    GeolocationService.markQueryPosition();

    EventBus.emit('mosques:loaded', this.mosques);
  },

  /**
   * Recalculate distances based on new user position
   */
  recalculateDistances(latitude, longitude) {
    this.mosques.forEach((m) => {
      m.distance = haversine(latitude, longitude, m.latitude, m.longitude);
    });
    this.mosques.sort((a, b) => a.distance - b.distance);
    EventBus.emit('mosques:loaded', this.mosques);
  },

  /**
   * Get nearest N mosques (for AR performance)
   */
  getNearest(count) {
    return this.mosques.slice(0, count);
  },

  /**
   * Cache key for localStorage
   */
  _cacheKey(lat, lon, radius) {
    const latRounded = Math.round(lat * 100) / 100;
    const lonRounded = Math.round(lon * 100) / 100;
    return `mosques_${latRounded}_${lonRounded}_${radius}`;
  },

  /**
   * Save mosque data to localStorage cache with TTL
   */
  _saveToCache(lat, lon, radius, data) {
    try {
      const key = this._cacheKey(lat, lon, radius);
      const cache = {
        data: data,
        timestamp: Date.now(),
        ttl: 24 * 60 * 60 * 1000, // 24 hours
      };
      localStorage.setItem(key, JSON.stringify(cache));
    } catch (e) {
      // localStorage full or unavailable — ignore
    }
  },

  /**
   * Load mosque data from localStorage cache
   */
  _loadFromCache(lat, lon, radius) {
    try {
      const key = this._cacheKey(lat, lon, radius);
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp > parsed.ttl) {
        localStorage.removeItem(key);
        return null;
      }
      return parsed.data;
    } catch (e) {
      return null;
    }
  },
};
