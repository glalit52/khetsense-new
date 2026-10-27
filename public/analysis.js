// KhetiSense Analysis Page — end-to-end farm analysis & polygon field mapping
const toast = (msg, type = 'ok') => {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.borderColor = type === 'err' ? 'rgba(248,113,113,0.5)' : 'rgba(22,163,74,0.5)';
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 3500);
};

const getToken = () => localStorage.getItem('ks_token');

async function api(url, opts = {}) {
  const token = getToken();
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

// Tab switching
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const tabBtn = document.getElementById(`tab-${name}`);
  const tabContent = document.getElementById(`content-${name}`);
  if (tabBtn) tabBtn.classList.add('active');
  if (tabContent) tabContent.classList.add('active');

  if (name === 'field') {
    setTimeout(ensureFieldMap, 100);
  } else if (name === 'history') {
    loadHistory();
  } else if (name === 'mandi') {
    if (farmProfile.crop && !document.getElementById('mandiOut').children.length) {
      document.getElementById('fetchMandiBtn')?.click();
    }
  } else if (name === 'settings') {
    populateSettingsForm();
  }
}
window.switchTab = switchTab;

// ====== Farm Profile & Banner ======
let currentUser = null;
let farmProfile = {};
let availableCrops = [];

async function loadUserAndBanner() {
  try {
    const { user } = await api('/api/profile');
    currentUser = user;
    farmProfile = {
      ...user.farm,
      lang: user.lang,
      name: user.name,
    };

    // Header badge (non-clickable status display)
    const hAvatar = document.getElementById('headerAvatar');
    const hName = document.getElementById('headerUserName');
    if (hAvatar) hAvatar.textContent = (user.name || 'U').charAt(0).toUpperCase();
    if (hName) hName.textContent = user.name ? user.name.split(' ')[0] : 'Farmer';

    renderFarmBanner();

    // Populate settings form
    populateSettingsForm();

    // Pre-fill mandi controls
    if (user.farm?.crop) document.getElementById('mandiCrop').value = user.farm.crop;
    if (user.farm?.state) document.getElementById('mandiState').value = user.farm.state;

    // If farm coordinates exist, automatically run live analysis once
    if (farmProfile.lat && farmProfile.lon) {
      document.getElementById('runAnalysisBtn')?.click();
    }
  } catch (e) {
    if (e.message.includes('401') || e.message.includes('authenticated') || e.message.includes('expired')) {
      localStorage.removeItem('ks_token');
      localStorage.removeItem('ks_user');
      window.location.href = '/login?redirect=/analysis&msg=analysis';
      return;
    }
    toast(e.message, 'err');
  }
}

function renderFarmBanner() {
  const farmTitle = farmProfile.name || `${currentUser?.name || 'Farmer'}'s Field`;
  document.getElementById('farmBannerTitle').textContent = farmTitle;
  
  const placeText = [farmProfile.place, farmProfile.crop ? farmProfile.crop.toUpperCase() : null].filter(Boolean).join(' · ');
  document.getElementById('farmBannerSub').textContent = placeText || '📍 No field boundary or location set';

  const stats = [];
  if (farmProfile.area) stats.push({ val: `${farmProfile.area} ac`, lbl: 'Area' });
  if (farmProfile.crop) stats.push({ val: farmProfile.crop.toUpperCase(), lbl: 'Crop' });
  if (farmProfile.soilType) stats.push({ val: capFirst(farmProfile.soilType), lbl: 'Soil' });
  if (farmProfile.irrigationType) stats.push({ val: capFirst(farmProfile.irrigationType), lbl: 'Irrigation' });
  if (farmProfile.boundary?.length) stats.push({ val: `${farmProfile.boundary.length} pts`, lbl: 'Polygon' });

  document.getElementById('farmBannerStats').innerHTML = stats.map(s => `
    <div class="banner-stat">
      <span class="val">${esc(s.val)}</span>
      <span class="lbl">${esc(s.lbl)}</span>
    </div>
  `).join('');

  // Hints in empty state
  const hints = [];
  if (!farmProfile.lat) hints.push('📍 Draw field polygon on map');
  if (!farmProfile.soilType) hints.push('🌱 Select soil type');
  if (!farmProfile.irrigationType) hints.push('💧 Set irrigation method');
  const hintEl = document.getElementById('profileHint');
  if (hintEl) {
    hintEl.innerHTML = hints.length
      ? '<p style="margin-bottom:8px;font-size:0.8rem;color:var(--muted)">Improve AI prediction accuracy:</p>' +
        hints.map(h => `<span class="profile-chip">${h}</span>`).join('')
      : '';
  }
}

// Banner quick buttons
document.getElementById('bannerDrawBtn').onclick = () => switchTab('field');
document.getElementById('bannerSettingsBtn').onclick = () => switchTab('settings');

// ====== Load crops ======
async function loadCrops() {
  try {
    const { crops } = await api('/api/config');
    availableCrops = crops || [];

    const fieldCrop = document.getElementById('fieldCropSelect');
    const mandiCrop = document.getElementById('mandiCrop');
    const setCrop = document.getElementById('setFarmCrop');

    const optionsHtml = availableCrops.map(c => `<option value="${c.id}">${c.en} (${c.hi})</option>`).join('');

    if (fieldCrop) fieldCrop.innerHTML = optionsHtml;
    if (mandiCrop) mandiCrop.innerHTML = optionsHtml;
    if (setCrop) setCrop.innerHTML = optionsHtml;

    if (farmProfile.crop) {
      if (fieldCrop) fieldCrop.value = farmProfile.crop;
      if (mandiCrop) mandiCrop.value = farmProfile.crop;
      if (setCrop) setCrop.value = farmProfile.crop;
    }
  } catch { /* fallback */ }
}

// ====== FIELD & POLYGON ENGINE ======
let fieldMap = null;
let osmTileLayer = null;
let satelliteTileLayer = null;
let isSatellite = true;
let isDrawingActive = true;
let isPolygonClosed = false;
let polygonPoints = []; // Array of [lat, lon]
let vertexMarkers = [];
let polygonLayer = null;
let polylineLayer = null;
let closingGuideLayer = null;
let pendingPlace = '';
let pendingState = '';
let centroid = null;
let previousDragCoords = null;

