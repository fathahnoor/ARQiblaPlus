# ARQiblaPlus — Design Document

> **Versi:** 1.0 | **Tanggal:** 2026-07-10 | **Penulis:** Fat'hah Noor Prawita  
> **Target:** Agentic AI (Freebuff) untuk generate web app mobile-browser  
> **Status:** Draft for Implementation

---

## 1. Overview Aplikasi

**ARQiblaPlus** adalah aplikasi web yang berjalan di browser handphone (PWA-ready) dengan dua mode utama: **Map Mode** dan **AR Mode**. Aplikasi membantu Muslim menemukan arah kiblat dan masjid terdekat menggunakan GPS, kompas digital, dan Augmented Reality berbasis lokasi.

### 1.1 Nama Aplikasi
- **ARQiblaPlus**

### 1.2 Platform Target
- Browser mobile (Chrome Android utama, Safari iOS dengan batasan)
- Tidak memerlukan instalasi (pure web, zero-install)
- Memerlukan HTTPS untuk akses Geolocation dan Camera API

### 1.3 Arsitektur High-Level
```
┌─────────────────────────────────────────────┐
│              Browser (Mobile)                │
│  ┌─────────────┐    ┌─────────────────────┐  │
│  │  Map Mode   │    │     AR Mode         │  │
│  │  (Leaflet)  │    │  (AR.js + A-Frame)  │  │
│  └──────┬──────┘    └─────────┬───────────┘  │
│         │                     │              │
│  ┌──────┴─────────────────────┴───────────┐  │
│  │          Core Services Layer           │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────┐  │  │
│  │  │Geolocation│  │Compass   │  │Qibla │  │  │
│  │  │  Service  │  │(DeviceOri│  │Calc  │  │  │
│  │  └──────────┘  └──────────┘  └──────┘  │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │     Mosque Data (Overpass API)   │  │  │
│  │  └──────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
│         │                                     │
│  ┌──────┴───────────────────────────────┐   │
│  │        External APIs (HTTPS)         │   │
│  │  OpenStreetMap Tiles + Overpass API   │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

---

## 2. Tech Stack

| Layer | Technology | Version | Alasan Pemilihan |
|-------|-----------|---------|-----------------|
| AR Framework | AR.js (Location-Based) | 3.4.7 | Markerless, GPS-based, open-source, berjalan di browser tanpa install |
| 3D Engine | A-Frame | 1.6.0 | Integrasi native dengan AR.js, deklaratif (HTML-based), ECS architecture |
| Map Library | Leaflet.js | 1.9.4 | Ringan, open-source, ekstensibel, mendukung OSM tiles |
| Map Tiles | OpenStreetMap | — | Gratis, tanpa API key, coverage global |
| Mosque Data | Overpass API | — | Query OpenStreetMap data secara real-time, gratis, filter `amenity=place_of_worship&religion=muslim` |
| Geolocation | W3C Geolocation API | — | Native browser API, tidak butuh library tambahan |
| Compass | DeviceOrientation API | — | Akses magnetometer/gyroscope via browser, `AbsoluteOrientationSensor` atau `deviceorientationabsolute` event |
| Qibla Calculation | Custom JS (Great Circle Bearing) | — | Formula sederhana berdasarkan spherical trigonometry, akurat untuk kebutuhan praktis |
| Frontend Framework | Vanilla JS (ES6+) | — | Minimal dependency, ukuran kecil, eksekusi cepat di mobile |
| CSS Framework | Custom CSS + CSS Variables | — | Kontrol penuh, tidak menambah bundle size |
| Hosting | Static hosting (GitHub Pages / Netlify / Vercel) | — | HTTPS gratis, CDN global, CI/CD opsional |
| Build Tool | Tidak wajib (opsional: Vite) | — | Bisa berjalan sebagai static files; Vite opsional untuk minifikasi |

---

## 3. Struktur File & Folder

```
ARQiblaPlus/
├── index.html                  # Entry point, load semua library & UI shell
├── css/
│   ├── style.css               # Global styles, layout, theming
│   ├── map-mode.css            # Style khusus Map Mode
│   └── ar-mode.css             # Style khusus AR Mode (overlay, toggle, HUD)
├── js/
│   ├── app.js                  # Main app controller, mode switching, init
│   ├── geolocation.js          # Wrapper Geolocation API, watch position
│   ├── compass.js              # DeviceOrientation handler, heading calculation
│   ├── qibla.js                # Qibla bearing calculation (Great Circle)
│   ├── mosque-data.js          # Overpass API query, caching, distance calc
│   ├── map-mode.js             # Leaflet map init, markers, Qibla line, sorting
│   ├── ar-mode.js              # AR.js scene init, entity management, AR Qibla
│   └── utils.js                # Haversine, bearing, debounce, formatting helpers
├── assets/
│   ├── icons/                   # App icons, marker icons (Kaaba, mosque, user)
│   └── models/                  # (Opsional) 3D model untuk AR markers (.glb/.gltf)
└── README.md
```

---

## 4. Detail Fitur & Spesifikasi Teknis

### 4.1 Deteksi Lokasi User

**API:** `navigator.geolocation.watchPosition()`

**Spesifikasi:**
- Gunakan `watchPosition` (bukan `getCurrentPosition`) untuk continuous tracking
- Options: `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }`
- Emit event `location:update` dengan `{ latitude, longitude, accuracy, timestamp }`
- Jika GPS accuracy > 50m, tampilkan warning "Akurasi GPS rendah"
- Handle error: `PERMISSION_DENIED` (redirect ke instruction), `POSITION_UNAVAILABLE`, `TIMEOUT`

**Fallback:** Jika `watchPosition` gagal, retry dengan `getCurrentPosition` interval 5 detik.

**Privacy:** Semua pemrosesan lokasi di sisi client. Hanya koordinat (tanpa data identitas) dikirim ke Overpass API.

---

### 4.2 Kompas Arah Kiblat (Map Mode & AR Mode)

#### 4.2.1 Kalkulasi Arah Kiblat

**Koordinat Kaaba:** `latitude: 21.4225, longitude: 39.8262`

**Formula (Great Circle Bearing):**
```
φ1 = lat_user (radians)
φ2 = lat_kaaba (radians)
Δλ = lon_kaaba - lon_user (radians)

