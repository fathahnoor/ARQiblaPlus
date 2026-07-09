# ARQiblaPlus

> **Arah Kiblat & Masjid Terdekat — Augmented Reality + GPS**  
> Web app mobile browser (PWA-ready) tanpa instalasi.

---

## Fitur

### 🗺 Map Mode
- Peta interaktif dengan Leaflet.js & OpenStreetMap
- Marker posisi user real-time dengan akurasi GPS
- Garis arah kiblat emas dari posisi user
- Daftar masjid terdekat (diurutkan berdasarkan jarak)
- Data masjid dari Overpass API (real-time)
- Filter radius: 1km, 5km, 10km, 25km
- Widget kompas digital

### 📷 AR Mode
- Augmented Reality berbasis lokasi (AR.js + A-Frame)
- Marker kiblat 3D (gold cylinder) di arah Kaaba
- Marker masjid 3D dengan label nama & jarak
- HUD overlay arah kiblat
- Toggle visibilitas marker masjid
- Distance-based scaling untuk marker masjid

---

## Teknologi

| Layer | Teknologi |
|-------|-----------|
| AR | AR.js 3.4.7 (Location-Based) + A-Frame 1.6.0 |
| Peta | Leaflet.js 1.9.4 + OpenStreetMap |
| Data Masjid | Overpass API |
| GPS | W3C Geolocation API |
| Kompas | DeviceOrientation API |
| Frontend | Vanilla JS ES6+ |
| Styling | Custom CSS (CSS Variables) |

---

## Cara Menjalankan

1. **Clone repository ini**
2. **Jalankan di server HTTPS** (wajib untuk akses kamera & GPS):
   ```bash
   # Menggunakan Python
   python3 -m http.server 8000

   # Atau menggunakan npx serve
   npx serve .
   ```
3. **Buka di browser mobile** (Chrome Android direkomendasikan):
   ```
   https://localhost:8000
   ```
4. **Untuk development dengan HTTPS lokal**, gunakan:
   ```bash
   npx localtunnel --port 8000
   ```

---

## Izin yang Diperlukan

| Izin | Digunakan Untuk |
|------|-----------------|
| Lokasi (GPS) | Menentukan posisi user, menghitung arah kiblat, mencari masjid terdekat |
| Kamera | Menampilkan AR feed di AR Mode |
| Orientasi Device | Kompas digital untuk arah kiblat |

---

## Kompatibilitas Browser

| Browser | Map Mode | AR Mode | Kompas |
|---------|:--------:|:-------:|:------:|
| Chrome Android | ✅ | ✅ | ✅ |
| Safari iOS | ✅ | ⚠ Terbatas | ⚠ Butuh izin |
| Firefox Mobile | ✅ | ❌ | ⚠ |
| Desktop | ✅ | ❌ | ❌ |

---

## Struktur File

```
ARQiblaPlus/
├── index.html            # Entry point
├── css/
│   ├── style.css         # Global styles & theming
│   ├── map-mode.css      # Map mode styles
│   └── ar-mode.css       # AR mode overlay styles
├── js/
│   ├── app.js            # Main controller & mode switching
│   ├── utils.js          # Haversine, debounce, formatting
│   ├── qibla.js          # Qibla bearing calculation
│   ├── geolocation.js    # GPS tracking service
│   ├── compass.js        # DeviceOrientation handler
│   ├── mosque-data.js    # Overpass API query & caching
│   ├── map-mode.js       # Leaflet map initialization
│   └── ar-mode.js        # AR.js scene & markers
└── assets/
    └── icons/            # App icons & markers
```

---

## Lisensi

MIT

---

*Dibuat dengan ❤️ untuk membantu Muslim menemukan arah kiblat dan masjid terdekat.*