// Geodesic spherical area in Acres
function calculatePolygonAreaAcres(pts) {
  if (!pts || pts.length < 3) return 0;
  const R = 6378137; // Earth's mean radius in meters
  let total = 0;
  const rad = deg => (deg * Math.PI) / 180;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    total += rad(p2[1] - p1[1]) * (2 + Math.sin(rad(p1[0])) + Math.sin(rad(p2[0])));
  }
  const sqMeters = Math.abs((total * R * R) / 2);
  const acres = sqMeters / 4046.85642;
  return Number(acres.toFixed(2));
}

function calculateCentroid(pts) {
  if (!pts || !pts.length) return null;
  let sLat = 0, sLon = 0;
  pts.forEach(p => { sLat += p[0]; sLon += p[1]; });
  return { lat: Number((sLat / pts.length).toFixed(5)), lon: Number((sLon / pts.length).toFixed(5)) };
}

// ====== GEOMETRY & INTERSECTION VALIDATION ======
// Cross product (2D orientation) using longitude as X, latitude as Y
function crossProduct(a, b, c) {
  return (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
}

// Checks if segment p1p2 strictly intersects segment p3p4
function doSegmentsIntersect(p1, p2, p3, p4) {
  const eps = 1e-7;
  // If segments share an endpoint, they don't cross
  const isSame = (a, b) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
  if (isSame(p1, p3) || isSame(p1, p4) || isSame(p2, p3) || isSame(p2, p4)) return false;

  const cp1 = crossProduct(p1, p2, p3);
  const cp2 = crossProduct(p1, p2, p4);
  const cp3 = crossProduct(p3, p4, p1);
  const cp4 = crossProduct(p3, p4, p2);

  // Straddle test
  if (((cp1 > 0 && cp2 < 0) || (cp1 < 0 && cp2 > 0)) &&
      ((cp3 > 0 && cp4 < 0) || (cp3 < 0 && cp4 > 0))) {
    return true;
  }

  // Collinear overlap test
  const onSegment = (p, q, r) => {
    return q[0] <= Math.max(p[0], r[0]) + eps && q[0] >= Math.min(p[0], r[0]) - eps &&
           q[1] <= Math.max(p[1], r[1]) + eps && q[1] >= Math.min(p[1], r[1]) - eps;
  };

  if (Math.abs(cp1) < eps && onSegment(p1, p3, p2)) return true;
  if (Math.abs(cp2) < eps && onSegment(p1, p4, p2)) return true;
  if (Math.abs(cp3) < eps && onSegment(p3, p1, p4)) return true;
  if (Math.abs(cp4) < eps && onSegment(p3, p2, p4)) return true;

  return false;
}

// Check if adding newPt from pts[pts.length - 1] intersects any existing segment
function canAddPointWithoutIntersection(pts, newPt) {
  if (pts.length < 2) return true;
  const pLast = pts[pts.length - 1];

  // Prevent duplicate consecutive point
  if (Math.abs(newPt[0] - pLast[0]) < 1e-6 && Math.abs(newPt[1] - pLast[1]) < 1e-6) {
    return false;
  }

  // Segment [pLast, newPt] must not cross any [pts[i], pts[i+1]]
  for (let i = 0; i < pts.length - 2; i++) {
    if (doSegmentsIntersect(pLast, newPt, pts[i], pts[i + 1])) {
      return false;
    }
  }
  return true;
}

// Check if closing edge [pts[pts.length - 1], pts[0]] intersects any intermediate segment
function canClosePolygonWithoutIntersection(pts) {
  if (pts.length < 3) return false;
  const pFirst = pts[0];
  const pLast = pts[pts.length - 1];

  // Shares pFirst with [pts[0], pts[1]] and pLast with [pts[n-2], pts[n-1]]
  // Must not cross [pts[1], pts[2]], ..., [pts[n-3], pts[n-2]]
  for (let i = 1; i < pts.length - 2; i++) {
    if (doSegmentsIntersect(pLast, pFirst, pts[i], pts[i + 1])) {
      return false;
    }
  }
  return true;
}

// Check if any edges in polygon cross each other
function hasAnySelfIntersection(pts, isClosed) {
  const n = pts.length;
  if (n < 4) return false;
  const numEdges = isClosed ? n : n - 1;
  for (let i = 0; i < numEdges; i++) {
    const a1 = pts[i];
    const a2 = pts[(i + 1) % n];
    for (let j = i + 1; j < numEdges; j++) {
      if (j === i) continue;
      if (j === (i + 1) % n) continue;
      if (isClosed && i === 0 && j === n - 1) continue;
      const b1 = pts[j];
      const b2 = pts[(j + 1) % n];
      if (doSegmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function ensureFieldMap() {
  if (!window.L) return;
  const container = document.getElementById('fieldMap');
  if (!container) return;

  if (!fieldMap) {
    const initialLat = farmProfile.lat || 28.6139;
    const initialLon = farmProfile.lon || 77.2090;
    const initialZoom = farmProfile.lat ? 16 : 6;

    fieldMap = L.map('fieldMap', { zoomControl: true }).setView([initialLat, initialLon], initialZoom);

    // Esri World Imagery (Satellite)
    satelliteTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics'
    });

    // OpenStreetMap
    osmTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    });

    satelliteTileLayer.addTo(fieldMap);

    // Map click handler for polygon drawing
    fieldMap.on('click', onMapClick);

    // Mouse move handler for closing line preview
    fieldMap.on('mousemove', onMapMouseMove);

    // Load existing polygon boundary if user already has one saved
    if (farmProfile.boundary && Array.isArray(farmProfile.boundary) && farmProfile.boundary.length >= 3) {
      polygonPoints = farmProfile.boundary.map(pt => [pt[0], pt[1]]);
      isPolygonClosed = true;
      redrawPolygon();
      if (polygonLayer) {
        fieldMap.fitBounds(polygonLayer.getBounds(), { padding: [40, 40] });
      }
    } else if (farmProfile.lat && farmProfile.lon) {
      // Show location marker
      L.marker([farmProfile.lat, farmProfile.lon]).addTo(fieldMap).bindPopup(`📍 ${farmProfile.place || 'Your Farm'}`).openPopup();
      fieldMap.setView([farmProfile.lat, farmProfile.lon], 16);
    }

    populateFieldForm();
  }

  fieldMap.invalidateSize();
}

function onMapMouseMove(e) {
  if (isPolygonClosed || !isDrawingActive || polygonPoints.length < 3 || !fieldMap) {
    removeClosingGuide();
    return;
  }
  const startLatLng = L.latLng(polygonPoints[0][0], polygonPoints[0][1]);
  const mousePt = fieldMap.latLngToContainerPoint(e.latlng);
  const startPt = fieldMap.latLngToContainerPoint(startLatLng);
  if (mousePt.distanceTo(startPt) <= 30) {
    showClosingGuide();
  } else {
    removeClosingGuide();
  }
}

function showClosingGuide() {
  if (isPolygonClosed || polygonPoints.length < 3 || !fieldMap) return;
  removeClosingGuide();
  const pLast = polygonPoints[polygonPoints.length - 1];
  const pFirst = polygonPoints[0];
  const isCrossing = !canClosePolygonWithoutIntersection(polygonPoints);
  closingGuideLayer = L.polyline([pLast, pFirst], {
    color: isCrossing ? '#ef4444' : '#86efac',
    weight: 2.5,
    dashArray: '5, 6',
  }).addTo(fieldMap);
}

function removeClosingGuide() {
  if (closingGuideLayer && fieldMap) {
    fieldMap.removeLayer(closingGuideLayer);
    closingGuideLayer = null;
  }
}

function onMapClick(e) {
  if (!isDrawingActive) return;

  const lat = Number(e.latlng.lat.toFixed(5));
  const lon = Number(e.latlng.lng.toFixed(5));

  // If already closed: guide user
  if (isPolygonClosed) {
    toast('💡 Polygon is already closed. Drag corner markers to adjust boundary, or click "Undo" to re-open.', 'err');
    return;
  }

  // If user has >= 3 points and clicks near the start point (P0), close it!
  if (polygonPoints.length >= 3) {
    const startLatLng = L.latLng(polygonPoints[0][0], polygonPoints[0][1]);
    const clickPt = fieldMap.latLngToContainerPoint(e.latlng);
    const startPt = fieldMap.latLngToContainerPoint(startLatLng);
    const distPx = clickPt.distanceTo(startPt);

    if (distPx <= 28) {
      tryClosePolygon();
      return;
    }
  }

  // Check if adding this point creates a crossing line
  if (!canAddPointWithoutIntersection(polygonPoints, [lat, lon])) {
    toast('⚠️ Lines cannot cross! Boundary lines must not intersect each other.', 'err');
    return;
  }

  // Valid point addition
  polygonPoints.push([lat, lon]);
  redrawPolygon();
  reverseGeocodeCentroid();
}

function tryClosePolygon() {
  if (isPolygonClosed) return;
  if (polygonPoints.length < 3) {
    toast('💡 Please add at least 3 boundary corners before closing your field.', 'err');
    return;
  }

  if (!canClosePolygonWithoutIntersection(polygonPoints)) {
    toast('⚠️ Cannot close polygon: the closing line crosses an existing boundary line! Please adjust corners.', 'err');
    return;
  }

  isPolygonClosed = true;
  removeClosingGuide();
  redrawPolygon();
  reverseGeocodeCentroid();

  const acres = calculatePolygonAreaAcres(polygonPoints);
  toast(`✓ Field polygon closed! (${polygonPoints.length} corners, ${acres} Acres)`);
}

function redrawPolygon() {
  if (!fieldMap) return;

  // Clear existing markers, layers and guide
  removeClosingGuide();
  vertexMarkers.forEach(m => fieldMap.removeLayer(m));
  vertexMarkers = [];
  if (polygonLayer) { fieldMap.removeLayer(polygonLayer); polygonLayer = null; }
  if (polylineLayer) { fieldMap.removeLayer(polylineLayer); polylineLayer = null; }

  // Update Toolbar buttons
  const undoBtn = document.getElementById('mapUndoBtn');
  if (undoBtn) undoBtn.disabled = polygonPoints.length === 0;

  const closeBtn = document.getElementById('mapClosePolyBtn');
  if (closeBtn) {
    if (isPolygonClosed) {
      closeBtn.disabled = true;
      closeBtn.innerHTML = '✓ Closed';
      closeBtn.classList.remove('highlight-btn');
    } else if (polygonPoints.length >= 3) {
      closeBtn.disabled = false;
      closeBtn.innerHTML = '🎯 Close Polygon';
      closeBtn.classList.add('highlight-btn');
    } else {
      closeBtn.disabled = true;
      closeBtn.innerHTML = '🎯 Close Polygon';
      closeBtn.classList.remove('highlight-btn');
    }
  }

  const mapContainer = document.getElementById('fieldMap');
  if (mapContainer) {
    mapContainer.classList.toggle('is-drawing', isDrawingActive && !isPolygonClosed);
  }

  // Draw vertex markers
  polygonPoints.forEach((pt, idx) => {
    const isStart = idx === 0;
    const canCloseNow = isStart && !isPolygonClosed && polygonPoints.length >= 3;

    let markerClass = 'vertex-marker';
    let iconSize = [14, 14];
    let iconAnchor = [7, 7];

    if (isStart && !isPolygonClosed) {
      markerClass = canCloseNow ? 'start-vertex-marker can-close' : 'start-vertex-marker';
      iconSize = [20, 20];
      iconAnchor = [10, 10];
    }

    const icon = L.divIcon({
      className: markerClass,
      iconSize: iconSize,
      iconAnchor: iconAnchor,
    });

    const marker = L.marker(pt, { icon, draggable: true }).addTo(fieldMap);

    // Tooltip
    if (canCloseNow) {
      marker.bindTooltip('🎯 Click to close field polygon', {
        permanent: true,
        direction: 'top',
        className: 'close-tooltip',
        offset: [0, -10],
      });
    } else if (isStart && !isPolygonClosed) {
      marker.bindTooltip('Start corner (P1)', { direction: 'top', offset: [0, -8] });
    } else {
      marker.bindTooltip(isPolygonClosed ? `Corner ${idx + 1} (drag to adjust)` : `Corner ${idx + 1}`, {
        direction: 'top',
        offset: [0, -6],
      });
    }

    // Direct click on start marker closes polygon if ready
    if (isStart && !isPolygonClosed) {
      marker.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        if (polygonPoints.length >= 3) {
          tryClosePolygon();
        } else {
          toast('💡 Add at least 3 corners before closing the polygon.', 'err');
        }
      });

      marker.on('mouseover', () => {
        if (!isPolygonClosed && polygonPoints.length >= 3) {
          showClosingGuide();
        }
      });
      marker.on('mouseout', () => {
        removeClosingGuide();
      });
    }

    // Drag handling with self-intersection prevention
    marker.on('dragstart', () => {
      previousDragCoords = polygonPoints.map(p => [...p]);
    });

    marker.on('drag', (e) => {
      polygonPoints[idx] = [Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5))];
      updatePolygonGeometryOnly();
    });

    marker.on('dragend', () => {
      if (hasAnySelfIntersection(polygonPoints, isPolygonClosed)) {
        if (previousDragCoords) {
          polygonPoints = previousDragCoords.map(p => [...p]);
        }
        redrawPolygon();
        toast('⚠️ Boundary lines cannot cross each other! Corner reset to previous position.', 'err');
        return;
      }
      redrawPolygon();
      reverseGeocodeCentroid();
      const acres = calculatePolygonAreaAcres(polygonPoints);
      toast(`✓ Corner adjusted (${acres} ac)`);
    });

    vertexMarkers.push(marker);
  });

  // Layer rendering based on open vs closed state
  if (isPolygonClosed && polygonPoints.length >= 3) {
    polygonLayer = L.polygon(polygonPoints, {
      color: '#22c55e',
      weight: 2.5,
      fillColor: '#16a34a',
      fillOpacity: 0.35,
    }).addTo(fieldMap);

    const acres = calculatePolygonAreaAcres(polygonPoints);
    centroid = calculateCentroid(polygonPoints);
    updateHUD(acres, `Field polygon closed ✓ (${polygonPoints.length} vertices)`);

    const areaInput = document.getElementById('fieldAreaInput');
    if (areaInput && (!areaInput.value || areaInput.dataset.auto === 'true' || !areaInput.dataset.touched)) {
      areaInput.value = acres;
      areaInput.dataset.auto = 'true';
    }
  } else {
    // Open path drawing
    if (polygonPoints.length === 1) {
      updateHUD(0, 'Start corner set · Click on map to add 2nd corner');
    } else if (polygonPoints.length === 2) {
      polylineLayer = L.polyline(polygonPoints, { color: '#22c55e', weight: 3, dashArray: '6, 6' }).addTo(fieldMap);
      updateHUD(0, '2 corners set · Click map to add 3rd corner');
    } else if (polygonPoints.length >= 3) {
      polylineLayer = L.polyline(polygonPoints, { color: '#22c55e', weight: 3 }).addTo(fieldMap);
      updateHUD(0, `${polygonPoints.length} corners · Click start corner (🟡) to close, or add more corners`);
    } else {
      updateHUD(0, 'Click on map to place boundary corners');
    }
  }
}