θ = atan2(
  sin(Δλ) * cos(φ2),
  cos(φ1) * sin(φ2) - sin(φ1) * cos(φ2) * cos(Δλ)
)

qibla_bearing = (θ_deg + 360) % 360
```

**Implementasi JS:**
```javascript
function calculateQibla(userLat, userLon) {
  const kaabaLat = 21.4225;
  const kaabaLon = 39.8262;
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;

  const phi1 = toRad(userLat);
  const phi2 = toRad(kaabaLat);
  const deltaLambda = toRad(kaabaLon - userLon);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) -
            Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  let bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360;
}
```

#### 4.2.2 Kompas Digital (Device Orientation)

**API:** `window.addEventListener('deviceorientationabsolute', handler)` (Android Chrome) atau `window.addEventListener('deviceorientation', handler)` dengan fallback.

**Untuk iOS Safari (13+):**
- Wajib request permission via `DeviceOrientationEvent.requestPermission()` yang dipicu oleh user gesture (tap)
- Listener: `deviceorientation` (iOS tidak mendukung `deviceorientationabsolute`)

**Heading Calculation:**
- Android: gunakan `event.webkitCompassHeading` (jika tersedia) atau hitung dari `event.alpha` (absolute)
- iOS: gunakan `event.webkitCompassHeading` (sudut clockwise dari utara)
- Jika hanya `event.alpha` tersedia (non-absolute), gunakan formula konversi dari W3C spec

**Data yang di-emit:** `compass:heading` dengan `{ heading: <degrees 0-360>, accuracy: <degrees|null> }`

#### 4.2.3 Indikator Kiblat di Map Mode

- Tampilkan panah/lingkaran kompas di pojok layar
- Panah merah menunjuk ke arah kiblat (relatif terhadap heading user)
- Sudut relatif = `qibla_bearing - device_heading`
- Animasi smooth (CSS transition) untuk rotasi panah
- Tampilkan nilai derajat: "Kiblat: 295° dari Utara"

---

### 4.3 Peta Masjid Sekitar (Map Mode)

#### 4.3.1 Library: Leaflet.js 1.9.4

**Inisialisasi:**
```javascript
const map = L.map('map-container').setView([lat, lon], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);
```

#### 4.3.2 Query Masjid via Overpass API

**Endpoint:** `https://overpass-api.de/api/interpreter`

**Query (POST body):**
```
[out:json][timeout:25];
(
  node["amenity"="place_of_worship"]["religion"="muslim"](around:RADIUS,LAT,LON);
  way["amenity"="place_of_worship"]["religion"="muslim"](around:RADIUS,LAT,LON);
);
out center;
```

**Parameter:**
- `RADIUS`: default 5000 (meter), configurable via UI (1km, 5km, 10km, 25km)
- Untuk `way` (polygon), gunakan `out center;` untuk mendapatkan titik tengah

**Response parsing:**
- Extract `lat`, `lon`, dan `tags.name` dari setiap element
- Handle missing name → label: "Masjid (Tanpa Nama)"
- Parse `tags` tambahan opsional: `opening_hours`, `capacity`

**Caching:** Simpan hasil query di `localStorage` dengan key `mosques_<lat>_<lon>_<radius>` dan TTL 24 jam. Re-query hanya jika user pindah > 1km dari posisi query terakhir.

