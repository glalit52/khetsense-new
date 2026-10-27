// KhetiSense Profile/Settings page logic
const toast = (msg, type = 'ok') => {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.borderColor = type === 'err' ? 'rgba(248,113,113,0.4)' : 'rgba(22,163,74,0.4)';
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 3000);
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

// Section navigation
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.side-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`section-${name}`).classList.add('active');
  document.getElementById(`nav-${name}`).classList.add('active');
}

// Load & populate user profile
let currentUser = null;

async function loadProfile() {
  try {
    const { user } = await api('/api/profile');
    currentUser = user;
    populateAccount(user);
    populateFarm(user.farm || {});
    populateAlerts(user.alertChannels || {});
  } catch (e) {
    if (e.message.includes('401') || e.message.includes('authenticated') || e.message.includes('expired')) {
      localStorage.removeItem('ks_token');
      localStorage.removeItem('ks_user');
      window.location.href = '/login?redirect=/profile&msg=profile';
      return;
    }
    toast(e.message, 'err');
  }
}

function populateAccount(user) {
  document.getElementById('accName').value = user.name || '';
  document.getElementById('accPhone').value = user.phone || '';
  document.getElementById('accEmail').value = user.email || '';
  document.getElementById('accLang').value = user.lang || 'hi';
  document.getElementById('avatarDisplay').textContent = (user.name || 'U').charAt(0).toUpperCase();
  document.getElementById('avatarName').textContent = user.name || 'User';
  document.getElementById('avatarEmail').textContent = user.email || '';
  
  // Header badge
  const hAvatar = document.getElementById('headerAvatar');
  const hName = document.getElementById('headerUserName');
  if (hAvatar) hAvatar.textContent = (user.name || 'U').charAt(0).toUpperCase();
  if (hName) hName.textContent = user.name ? user.name.split(' ')[0] : 'Farmer';
}

function populateFarm(farm) {
  document.getElementById('farmName').value = farm.name || '';
  document.getElementById('farmArea').value = farm.area || '';
  document.getElementById('farmPlace').value = farm.place || '';
  document.getElementById('farmLat').value = farm.lat || '';
  document.getElementById('farmLon').value = farm.lon || '';
  document.getElementById('farmSowDate').value = farm.sowDate || '';
  document.getElementById('farmSoilType').value = farm.soilType || '';
  document.getElementById('farmIrrigationType').value = farm.irrigationType || '';
  document.getElementById('farmFarmingType').value = farm.farmingType || '';
  document.getElementById('farmNotes').value = farm.notes || '';
  updateCoordsBanner(farm);
}

function populateAlerts(channels) {
  document.getElementById('alertPhone').value = channels.phone || '';
  document.getElementById('alertWhatsapp').checked = !!channels.whatsapp;
  document.getElementById('alertTelegram').value = channels.telegramChatId || '';
}

function updateCoordsBanner(farm) {
  const el = document.getElementById('farmCoordsText');
  if (farm.lat && farm.lon) {
    el.textContent = `${farm.place || 'Custom location'} · ${farm.lat}, ${farm.lon}`;
  } else {
    el.textContent = 'No location set — go to Dashboard to pick from map';
  }
}

// Load crops from config
async function loadCrops() {
  try {
    const { crops } = await api('/api/config');
    const sel = document.getElementById('farmCrop');
    sel.innerHTML = '<option value="">Select crop</option>' +
      crops.map(c => `<option value="${c.id}">${c.hi} — ${c.en}</option>`).join('');
    if (currentUser?.farm?.crop) sel.value = currentUser.farm.crop;
  } catch { /* fallback */ }
}

// Load channel server status
async function loadChannelStatus() {
  try {
    const { channels } = await api('/api/config');
    document.getElementById('channelStatus').textContent =
      `SMS ${channels.sms ? '✓' : '✗'} · WhatsApp ${channels.whatsapp ? '✓' : '✗'} · Telegram ${channels.telegram ? '✓' : '✗'} · Browser ✓`;
  } catch {
    document.getElementById('channelStatus').textContent = 'Unable to load';
  }
}

// ====== Form submissions ======

document.getElementById('accountForm').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const { user } = await api('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('accName').value,
        phone: document.getElementById('accPhone').value,
        lang: document.getElementById('accLang').value,
      }),
    });
    currentUser = user;
    localStorage.setItem('ks_user', JSON.stringify(user));
    populateAccount(user);
    toast('✓ Account saved');
  } catch (e) {
    toast(e.message, 'err');
  }
};