function updatePolygonGeometryOnly() {
  if (isPolygonClosed && polygonPoints.length >= 3 && polygonLayer) {
    polygonLayer.setLatLngs(polygonPoints);
    const acres = calculatePolygonAreaAcres(polygonPoints);
    updateHUD(acres, `Field polygon updated (${acres} ac)`);
    const areaInput = document.getElementById('fieldAreaInput');
    if (areaInput && areaInput.dataset.auto === 'true') {
      areaInput.value = acres;
    }
  } else if (polylineLayer) {
    polylineLayer.setLatLngs(polygonPoints);
  }
}

function updateHUD(acres, statusMsg) {
  const areaEl = document.getElementById('hudArea');
  const ptsEl = document.getElementById('hudPoints');
  const statusEl = document.getElementById('hudStatus');
  const locEl = document.getElementById('hudLocation');

  if (areaEl) {
    const ha = (acres * 0.404686).toFixed(2);
    areaEl.textContent = acres > 0 ? `${acres} Acres (${ha} Ha)` : '0.00 Acres';
  }
  if (ptsEl) ptsEl.textContent = `${polygonPoints.length} points`;
  if (statusEl) statusEl.textContent = statusMsg;
  if (locEl && pendingPlace) locEl.textContent = `📍 ${pendingPlace}`;
}