**Rate Limiting:** Overpass API publik memiliki rate limit. Tambahkan debounce 3 detik antara query. Pertimbangkan fallback ke mirror: `https://overpass.kumi.systems/api/interpreter`

#### 4.3.3 Distance Calculation (Haversine)

```javascript
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // distance in meters
}
```

#### 4.3.4 Marker & Sorting

- **User marker:** Icon lingkaran biru dengan akurasi circle (dari GPS accuracy)
- **Mosque markers:** Icon hijau (custom SVG/PNG), dengan popup berisi nama & jarak
- **Qibla line:** Garis dari posisi user ke arah kiblat (panjang visual ~500m), dengan icon Kaaba di ujung
- **Sorting:** Tampilkan list panel (collapsible) di bawah/samping map, sorted ascending by distance
- Setiap item list: `[icon] Nama Masjid — 1.2 km` (klik → fly to marker di map)
- Re-sort setiap kali GPS update atau radius berubah

#### 4.3.5 Map Controls
- Button "Locate Me" → `map.locate({setView: true, maxZoom: 17})`
- Radius selector: dropdown 1km / 5km / 10km / 25km
- Toggle "Show Qibla Line" on/off

---

### 4.4 AR Mode

#### 4.4.1 Trigger AR Mode
- User menekan tombol "AR Mode" di UI
- Validasi: pastikan `navigator.mediaDevices.getUserMedia` tersedia
- Request camera permission: `getUserMedia({ video: { facingMode: 'environment' } })`
- Jika ditolak: tampilkan modal instruksi "Aktifkan izin kamera di pengaturan browser"
- Transisi: fade-out map, fade-in AR scene

#### 4.4.2 AR Scene Setup (AR.js + A-Frame)

**HTML Structure:**
```html
<a-scene
  vr-mode-ui="enabled: false"
  embedded
  arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false"
  renderer="antialias: true; alpha: true; logarithmicDepthBuffer: true"
  visible="false"
  id="ar-scene"
>
  <a-camera
    gps-new-camera="gpsMinDistance: 2; gpsMinAccuracy: 50"
    rotation-reader
  >
  </a-camera>
</a-scene>
```

**Catatan penting:**
- `videoTexture: true` WAJIB untuk location-based AR (menggunakan three.js texture untuk camera feed, memungkinkan konten AR jarak jauh terlihat)
- `gpsMinDistance: 2` — hanya update posisi jika user bergerak > 2 meter (hemat battery)
- `gpsMinAccuracy: 50` — abaikan GPS reading dengan akurasi > 50m
- `logarithmicDepthBuffer: true` — mencegah z-fighting untuk objek AR jarak jauh
- `rotation-reader` — diperlukan untuk membaca orientasi device pada AR entity

#### 4.4.3 Marker Kiblat di AR (Fixed Size)

**Konsep:** Marker kiblat bukan ditempatkan di koordinat GPS Kaaba (terlalu jauh, tidak terlihat). Sebagai gantinya:
1. Hitung Qibla bearing dari posisi user
2. Hitung titik dummy di jarak fixed (misal 200m) sepanjang bearing tersebut dari posisi user
3. Tempatkan entity AR di titik dummy tersebut menggunakan `gps-new-entity-place`
4. Karena jaraknya fixed (200m), ukuran marker akan konsisten (tidak berubah saat user bergerak dalam radius kecil)

**Formula titik dummy:**
```javascript
function destinationPoint(lat, lon, bearing, distance) {
  const R = 6371000; // meters
  const toRad = (d) => d * Math.PI / 180;
  const toDeg = (r) => r * 180 / Math.PI;

  const lat1 = toRad(lat);
  const lon1 = toRad(lon);
  const brng = toRad(bearing);
  const dr = distance / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dr) +
    Math.cos(lat1) * Math.sin(dr) * Math.cos(brng)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(dr) * Math.cos(lat1),
    Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    latitude: toDeg(lat2),
    longitude: ((toDeg(lon2) + 540) % 360) - 180
  };
}

// Usage:
const qiblaBearing = calculateQibla(userLat, userLon);
const dummyPoint = destinationPoint(userLat, userLon, qiblaBearing, 200);
```

**AR Entity untuk Kiblat:**
```html
<a-entity
  id="qibla-marker"
  gps-new-entity-place="latitude: DUMMY_LAT; longitude: DUMMY_LON"
>
  <!-- Icon Kaaba (cylinder + box atau glTF model) -->
  <a-cylinder
    color="#FFD700"
    radius="3"
    height="6"
    position="0 3 0"
  ></a-cylinder>
  <a-text
    value="Kiblat"
    align="center"
    position="0 10 0"
    look-at="[gps-new-camera]"
    scale="30 30 30"
  ></a-text>
</a-entity>
```