document.getElementById('farmForm').onsubmit = async (e) => {
  e.preventDefault();
  const farm = {
    name: document.getElementById('farmName').value,
    area: Number(document.getElementById('farmArea').value) || null,
    place: document.getElementById('farmPlace').value,
    lat: Number(document.getElementById('farmLat').value) || null,
    lon: Number(document.getElementById('farmLon').value) || null,
    crop: document.getElementById('farmCrop').value,
    sowDate: document.getElementById('farmSowDate').value || null,
    soilType: document.getElementById('farmSoilType').value,
    irrigationType: document.getElementById('farmIrrigationType').value,
    farmingType: document.getElementById('farmFarmingType').value,
    notes: document.getElementById('farmNotes').value,
  };
  try {
    const { user } = await api('/api/profile', { method: 'PUT', body: JSON.stringify({ farm }) });
    currentUser = user;
    localStorage.setItem('ks_user', JSON.stringify(user));
    // Also sync to ks.profile in localStorage so the main dashboard picks it up
    const existing = JSON.parse(localStorage.getItem('ks.profile') || '{}');
    localStorage.setItem('ks.profile', JSON.stringify({
      ...existing,
      lat: farm.lat, lon: farm.lon, place: farm.place,
      crop: farm.crop, sowDate: farm.sowDate, area: farm.area,
      soilType: farm.soilType, irrigationType: farm.irrigationType,
    }));
    updateCoordsBanner(user.farm || {});
    toast('✓ Farm details saved');
  } catch (err) {
    toast(err.message, 'err');
  }
};

document.getElementById('alertsForm').onsubmit = async (e) => {
  e.preventDefault();
  const alertChannels = {
    phone: document.getElementById('alertPhone').value.trim() || null,
    whatsapp: document.getElementById('alertWhatsapp').checked,
    telegramChatId: document.getElementById('alertTelegram').value.trim() || null,
  };
  try {
    await api('/api/profile', { method: 'PUT', body: JSON.stringify({ alertChannels }) });
    toast('✓ Alert channels saved');
  } catch (err) {
    toast(err.message, 'err');
  }
};

document.getElementById('passwordForm').onsubmit = async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('pwdError');
  errEl.classList.add('hidden');
  const current = document.getElementById('pwdCurrent').value;
  const next = document.getElementById('pwdNew').value;
  const confirm = document.getElementById('pwdConfirm').value;
  if (next !== confirm) {
    errEl.textContent = 'New passwords do not match.';
    errEl.classList.remove('hidden');
    return;
  }
  try {
    await api('/api/profile/password', { method: 'PUT', body: JSON.stringify({ current, next }) });
    document.getElementById('passwordForm').reset();
    toast('✓ Password changed successfully');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
};

// GPS for farm location
document.getElementById('gpsBtn2').onclick = () => {
  if (!navigator.geolocation) { toast('GPS not supported', 'err'); return; }
  document.getElementById('gpsBtn2').textContent = '⏳ Locating…';
  navigator.geolocation.getCurrentPosition(
    async ({ coords: { latitude: lat, longitude: lon } }) => {
      document.getElementById('farmLat').value = lat.toFixed(4);
      document.getElementById('farmLon').value = lon.toFixed(4);
      try {
        const r = await api(`/api/geo/reverse?lat=${lat}&lon=${lon}`);
        document.getElementById('farmPlace').value = r.label || '';
        document.getElementById('farmCoordsText').textContent = `${r.label || 'GPS location'} · ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      } catch { document.getElementById('farmPlace').value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`; }
      document.getElementById('gpsBtn2').textContent = '📍 GPS';
    },
    (err) => { toast(err.message, 'err'); document.getElementById('gpsBtn2').textContent = '📍 GPS'; },
    { enableHighAccuracy: true }
  );
};

// Logout
const handleLogout = async () => {
  if (!confirm('Are you sure you want to log out?')) return;
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem('ks_token');
  localStorage.removeItem('ks_user');
  window.location.href = '/login?msg=logged_out';
};
const lBtn = document.getElementById('logoutBtn');
const lAllBtn = document.getElementById('logoutAllBtn');
if (lBtn) lBtn.onclick = handleLogout;
if (lAllBtn) lAllBtn.onclick = handleLogout;

// Boot
(async () => {
  const token = getToken();
  if (!token) {
    window.location.href = '/login?redirect=/profile&msg=profile';
    return;
  }
  await loadProfile();
  await Promise.all([loadCrops(), loadChannelStatus()]);
  // Set crop selector after crops loaded
  if (currentUser?.farm?.crop) {
    document.getElementById('farmCrop').value = currentUser.farm.crop;
  }
  // Check section param (e.g. ?section=farm)
  const sec = new URLSearchParams(window.location.search).get('section');
  if (sec && ['account', 'farm', 'alerts', 'security'].includes(sec)) {
    showSection(sec);
  }
})();