let reverseT;
async function reverseGeocodeCentroid() {
  centroid = calculateCentroid(polygonPoints);
  if (!centroid) return;
  clearTimeout(reverseT);
  reverseT = setTimeout(async () => {
    try {
      const r = await api(`/api/geo/reverse?lat=${centroid.lat}&lon=${centroid.lon}`);
      pendingPlace = r.label || `${centroid.lat}, ${centroid.lon}`;
      pendingState = r.state || '';
      const locEl = document.getElementById('hudLocation');
      if (locEl) locEl.textContent = `📍 ${pendingPlace}`;
    } catch {
      pendingPlace = `${centroid.lat}, ${centroid.lon}`;
    }
  }, 400);
}

// Tool button actions
const closePolyBtn = document.getElementById('mapClosePolyBtn');
if (closePolyBtn) {
  closePolyBtn.onclick = () => {
    tryClosePolygon();
  };
}

document.getElementById('mapTileToggleBtn').onclick = () => {
  if (!fieldMap) return;
  if (isSatellite) {
    fieldMap.removeLayer(satelliteTileLayer);
    osmTileLayer.addTo(fieldMap);
    isSatellite = false;
    document.getElementById('mapTileToggleBtn').textContent = '🗺️ Street Map';
  } else {
    fieldMap.removeLayer(osmTileLayer);
    satelliteTileLayer.addTo(fieldMap);
    isSatellite = true;
    document.getElementById('mapTileToggleBtn').textContent = '🛰️ Satellite';
  }
};