**Fixed size enforcement:**
- Set scale tetap pada entity (tidak menggunakan auto-scaling AR.js distance)
- Override: tambahkan custom A-Frame component untuk menstabilkan ukuran
```javascript
AFRAME.registerComponent('fixed-scale', {
  tick: function() {
    // Pertahankan scale konstan terlepas dari jarak kamera
    this.el.object3D.scale.set(FIXED_SCALE, FIXED_SCALE, FIXED_SCALE);
  }
});
```
- Atau: gunakan `look-at="[gps-new-camera]"` + set `scale` eksplisit, AR.js akan menampilkan ukuran yang konsisten pada jarak 200m

**Update marker saat user bergerak:**
- Listen `gps-camera-update-position` event
- Re-calculate dummy point dengan bearing kiblat baru
- Update `gps-new-entity-place` latitude/longitude

#### 4.4.4 Marker Masjid di AR (Distance-Based Scaling)

**Konsep:** Marker masjid menggunakan `gps-new-entity-place` dengan koordinat asli masjid. AR.js secara otomatis menskalakan entity berdasarkan jarak (lebih dekat = lebih besar). Namun, AR.js default scaling mungkin terlalu ekstrem. Diperlukan custom scaling untuk kontrol yang lebih baik.

**AR Entity untuk Masjid:**
```javascript
function createMosqueMarker(mosque) {
  const compound = document.createElement('a-entity');
  compound.setAttribute('gps-new-entity-place', {
    latitude: mosque.latitude,
    longitude: mosque.longitude
  });
  compound.setAttribute('class', 'mosque-marker');

  // Marker visual (box atau icon)
  const marker = document.createElement('a-box');
  marker.setAttribute('color', '#00AA00');
  marker.setAttribute('position', '0 5 0');

  // Label: nama + jarak
  const label = document.createElement('a-text');
  label.setAttribute('look-at', '[gps-new-camera]');
  label.setAttribute('align', 'center');
  label.setAttribute('position', '0 12 0');

  compound.appendChild(marker);
  compound.appendChild(label);
  return compound;
}
```

**Custom distance-based scaling component:**
```javascript
AFRAME.registerComponent('distance-scale', {
  schema: {
    minScale: { default: 5 },
    maxScale: { default: 50 },
    minDistance: { default: 50 },   // meters
    maxDistance: { default: 5000 }  // meters
  },
  tick: function() {
    const camera = document.querySelector('[gps-new-camera]');
    if (!camera || !this.el.components['gps-new-entity-place']) return;

    const camPos = camera.object3D.position;
    const entityPos = this.el.object3D.position;
    const distance = camPos.distanceTo(entityPos);

    // Inverse scaling: closer = bigger
    const ratio = Math.max(0, Math.min(1,
      (this.data.maxDistance - distance) /
      (this.data.maxDistance - this.data.minDistance)
    ));

    const scale = this.data.minScale +
      ratio * (this.data.maxScale - this.data.minScale);

    this.el.setAttribute('scale', `${scale} ${scale} ${scale}`);
  }
});
```

**Label update (nama + jarak real-time):**
```javascript
AFRAME.registerComponent('mosque-label', {
  schema: {
    mosqueName: { type: 'string' }
  },
  tick: function() {
    const camera = document.querySelector('[gps-new-camera]');
    if (!camera) return;

    const camPos = camera.object3D.position;
    const entityPos = this.el.object3D.position;
    const distance = camPos.distanceTo(entityPos); // in Spherical Mercator units (~meters)

    const distanceKm = (distance / 1000).toFixed(2);
    const textEl = this.el.querySelector('a-text');
    if (textEl) {
      textEl.setAttribute('value',
        `${this.data.mosqueName}\n${distanceKm} km`);
    }
  }
});
```

#### 4.4.5 Toggle Marker Masjid di AR

**UI:** Button floating (FAB) di pojok kanan atas AR view, icon mata (👁 / 👁‍🗨).

**Behavior:**
```javascript
let mosqueMarkersVisible = true;

function toggleMosqueMarkers() {
  mosqueMarkersVisible = !mosqueMarkersVisible;
  const markers = document.querySelectorAll('.mosque-marker');
  markers.forEach(m => {
    m.setAttribute('visible', mosqueMarkersVisible);
  });

  // Qibla marker tetap visible (tidak terpengaruh toggle)
  const qibla = document.getElementById('qibla-marker');
  if (qibla) qibla.setAttribute('visible', true);
}
```

**Aturan:**
- Toggle HANYA mempengaruhi marker masjid (`.mosque-marker`)
- Marker kiblat (`#qibla-marker`) SELALU visible
- State toggle disimpan di variabel, bukan di DOM attribute (lebih reliable)

#### 4.4.6 Mode Transition (Map ↔ AR)

- Deteksi orientasi device:
  - Portrait / landscape dengan device tilt < 45° → Map Mode
  - Device ditegakkan (tilt > 60°, mode "vertical") → trigger AR Mode
- Atau gunakan button eksplisit "AR Mode" / "Map Mode" (lebih reliable cross-device)
- Rekomendasi: gunakan button eksplisit + auto-detect sebagai enhancement

**Device tilt detection (opsional auto-trigger):**
```javascript
window.addEventListener('deviceorientation', (e) => {
  const beta = e.beta; // front-to-back tilt (-180 to 180)
  // beta ≈ 90 when phone is held vertically
  if (Math.abs(beta - 90) < 30) {
    // Phone is upright → suggest AR mode
  }
});
```

---

### 4.5 Qibla Direction di AR Mode

Selain marker kiblat (section 4.4.3), tambahkan overlay HUD kompas di AR Mode:

**HUD Overlay (HTML/CSS, bukan AR entity):**
- Panah kompas semi-transparan di tepi atas layar
- Menunjukkan relatif heading: jika kiblat di kiri/kanan/layar depan
- Teks: "Kiblat: Putar ke kiri 45°" atau "Kiblat: Lurus ke depan ✓"
- Update real-time dari `compass:heading` event

**Implementasi:**
```javascript
function updateARQiblaHUD(deviceHeading, qiblaBearing) {
  const relative = ((qiblaBearing - deviceHeading) + 360) % 360;
  const arrow = document.getElementById('ar-qibla-arrow');
  const text = document.getElementById('ar-qibla-text');

  arrow.style.transform = `rotate(${relative}deg)`;

  if (relative < 15 || relative > 345) {
    text.textContent = 'Kiblat: Lurus ke depan ✓';
    text.className = 'qibla-aligned';
  } else if (relative < 180) {
    text.textContent = `Kiblat: Putar ke kanan ${Math.round(relative)}°`;
  } else {
    text.textContent = `Kiblat: Putar ke kiri ${Math.round(360 - relative)}°`;
  }
}
```

---

## 5. Data Flow & State Management

### 5.1 Global App State
```javascript
const AppState = {
  mode: 'map',           // 'map' | 'ar'
  userLocation: null,    // { latitude, longitude, accuracy }
  deviceHeading: null,   // degrees 0-360
  qiblaBearing: null,    // degrees 0-360
  mosques: [],           // [{ id, name, latitude, longitude, distance }]
  mosqueMarkersVisible: true,
  arSceneReady: false,
  gpsWatchId: null,
  compassActive: false
};
```

### 5.2 Event Flow

```
[GPS Update] ──→ Update userLocation
                 ├─→ Recalculate qiblaBearing
                 ├─→ Update Qibla marker position (AR)
                 ├─→ Re-query mosques if moved >1km (Overpass)
                 ├─→ Recalculate distances (Haversine)
                 ├─→ Update mosque list sorting
                 └─→ Update mosque AR label distances

[Compass Update] ──→ Update deviceHeading
                    ├─→ Rotate compass arrow (Map mode)
                    └─→ Update AR Qibla HUD

[Mode Switch] ──→ map → ar: Init AR scene, create entities
                 ar → map: Pause AR rendering, resume map

[Toggle Mosques] ──→ Set visible property on .mosque-marker entities
```

### 5.3 Event Bus (Simple Pub/Sub)
```javascript
const EventBus = {
  events: {},
  on(event, callback) {
    (this.events[event] = this.events[event] || []).push(callback);
  },
  emit(event, data) {
    (this.events[event] || []).forEach(cb => cb(data));
  }
};
```

**Events:**
- `location:update` → payload: `{ latitude, longitude, accuracy }`
- `compass:heading` → payload: `{ heading, accuracy }`
- `mosques:loaded` → payload: `[{ id, name, latitude, longitude, distance }]`
- `mode:change` → payload: `'map' | 'ar'`

---

## 6. UI/UX Design