document.getElementById('mapDrawToggleBtn').onclick = () => {
  isDrawingActive = !isDrawingActive;
  const btn = document.getElementById('mapDrawToggleBtn');
  btn.classList.toggle('active-tool', isDrawingActive);
  btn.textContent = isDrawingActive ? '✏️ Drawing Active' : '✋ Pan Map';
  const mapContainer = document.getElementById('fieldMap');
  if (mapContainer) {
    mapContainer.classList.toggle('is-drawing', isDrawingActive && !isPolygonClosed);
  }
  document.getElementById('hudStatus').textContent = isDrawingActive
    ? (isPolygonClosed ? 'Field polygon closed ✓ (drag corners to adjust)' : 'Click on map to add boundary points')
    : 'Drawing paused. Pan or zoom map freely.';
};

document.getElementById('mapUndoBtn').onclick = () => {
  if (!polygonPoints.length) return;
  if (isPolygonClosed) {
    isPolygonClosed = false;
    redrawPolygon();
    toast('↩️ Polygon re-opened. Click to add more corners or click start corner to close.');
    return;
  }
  polygonPoints.pop();
  redrawPolygon();
  reverseGeocodeCentroid();
};

document.getElementById('mapClearBtn').onclick = () => {
  if (!polygonPoints.length) return;
  if (!confirm('Clear all polygon boundary points?')) return;
  polygonPoints = [];
  isPolygonClosed = false;
  redrawPolygon();
  updateHUD(0, 'Click on map to place boundary points');
  const areaInput = document.getElementById('fieldAreaInput');
  if (areaInput) areaInput.value = '';
};

// GPS Button
document.getElementById('mapGpsBtn').onclick = () => {
  if (!navigator.geolocation) { toast('GPS not supported on this browser', 'err'); return; }
  const btn = document.getElementById('mapGpsBtn');
  btn.textContent = '⏳ Locating…';
  navigator.geolocation.getCurrentPosition(
    async ({ coords: { latitude: lat, longitude: lon } }) => {
      btn.textContent = '📍 GPS';
      ensureFieldMap();
      fieldMap.setView([lat, lon], 17);
      toast('✓ Located via GPS. Tap on map to draw field boundary.');
    },
    (err) => {
      btn.textContent = '📍 GPS';
      toast(err.message, 'err');
    },
    { enableHighAccuracy: true }
  );
};

// Location search with autocomplete
let searchT;
const searchInp = document.getElementById('mapSearchInput');
const searchOut = document.getElementById('mapSearchResults');

searchInp.oninput = (e) => {
  clearTimeout(searchT);
  const q = e.target.value.trim();
  if (q.length < 3) { searchOut.classList.add('hidden'); searchOut.innerHTML = ''; return; }
  searchT = setTimeout(async () => {
    try {
      const results = await api(`/api/geo/search?q=${encodeURIComponent(q)}`);
      if (!results.length) { searchOut.classList.add('hidden'); return; }
      searchOut.innerHTML = results.map((r, i) => `
        <button type="button" class="map-search-item" data-idx="${i}">
          ${esc(r.name)}, ${esc(r.district || '')} ${esc(r.state || '')}
        </button>
      `).join('');
      searchOut.classList.remove('hidden');

      searchOut.querySelectorAll('.map-search-item').forEach(b => {
        b.onclick = () => {
          const item = results[Number(b.dataset.idx)];
          searchOut.classList.add('hidden');
          searchInp.value = `${item.name}, ${item.district || item.state}`;
          ensureFieldMap();
          fieldMap.setView([item.lat, item.lon], 16);
          pendingPlace = `${item.name}, ${item.state}`;
          pendingState = item.state || '';
          updateHUD(calculatePolygonAreaAcres(polygonPoints), 'Location set. Tap on map to draw field boundary');
        };
      });
    } catch { searchOut.classList.add('hidden'); }
  }, 300);
};

// Populate Field Form from current profile
function populateFieldForm() {
  document.getElementById('fieldNameInput').value = farmProfile.name || '';
  if (farmProfile.crop) document.getElementById('fieldCropSelect').value = farmProfile.crop;
  document.getElementById('fieldSowDateInput').value = farmProfile.sowDate || '';
  document.getElementById('fieldAreaInput').value = farmProfile.area || '';
  document.getElementById('fieldSoilSelect').value = farmProfile.soilType || '';
  document.getElementById('fieldIrrigationSelect').value = farmProfile.irrigationType || '';
  if (farmProfile.place) {
    pendingPlace = farmProfile.place;
    pendingState = farmProfile.state || '';
    const locEl = document.getElementById('hudLocation');
    if (locEl) locEl.textContent = `📍 ${farmProfile.place}`;
  }
}

// Field Form Submit — Save Polygon & Farm
document.getElementById('fieldForm').onsubmit = async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveFieldBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Saving & Analyzing…';

  try {
    if (polygonPoints.length > 0) {
      if (polygonPoints.length < 3) {
        throw new Error('Please add at least 3 boundary corners to define your field polygon.');
      }
      if (!isPolygonClosed) {
        if (!canClosePolygonWithoutIntersection(polygonPoints)) {
          throw new Error('Cannot save: field boundary lines cross each other. Please adjust corners on the map before saving.');
        }
        isPolygonClosed = true;
        redrawPolygon();
      }
      if (hasAnySelfIntersection(polygonPoints, true)) {
        throw new Error('Cannot save: field boundary lines cross each other. Please adjust corners on the map before saving.');
      }
    }

    const areaVal = Number(document.getElementById('fieldAreaInput').value) || calculatePolygonAreaAcres(polygonPoints) || null;
    centroid = calculateCentroid(polygonPoints) || (farmProfile.lat ? { lat: farmProfile.lat, lon: farmProfile.lon } : null);

    if (!centroid && !polygonPoints.length) {
      throw new Error('Please click on the map or use GPS to set your farm location.');
    }

    const payload = {
      name: document.getElementById('fieldNameInput').value.trim() || `${currentUser?.name || 'My'}'s Field`,
      crop: document.getElementById('fieldCropSelect').value || 'wheat',
      sowDate: document.getElementById('fieldSowDateInput').value || null,
      area: areaVal,
      soilType: document.getElementById('fieldSoilSelect').value || '',
      irrigationType: document.getElementById('fieldIrrigationSelect').value || '',
      boundary: polygonPoints,
      lat: centroid ? centroid.lat : farmProfile.lat,
      lon: centroid ? centroid.lon : farmProfile.lon,
      place: pendingPlace || farmProfile.place || 'Field Location',
      state: pendingState || farmProfile.state || '',
    };

    const { farm } = await api('/api/profile/farm', { method: 'PUT', body: JSON.stringify(payload) });
    farmProfile = { ...farmProfile, ...farm };

    // Sync to localStorage so homepage (/) immediately has this farm & polygon
    const currentLocal = JSON.parse(localStorage.getItem('ks.profile') || '{}');
    localStorage.setItem('ks.profile', JSON.stringify({
      ...currentLocal,
      ...farm,
      sample: false,
    }));

    renderFarmBanner();
    populateSettingsForm();
    toast('✓ Field boundary & farm details saved successfully!');

    // Switch to snapshot and run analysis
    switchTab('snapshot');
    document.getElementById('runAnalysisBtn')?.click();

  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>💾 Save Field & Run Full Analysis →</span>';
  }
};