### 6.1 Layout — Map Mode
```
┌─────────────────────────────────┐
│ [AR Mode]  ARQiblaPlus  [⚙]     │  ← Top Bar
├─────────────────────────────────┤
│                                 │
│        Leaflet Map              │
│                                 │
│  📍 (user)                      │
│  🕌 🕌                          │
│       ↗ (Qibla line)            │
│                                 │
│                    ┌──────────┐ │
│                    │  🧭 295° │ │  ← Compass widget
│                    │  Kiblat  │ │
│                    └──────────┘ │
├─────────────────────────────────┤
│ Radius: [1km▾]                  │  ← Filter bar
│ ┌─────────────────────────────┐ │
│ │ 🕌 Masjid Raya  — 0.3 km   │ │  ← Sorted mosque list
│ │ 🕌 Masjid Al-Hikmah — 1.2km│ │
│ │ 🕌 Masjid Nur — 2.5 km     │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### 6.2 Layout — AR Mode
```
┌─────────────────────────────────┐
│ [← Map]            👁 (toggle)   │  ← Top Bar (translucent)
├─────────────────────────────────┤
│        ╔═══════════╗            │
│        ║  🧭 295°  ║            │  ← AR Qibla HUD (overlay)
│        ║ Kiblat ✓  ║            │
│        ╚═══════════╝            │
│                                 │
│  [Camera Feed - live]           │
│                                 │
│        🕋                        │  ← Qibla marker (fixed size)
│        Kiblat                    │
│                                 │
│   🕌              🕌             │  ← Mosque markers (scaled)
│  Al-Hikmah     Masjid Nur       │
│  1.2 km        2.5 km           │
│                                 │
├─────────────────────────────────┤
│ GPS: ●  Akurasi: 15m           │  ← Status bar
└─────────────────────────────────┘
```

### 6.3 Color Palette
| Element | Color | Hex |
|---------|-------|-----|
| Primary (Islamic Green) | — | #00897B |
| Qibla / Kaaba | Gold | #FFD700 |
| Mosque Marker | Green | #2E7D32 |
| User Location | Blue | #2196F3 |
| Background (Dark) | — | #1A1A2E |
| Text (Light) | — | #E0E0E0 |
| AR Overlay BG | Semi-transparent black | rgba(0,0,0,0.6) |

### 6.4 Responsive Design
- Target: 320px–768px width (mobile portrait)
- Touch targets: minimum 44×44px (Apple HIG / Material Design)
- Font: system-ui, minimum 14px body
- AR HUD: fixed top center, pointer-events: none (kecuali buttons)

---

## 7. API Reference & Endpoints

### 7.1 Overpass API

**Endpoint:** `https://overpass-api.de/api/interpreter`  
**Method:** POST  
**Body:** `data=<URL-encoded query>`

**Full query template:**
```
[out:json][timeout:25];
(
  node["amenity"="place_of_worship"]["religion"="muslim"](around:{radius},{lat},{lon});
  way["amenity"="place_of_worship"]["religion"="muslim"](around:{radius},{lat},{lon});
);
out center;
```

**Fallback endpoints:**
- `https://overpass.kumi.systems/api/interpreter`
- `https://maps.mail.ru/osm/tools/overpass/api/interpreter`

**Rate limit:** Max 2 requests per 3 seconds. Implement exponential backoff.

### 7.2 Kaaba Coordinates (Constant)
```javascript
const KAABA = {
  latitude: 21.4225,
  longitude: 39.8262
};
```

### 7.3 OSM Tile Server
**URL Pattern:** `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`  
**Subdomains:** a, b, c  
**Attribution:** `© OpenStreetMap contributors`  
**Usage Policy:** Max 1 tile request/sec per client (Leaflet handles automatically)

---

## 8. Permissions & Browser Compatibility

### 8.1 Required Permissions
| Permission | API | Trigger | iOS Special Handling |
|-----------|-----|---------|---------------------|
| Geolocation | `navigator.geolocation` | Auto on load | Popup dialog, settings fallback |
| Camera | `navigator.mediaDevices.getUserMedia` | User taps "AR Mode" | Popup dialog |
| Device Orientation (Compass) | `DeviceOrientationEvent` | User taps "Enable Compass" | **`DeviceOrientationEvent.requestPermission()`** required (iOS 13+) |

### 8.2 iOS Safari Considerations
- **No `deviceorientationabsolute` event** — use `deviceorientation` with `webkitCompassHeading`
- **`requestPermission()` must be called from user gesture** (onclick/ontouchend)
- **WebGL performance** may be lower; reduce entity count if FPS < 30
- **AR.js location-based works** but compass accuracy varies
- Show "For best experience, use Chrome on Android" notice for iOS users

### 8.3 Chrome Android (Recommended)
- Full support for `deviceorientationabsolute`
- `webkitCompassHeading` available
- Best AR.js performance
- Camera via `getUserMedia` works seamlessly

### 8.4 Firefox Mobile
- **AR.js location-based does NOT work** due to DeviceOrientation API limitations (absolute orientation cannot be obtained) — show unsupported message

### 8.5 Permission Flow
```
App Load
  ├─→ Request Geolocation permission (auto)
  │     ├─ Granted → start watchPosition
  │     └─ Denied → show "Enable Location" modal
  ├─→ [User taps "Enable Compass"]
  │     ├─ iOS → requestPermission() → start listening
  │     └─ Android → start listening (auto)
  └─→ [User taps "AR Mode"]
        ├─ Request Camera permission
        │     ├─ Granted → init AR scene
        │     └─ Denied → show "Enable Camera" modal
        └─ Start AR scene
```

---

## 9. Performance Optimization

### 9.1 AR Performance
- **Entity count limit:** Max 50 mosque markers in AR scene simultaneously (hide distant ones)
- **LOD (Level of Detail):** Use simple `a-box` for markers, reserve `glTF` models only if FPS > 30 consistently
- **Frustum culling:** A-Frame handles automatically; verify with `renderer="logarithmicDepthBuffer: true"`
- **gpsMinDistance:** Set to 2m minimum to reduce unnecessary GPS-triggered recalculations
- **Debounce compass updates:** Throttle to 60fps max (16ms interval)

### 9.2 Data Optimization
- **Overpass query:** Use `around` filter (not bounding box) for circular search
- **Mosque data caching:** localStorage with 24h TTL
- **Lazy loading:** Only fetch mosques when entering Map Mode or when GPS updates > 1km
- **Distance calc:** Use Haversine (not Vincenty) for speed — sufficient accuracy for < 25km

### 9.3 Rendering
- **Map Mode:** Leaflet with `preferCanvas: true` for marker rendering (faster than SVG for many markers)
- **AR Mode:** `renderer="antialias: true; alpha: true; logarithmicDepthBuffer: true"`
- **CSS:** Use `will-change: transform` for compass arrow animation
- **Images:** SVG icons (scalable, small file size)

---

## 10. Error Handling

### 10.1 Error Categories & Responses
| Error | Detection | User Response |
|-------|-----------|---------------|
| GPS denied | `error.code === 1` | Modal: "Aktifkan izin lokasi di pengaturan browser" |
| GPS unavailable | `error.code === 2` | Toast: "Lokasi tidak tersedia. Coba ke luar ruangan." |
| GPS timeout | `error.code === 3` | Retry with `getCurrentPosition` fallback |
| Camera denied | `getUserMedia` reject | Modal: "Aktifkan izin kamera untuk mode AR" |
| Compass denied (iOS) | `requestPermission() === 'denied'` | Toast: "Kompas dinonaktifkan. Arah kiblat mungkin tidak akurat." |
| Overpass API error | HTTP non-200 or timeout | Retry with fallback endpoint; show cached data if available |
| Overpass rate limit | HTTP 429 | Exponential backoff; show "Sedang memuat data masjid..." |
| No mosques found | Empty result array | Toast: "Tidak ada masjid ditemukan dalam radius ini. Coba perbesar radius." |
| Browser not supported | Feature detection fails | Full-screen: "Browser Anda tidak mendukung fitur AR. Gunakan Chrome di Android." |
| Low GPS accuracy | `accuracy > 50m` | Warning badge on GPS status: "Akurasi rendah" |
| AR scene not rendering | A-Frame `loaded` event timeout | Retry scene init; show "Gagal memuat AR. Coba lagi." |

### 10.2 Feature Detection
```javascript
const FeatureSupport = {
  geolocation: 'geolocation' in navigator,
  camera: 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices,
  deviceOrientation: 'DeviceOrientationEvent' in window,
  absoluteOrientation: 'AbsoluteOrientationSensor' in window,
  webgl: (() => {
    try { return !!document.createElement('canvas').getContext('webgl'); }
    catch(e) { return false; }
  })(),
  iosPermission: typeof DeviceOrientationEvent.requestPermission === 'function'
};
```

---

## 11. Testing Strategy

### 11.1 Testing Checklist
- [ ] GPS permission grant/deny flow
- [ ] Compass heading accuracy (compare with native compass app)
- [ ] Qibla bearing calculation (verify against known values, e.g., Jakarta ~295°, Bandung ~295°)
- [ ] Overpass API query returns mosques in known area
- [ ] Mosque sorting by distance (ascending)
- [ ] Map markers render correctly
- [ ] Qibla line on map points correct direction
- [ ] AR scene initializes and camera feed displays
- [ ] AR Qibla marker visible at correct bearing
- [ ] AR Qibla marker size remains fixed when user moves
- [ ] AR mosque markers scale with distance (closer = bigger)
- [ ] AR mosque labels show name + distance, update in real-time
- [ ] Toggle mosque markers: hides all mosque markers, keeps Qibla marker
- [ ] Toggle mosque markers: re-shows all mosque markers
- [ ] Mode switch: Map → AR → Map (no memory leak, no duplicate entities)
- [ ] iOS Safari: permission flow works
- [ ] Chrome Android: full functionality
- [ ] Low GPS accuracy warning displays
- [ ] No mosques: graceful empty state
- [ ] Offline: cached mosque data still displays (if previously loaded)