// ====== FARM SETTINGS TAB FORM ======
function populateSettingsForm() {
  document.getElementById('setFarmName').value = farmProfile.name || '';
  if (farmProfile.crop) document.getElementById('setFarmCrop').value = farmProfile.crop;
  document.getElementById('setFarmSowDate').value = farmProfile.sowDate || '';
  document.getElementById('setFarmArea').value = farmProfile.area || '';
  document.getElementById('setFarmSoil').value = farmProfile.soilType || '';
  document.getElementById('setFarmIrrigation').value = farmProfile.irrigationType || '';
  document.getElementById('setAlertPhone').value = currentUser?.alertChannels?.phone || '';
  document.getElementById('setTelegramId').value = currentUser?.alertChannels?.telegramChatId || '';
}

document.getElementById('analysisSettingsForm').onsubmit = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = '⏳ Saving…';

  try {
    const farmUpdates = {
      name: document.getElementById('setFarmName').value.trim(),
      crop: document.getElementById('setFarmCrop').value,
      sowDate: document.getElementById('setFarmSowDate').value || null,
      area: Number(document.getElementById('setFarmArea').value) || null,
      soilType: document.getElementById('setFarmSoil').value,
      irrigationType: document.getElementById('setFarmIrrigation').value,
    };
    const alertUpdates = {
      phone: document.getElementById('setAlertPhone').value.trim() || null,
      telegramChatId: document.getElementById('setTelegramId').value.trim() || null,
    };

    const { farm } = await api('/api/profile/farm', { method: 'PUT', body: JSON.stringify(farmUpdates) });
    await api('/api/profile/alerts', { method: 'PUT', body: JSON.stringify(alertUpdates) }).catch(() => {});

    farmProfile = { ...farmProfile, ...farm };
    if (currentUser) {
      currentUser.farm = farm;
      currentUser.alertChannels = { ...currentUser.alertChannels, ...alertUpdates };
    }

    // Sync to localStorage
    const currentLocal = JSON.parse(localStorage.getItem('ks.profile') || '{}');
    localStorage.setItem('ks.profile', JSON.stringify({ ...currentLocal, ...farm, sample: false }));

    renderFarmBanner();
    populateFieldForm();
    toast('✓ Settings updated successfully');

    // Re-run snapshot if on snapshot
    document.getElementById('runAnalysisBtn')?.click();

  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Save Settings';
  }
};

// ====== RUN ANALYSIS ======
const WMO = (c) => c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 67 ? '🌧️' : c <= 77 ? '🌨️' : '⛈️';
const riskColor = (score) => score >= 70 ? 'var(--crit)' : score >= 40 ? 'var(--adv)' : 'var(--ok)';
const riskLevel = (score) => score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