### 11.2 Known Qibla Values for Verification
| City | Latitude | Longitude | Expected Qibla (approx) |
|------|----------|-----------|------------------------|
| Bandung | -6.9175 | 107.6191 | ~295° |
| Jakarta | -6.2088 | 106.8456 | ~295° |
| Makkah | 21.4225 | 39.8262 | 0° (at Kaaba) |
| Istanbul | 41.0082 | 28.9784 | ~205° |
| London | 51.5074 | -0.1278 | ~119° |

---

## 12. Dependencies (CDN URLs)

```html
<!-- A-Frame -->
<script src="https://aframe.io/releases/1.6.0/aframe.min.js"></script>

<!-- AR.js Location-Based (A-Frame build) -->
<script src="https://raw.githack.com/AR-js-org/AR.js/3.4.7/aframe/build/aframe-ar.js"></script>

<!-- AR.js Three.js location-only build (for videoTexture support) -->
<script src="https://raw.githack.com/AR-js-org/AR.js/3.4.7/three.js/build/ar-threex-location-only.js"></script>

<!-- Leaflet.js -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

<!-- A-Frame look-at component (for text labels facing camera) -->
<script src="https://unpkg.com/aframe-look-at-component@0.8.0/dist/aframe-look-at-component.min.js"></script>
```

**Total external payload (approx):** ~500KB minified+gzipped (A-Frame ~400KB, Leaflet ~40KB, AR.js ~50KB)

---

## 13. Assumptions & Uncertainty Labeling

### Assumptions
1. **[A1 — High Confidence]** AR.js 3.4.7 + A-Frame 1.6.0 mendukung location-based AR di Chrome Android dengan `gps-new-camera` dan `gps-new-entity-place` components.
2. **[A2 — High Confidence]** Overpass API publik dapat di-query tanpa API key, dengan rate limit yang dapat ditangani via debounce + caching.
3. **[A3 — Medium Confidence]** Custom A-Frame component `fixed-scale` dapat mempertahankan ukuran marker kiblat konstan dengan override `object3D.scale` pada setiap tick. Alternatif: menempatkan marker di jarak fixed (200m) yang membuat ukuran visually konsisten.
4. **[A4 — Medium Confidence]** Custom component `distance-scale` dapat mengontrol scaling marker masjid berdasarkan jarak real-time dari kamera. AR.js default behavior sudah melakukan scaling berdasarkan jarak, tetapi mungkin perlu fine-tuning.
4. **[A5 — Low Confidence]** Auto-trigger AR mode berdasarkan device tilt dapat tidak reliable di semua device. Button eksplisit lebih disarankan.
5. **[A6 — Medium Confidence]** Label jarak real-time pada AR marker menggunakan `object3D.position.distanceTo()` memberikan nilai dalam Spherical Mercator units yang mendekati meter tetapi tidak exact. Untuk akurasi penuh, gunakan Haversine dengan koordinat GPS entity.
6. **[A7 — High Confidence]** iOS Safari memerlukan `DeviceOrientationEvent.requestPermission()` yang harus dipicu dari user gesture.

### Open Questions
1. Apakah perlu dukungan offline (PWA service worker)? — Untuk v1, tidak. Sebutkan sebagai future enhancement.
2. Apakah perlu backend server sendiri untuk caching Overpass API? — Tidak untuk v1, gunakan localStorage.
3. Apakah marker kiblat perlu 3D model (Kaaba miniature) atau cukup icon 2D? — Icon 2D (a-text + a-box/cylinder) untuk v1.

---

## 14. Future Enhancements (Out of Scope v1)
- PWA support (manifest.json + service worker)
- 3D Kaaba model (.glb) untuk AR marker
- Prayer times integration (Adhan API)
- User-contributed mosque data (correct missing/wrong OSM data)
- Multi-language support (Indonesian, Arabic, English)
- Dark/light theme toggle
- Save favorite mosques
- Turn-by-turn navigation to nearest mosque
- Social features: check-in, prayer congregation status

---

## 15. Implementation Priority for Freebuff

### Phase 1: Core (MVP)
1. `index.html` — UI shell with both mode containers
2. `geolocation.js` — GPS tracking
3. `qibla.js` — Qibla bearing calculation
4. `compass.js` — Device orientation heading
5. `map-mode.js` — Leaflet map with user + mosque markers + Qibla line
6. `mosque-data.js` — Overpass API query + Haversine distance

### Phase 2: AR
7. `ar-mode.js` — AR.js scene init
8. Qibla AR marker (fixed size, dummy point approach)
9. Mosque AR markers (distance-based scaling + labels)
10. Toggle mosque markers button
11. AR Qibla HUD overlay

### Phase 3: Polish
12. `app.js` — Mode switching, event bus, state management
13. Error handling & permission flows
14. iOS compatibility handling
15. Performance optimization (entity limits, debouncing)
16. CSS theming & responsive layout

---

*End of Design Document*