document.getElementById('runAnalysisBtn').onclick = async () => {
  if (!farmProfile.lat || !farmProfile.lon) {
    toast('Please set farm location or draw field polygon first', 'err');
    switchTab('field');
    return;
  }
  const btn = document.getElementById('runAnalysisBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="btn-ico">⏳</span> Analyzing…';
  document.getElementById('analysisEmpty').style.display = 'none';

  const out = document.getElementById('analysisOut');
  out.classList.remove('hidden');
  out.innerHTML = `
    <div class="analysis-grid">
      ${Array(6).fill(`<div class="ana-card skeleton" style="height:180px"></div>`).join('')}
    </div>`;

  try {
    const q = new URLSearchParams({
      lat: farmProfile.lat, lon: farmProfile.lon,
      crop: farmProfile.crop || 'wheat',
    });
    if (farmProfile.sowDate) q.set('sow', farmProfile.sowDate);

    const snap = await api(`/api/snapshot?${q}`);
    renderAnalysis(snap);

    // Save to history
    const yr = snap.predictions?.yield_risk;
    await api('/api/profile/analysis', {
      method: 'POST',
      body: JSON.stringify({
        type: 'snapshot',
        crop: farmProfile.crop || 'wheat',
        place: snap.location?.label || farmProfile.place || '',
        summary: `${snap.alerts?.length || 0} alerts · yield risk ${yr?.score ?? '?'}`,
        riskLevel: yr ? riskLevel(yr.score) : 'low',
        riskScore: yr?.score ?? null,
      }),
    }).catch(() => {});

  } catch (e) {
    out.innerHTML = `<div style="padding:24px;text-align:center;color:var(--error)">⚠️ ${esc(e.message)}</div>`;
    toast(e.message, 'err');
  }

  btn.disabled = false;
  btn.innerHTML = '<span class="btn-ico">▶</span> Run Analysis';
};

function renderAnalysis(s) {
  const out = document.getElementById('analysisOut');
  const c = s.current, p = s.predictions, yr = p.yield_risk, ir = p.irrigation;
  const dep = ir?.depletion_pct ?? 0;

  // Farm tags
  const farmTags = [];
  if (farmProfile.soilType) farmTags.push(`🌱 ${capFirst(farmProfile.soilType)} soil`);
  if (farmProfile.irrigationType) farmTags.push(`💧 ${capFirst(farmProfile.irrigationType)}`);
  if (farmProfile.area) farmTags.push(`📐 ${farmProfile.area} acres`);
  if (farmProfile.boundary?.length) farmTags.push(`🗺️ Polygon mapped (${farmProfile.boundary.length} vertices)`);

  out.innerHTML = `
    ${farmTags.length ? `<div class="soil-badges">${farmTags.map(t => `<span class="soil-badge">${t}</span>`).join('')}</div>` : ''}
    
    <div class="analysis-grid">

      <!-- Yield Risk -->
      <div class="ana-card">
        <div class="ana-card-header">
          <div class="ana-card-title">📊 Yield Risk</div>
          ${s.crop?.stage ? `<span style="font-size:0.75rem;color:var(--muted)">${esc(s.crop.en)} · Day ${s.crop.stage.das || '?'}</span>` : ''}
        </div>
        ${yr ? `
          <div class="risk-display">
            <div class="risk-score" style="color:${riskColor(yr.score)}">${yr.score}</div>
            <div>
              <div class="risk-badge ${riskLevel(yr.score)}">${yr.level || riskLevel(yr.score)}</div>
              <div style="margin-top:8px;font-size:0.8rem;color:var(--muted)">out of 100</div>
            </div>
          </div>
          <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px">
            ${Object.entries(yr.factors || {}).filter(([,v]) => v > 0).map(([k,v]) =>
              `<span class="soil-badge" style="background:rgba(248,113,113,0.1);border-color:rgba(248,113,113,0.2);color:var(--error)">+${v} ${k}</span>`
            ).join('') || '<span class="soil-badge">No stress factors detected</span>'}
          </div>
        ` : `<p style="color:var(--muted)">Risk data unavailable</p>`}
      </div>

      <!-- Current Weather -->
      <div class="ana-card">
        <div class="ana-card-header">
          <div class="ana-card-title">🌤️ Current Weather</div>
          <span style="font-size:0.75rem;color:var(--muted)">${esc(s.location?.label || '')}</span>
        </div>
        <div class="wx-row">
          <div style="font-size:2.2rem">${WMO(c.weather_code)}</div>
          <div class="wx-temp">${Math.round(c.temperature_2m)}°C</div>
          <div class="wx-meta-mini">
            <span>💧 ${c.relative_humidity_2m}% RH</span>
            <span>💨 ${Math.round(c.wind_speed_10m)} km/h</span>
            <span>🌧️ ${c.precipitation} mm</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px;overflow-x:auto">
          ${s.daily.slice(0, 5).map(d => `
            <div style="text-align:center;min-width:44px;font-size:0.78rem">
              <div style="color:var(--muted)">${new Date(d.date+'T00:00').toLocaleDateString('en-IN',{weekday:'short'})}</div>
              <div style="font-size:1.1rem">${WMO(d.code)}</div>
              <div style="font-weight:700">${Math.round(d.tmax)}°</div>
              ${d.rain >= 0.5 ? `<div style="color:var(--ink-2);font-size:0.7rem">${Math.round(d.rain)}mm</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Disease Risk -->
      <div class="ana-card">
        <div class="ana-card-header">
          <div class="ana-card-title">🦠 Disease & Pest Risk (72h)</div>
        </div>
        <div class="disease-bar-row">
          ${p.disease_risk.map(d => `
            <div class="d-bar">
              <div class="d-bar-header">
                <span>${esc(d.name)}</span>
                <span style="font-weight:700;color:${riskColor(d.score)}">${d.score}</span>
              </div>
              <div class="d-bar-track">
                <div class="d-bar-fill" style="width:${d.score}%;background:${riskColor(d.score)}"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Irrigation Need -->
      <div class="ana-card">
        <div class="ana-card-header">
          <div class="ana-card-title">💧 Irrigation Recommendation</div>
          <span style="font-size:0.75rem;color:var(--muted)">MAD 50%</span>
        </div>
        <div class="irr-meter">
          <div class="irr-bar">
            <div class="irr-fill" style="width:${Math.min(100, dep)}%;background:${dep >= 60 ? 'var(--crit)' : dep >= 40 ? 'var(--adv)' : 'var(--ok)'}"></div>
          </div>
          <div class="irr-lbls">
            <span>Soil Depletion</span>
            <span style="font-weight:700">${dep}%</span>
          </div>
        </div>
        <div style="font-size:0.875rem;line-height:1.4">
          ${ir?.urgency === 'urgent' ? '🔴 <b>Irrigation urgently needed</b> — root-zone moisture below threshold.' :
            ir?.urgency === 'soon' ? '🟡 <b>Irrigation recommended in 48h</b>.' :
            '🟢 <b>Soil moisture optimal</b> — no irrigation needed right now.'}
        </div>
      </div>

      <!-- Spray Windows -->
      <div class="ana-card">
        <div class="ana-card-header">
          <div class="ana-card-title">🚜 Spray Windows (72h)</div>
        </div>
        <div>
          ${p.spray_windows.length ? p.spray_windows.slice(0, 3).map(w => `
            <div class="spray-window">
              <b>${new Date(w.start).toLocaleDateString('en-IN', {weekday:'short'})} ${new Date(w.start).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})}</b> → ${new Date(w.end).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})}
              <div class="muted" style="font-size:0.78rem">Wind: ${w.avg_wind_kmh} km/h · ${w.hours}h safe</div>
            </div>
          `).join('') : '<p class="muted">No safe spray window in next 72h (high winds or rain expected).</p>'}
        </div>
      </div>

      <!-- Satellite NDVI Canopy -->
      <div class="ana-card">
        <div class="ana-card-header">
          <div class="ana-card-title">🛰️ Satellite NDVI Health</div>
        </div>
        ${s.ndvi ? `
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px">
            <div style="font-size:2rem;font-weight:800;color:var(--brand-light)">${s.ndvi.latest.ndvi}</div>
            <div>
              <div style="font-weight:600">${esc(s.ndvi.health)}</div>
              <div class="muted" style="font-size:0.78rem">${esc(s.ndvi.trend)}</div>
            </div>
          </div>
          ${renderNdviSvg(s.ndvi.series)}
        ` : '<p class="muted">NASA MODIS satellite data unavailable for this coordinate.</p>'}
      </div>

    </div>
  `;
}

function renderNdviSvg(pts) {
  if (!pts || pts.length < 2) return '';
  const W = 280, H = 55, mn = 0.1, mx = 0.9;
  const x = (i) => (i / (pts.length - 1)) * (W - 10) + 5;
  const y = (n) => H - 5 - ((Math.max(mn, Math.min(mx, n)) - mn) / (mx - mn)) * (H - 10);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.ndvi).toFixed(1)}`).join('');
  return `
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
    <path d="${path}" fill="none" stroke="var(--brand-light)" stroke-width="2"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.ndvi)}" r="3" fill="var(--brand-light)"/>`).join('')}
  </svg>`;
}

// ====== MANDI ======
document.getElementById('fetchMandiBtn').onclick = async () => {
  const crop = document.getElementById('mandiCrop').value;
  const state = document.getElementById('mandiState').value;
  const btn = document.getElementById('fetchMandiBtn');
  btn.disabled = true; btn.textContent = '⏳ Loading…';
  const out = document.getElementById('mandiOut');
  out.innerHTML = '<div class="loading-state">Loading APMC mandi prices…</div>';
  try {
    const q = new URLSearchParams({ crop, state });
    const m = await api(`/api/mandi?${q}`);
    renderMandi(m, crop);
  } catch (e) {
    out.innerHTML = `<div style="padding:20px;color:var(--error)">⚠️ ${esc(e.message)}</div>`;
    toast(e.message, 'err');
  }
  btn.disabled = false; btn.textContent = 'Fetch Prices';
};

function renderMandi(m, crop) {
  const out = document.getElementById('mandiOut');
  const sm = m.summary;
  if (!sm) { out.innerHTML = '<div class="no-history">No mandi data available for this crop and state.</div>'; return; }
  const tr = m.trend?.change_pct;
  const bannerHtml = m.notice ? `
    <div style="background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.3);border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:0.82rem;color:#fde047;display:flex;align-items:center;gap:8px;">
      <span>ℹ️</span> <span>${esc(m.notice)}</span>
    </div>
  ` : '';
  out.innerHTML = `
    ${bannerHtml}
    <div class="mandi-stats">
      <div class="mandi-stat"><small>Average Modal</small><b>₹${sm.avg_modal.toLocaleString('en-IN')}</b><div class="sub">per quintal · ${sm.markets} markets</div></div>
      <div class="mandi-stat"><small>Best Market</small><b>₹${sm.best.modal.toLocaleString('en-IN')}</b><div class="sub">${esc(sm.best.market)}</div></div>
      <div class="mandi-stat"><small>MSP</small><b>${sm.msp ? `₹${sm.msp.toLocaleString('en-IN')}` : '—'}</b><div class="sub">Govt MSP benchmark</div></div>
      <div class="mandi-stat"><small>Price Trend</small><b>${tr == null ? '—' : `${tr > 0 ? '▲' : '▼'} ${Math.abs(tr)}%`}</b><div class="sub">${m.trend?.days || 0} days recorded</div></div>
    </div>
    <div class="mandi-table-wrap">
      <table class="mandi-table">
        <thead><tr><th>Market</th><th>District</th><th>Variety</th><th class="num">Min</th><th class="num">Max</th><th class="num">Modal</th><th>Date</th></tr></thead>
        <tbody>
          ${[...m.records].sort((a,b) => b.modal - a.modal).map((r, i) => `
            <tr class="${i === 0 ? 'best' : ''}">
              <td>${esc(r.market)}</td><td>${esc(r.district)}</td><td>${esc(r.variety)}</td>
              <td class="num">${r.min}</td><td class="num">${r.max}</td><td class="num"><b>${r.modal}</b></td>
              <td>${esc(r.date)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ====== HISTORY ======
async function loadHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '<div class="loading-state">⏳ Loading…</div>';
  try {
    const { history } = await api('/api/profile/analysis');
    if (!history.length) {
      list.innerHTML = '<div class="no-history">No analysis history yet. Run an analysis to save results.</div>';
      return;
    }
    list.innerHTML = history.map(h => `
      <div class="history-entry" id="he-${h._id}">
        <span class="history-type-badge ${h.type}">${h.type}</span>
        <div class="history-entry-info">
          <div class="title">${esc(h.crop || '')} — ${esc(h.place || 'Field Location')}</div>
          <div class="subtitle">${esc(h.summary || '')}</div>
        </div>
        <div class="history-entry-meta">
          ${h.riskLevel ? `<div class="risk ${h.riskLevel}">${h.riskLevel}</div>` : ''}
          <div class="date">${new Date(h.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <button class="del-btn" onclick="deleteHistory('${h._id}')" title="Delete">🗑️</button>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<div class="no-history" style="color:var(--error)">⚠️ ${esc(e.message)}</div>`;
  }
}

async function deleteHistory(id) {
  try {
    await api(`/api/profile/analysis/${id}`, { method: 'DELETE' });
    document.getElementById(`he-${id}`)?.remove();
    const list = document.getElementById('historyList');
    if (!list.children.length) list.innerHTML = '<div class="no-history">No history yet.</div>';
    toast('✓ Entry deleted');
  } catch (e) {
    toast(e.message, 'err');
  }
}
window.deleteHistory = deleteHistory;

document.getElementById('clearHistoryBtn').onclick = async () => {
  if (!confirm('Clear all analysis history?')) return;
  const { history } = await api('/api/profile/analysis').catch(() => ({ history: [] }));
  await Promise.all(history.map(h => api(`/api/profile/analysis/${h._id}`, { method: 'DELETE' }).catch(() => {})));
  document.getElementById('historyList').innerHTML = '<div class="no-history">History cleared.</div>';
  toast('✓ History cleared');
};

// Logout
document.getElementById('logoutBtn').onclick = async () => {
  if (!confirm('Are you sure you want to log out?')) return;
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem('ks_token');
  localStorage.removeItem('ks_user');
  window.location.href = '/login?msg=logged_out';
};

// Boot
(async () => {
  const token = getToken();
  if (!token) {
    window.location.href = '/login?redirect=/analysis&msg=analysis';
    return;
  }
  await loadCrops();
  await loadUserAndBanner();
})();
