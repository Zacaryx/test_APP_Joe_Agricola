/* ════════════════════════════════════════════
   AGROCONTROL — app.js
   Vanilla JS — Web Bluetooth API
   ════════════════════════════════════════════ */
/* ════════════════════════════════════════════
   AGROCONTROL — app.js
   Vanilla JS — Web Bluetooth API
   ════════════════════════════════════════════ */

'use strict';

// ──────────────────────────────────────────
// Bluetooth UUIDs (ESP32 custom service)
// ──────────────────────────────────────────
const BT_SERVICE_UUID      = '12345678-1234-1234-1234-123456789abc';
const BT_CHAR_DATA_UUID    = '12345678-1234-1234-1234-123456789001';
const BT_CHAR_PROFILE_UUID = '12345678-1234-1234-1234-123456789002';
const BT_CHAR_SELECT_UUID  = '12345678-1234-1234-1234-123456789003';

// ──────────────────────────────────────────
// App State
// ──────────────────────────────────────────
const state = {
  mode: null,
  activeProfile: null,
  profiles: [],
  btDevice: null,
  btServer: null,
  btService: null,
  btDataChar: null,
  monitorInterval: null,
  editingIndex: null,
  alertPending: false,
  // tracks the currently-bound "start monitor" handler so we can remove it
  _startMonitorHandler: null,
};

// ──────────────────────────────────────────
// Default Profiles (10 initial)
// ──────────────────────────────────────────
const DEFAULT_PROFILES = [
  { nombre: 'Tomate',    tempMax: 28, tempMin: 20, humMin: 50, phMin: 6.0, phMax: 6.8 },
  { nombre: 'Lechuga',   tempMax: 22, tempMin: 15, humMin: 60, phMin: 6.0, phMax: 7.0 },
  { nombre: 'Maíz',      tempMax: 30, tempMin: 18, humMin: 40, phMin: 5.8, phMax: 7.0 },
  { nombre: 'Papa',      tempMax: 20, tempMin: 10, humMin: 70, phMin: 4.8, phMax: 6.0 },
  { nombre: 'Fresa',     tempMax: 26, tempMin: 15, humMin: 55, phMin: 5.5, phMax: 6.5 },
  { nombre: 'Zanahoria', tempMax: 24, tempMin: 10, humMin: 50, phMin: 6.0, phMax: 6.8 },
  { nombre: 'Espinaca',  tempMax: 20, tempMin:  5, humMin: 65, phMin: 6.0, phMax: 7.5 },
  { nombre: 'Pepino',    tempMax: 30, tempMin: 20, humMin: 60, phMin: 5.5, phMax: 7.0 },
  { nombre: 'Cebolla',   tempMax: 28, tempMin: 13, humMin: 45, phMin: 6.0, phMax: 7.0 },
  { nombre: 'Pimiento',  tempMax: 32, tempMin: 18, humMin: 55, phMin: 6.0, phMax: 6.8 },
];

// ──────────────────────────────────────────
// Debug "Recibir" plant database (fictional)
// ──────────────────────────────────────────
const DEBUG_PLANTS = [
  { nombre: 'Alfa-1',  tempMax: 28, tempMin: 20, humMin: 50, phMin: 6.0, phMax: 6.8 },
  { nombre: 'Beta-2',  tempMax: 25, tempMin: 15, humMin: 60, phMin: 5.5, phMax: 7.0 },
  { nombre: 'Gamma-3', tempMax: 30, tempMin: 18, humMin: 45, phMin: 6.2, phMax: 7.2 },
  { nombre: 'Delta-4', tempMax: 22, tempMin: 10, humMin: 70, phMin: 5.0, phMax: 6.5 },
];

// ──────────────────────────────────────────
// LocalStorage helpers
// ──────────────────────────────────────────
function loadProfiles() {
  try {
    const stored = localStorage.getItem('agrocontrol_profiles');
    if (stored) {
      state.profiles = JSON.parse(stored);
    } else {
      state.profiles = DEFAULT_PROFILES.map(p => ({ ...p }));
      saveProfiles();
    }
  } catch {
    state.profiles = DEFAULT_PROFILES.map(p => ({ ...p }));
  }
}

function saveProfiles() {
  localStorage.setItem('agrocontrol_profiles', JSON.stringify(state.profiles));
}

// ──────────────────────────────────────────
// View Navigation
// ──────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ──────────────────────────────────────────
// Sensor Data Validation
// ──────────────────────────────────────────
function validateData(data, profile) {
  const alerts = [];
  if (data.temp > profile.tempMax) alerts.push(`Temperatura ${data.temp}°C > máx ${profile.tempMax}°C`);
  if (data.temp < profile.tempMin) alerts.push(`Temperatura ${data.temp}°C < mín ${profile.tempMin}°C`);
  if (data.hum  < profile.humMin)  alerts.push(`Humedad ${data.hum}% < mín ${profile.humMin}%`);
  if (data.ph   < profile.phMin)   alerts.push(`pH ${data.ph} < mín ${profile.phMin}`);
  if (data.ph   > profile.phMax)   alerts.push(`pH ${data.ph} > máx ${profile.phMax}`);
  return alerts;
}

// ──────────────────────────────────────────
// Monitor: update UI with new data
// ──────────────────────────────────────────
function updateMonitor(data) {
  const p = state.activeProfile;

  const tempOk = data.temp >= p.tempMin && data.temp <= p.tempMax;
  const humOk  = data.hum  >= p.humMin;
  const phOk   = data.ph   >= p.phMin  && data.ph   <= p.phMax;

  setMetric('card-temp', 'val-temp', data.temp.toFixed(1), 'range-temp', `${p.tempMin}–${p.tempMax} °C`, tempOk);
  setMetric('card-hum',  'val-hum',  data.hum.toFixed(0),  'range-hum',  `mín ${p.humMin}%`,            humOk);
  setMetric('card-ph',   'val-ph',   data.ph.toFixed(1),   'range-ph',   `${p.phMin}–${p.phMax}`,       phOk);

  const allOk      = tempOk && humOk && phOk;
  const statusCard = document.getElementById('card-status');
  const statusText = document.getElementById('val-status');
  statusCard.classList.toggle('safe',   allOk);
  statusCard.classList.toggle('danger', !allOk);
  statusText.textContent = allOk ? '✓ NORMAL' : '⚠ FUERA DE RANGO';

  const ts  = new Date().toLocaleTimeString('es-PE', { hour12: false });
  const cls = allOk ? 'log-ok' : 'log-danger';
  const msg = allOk
    ? `T:${data.temp.toFixed(1)}°C  H:${data.hum.toFixed(0)}%  pH:${data.ph.toFixed(1)}`
    : `⚠ T:${data.temp.toFixed(1)}°C  H:${data.hum.toFixed(0)}%  pH:${data.ph.toFixed(1)}`;
  addLog(ts, msg, cls);

  if (!allOk && !state.alertPending) {
    triggerAlert(validateData(data, p));
  }
}

function setMetric(cardId, valId, value, rangeId, rangeText, isOk) {
  document.getElementById(valId).textContent  = value;
  document.getElementById(rangeId).textContent = rangeText;
  const card = document.getElementById(cardId);
  card.classList.toggle('safe',   isOk);
  card.classList.toggle('danger', !isOk);
}

// ──────────────────────────────────────────
// Event Log
// ──────────────────────────────────────────
function addLog(time, msg, cls = '') {
  const log = document.getElementById('event-log');
  const li  = document.createElement('li');
  if (cls) li.classList.add(cls);
  li.innerHTML = `<span class="log-time">${time}</span><span>${msg}</span>`;
  log.prepend(li);
  while (log.children.length > 80) log.removeChild(log.lastChild);
}

// ──────────────────────────────────────────
// Alert Modal
// ──────────────────────────────────────────
function triggerAlert(messages) {
  state.alertPending = true;
  document.getElementById('alert-title').textContent = '¡Alerta de Cultivo!';
  document.getElementById('alert-msg').textContent   = messages.join('\n');
  document.getElementById('alert-overlay').classList.remove('hidden');
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
}

document.getElementById('btn-dismiss-alert').addEventListener('click', () => {
  document.getElementById('alert-overlay').classList.add('hidden');
  state.alertPending = false;
});

// ──────────────────────────────────────────
// Random Data Generators
// ──────────────────────────────────────────
function genSafeData(profile) {
  const m = 0.15;
  const tr = profile.tempMax - profile.tempMin;
  const pr = profile.phMax   - profile.phMin;
  return {
    temp: +(profile.tempMin + tr * (m + Math.random() * (1 - 2 * m))).toFixed(1),
    hum:  +(profile.humMin  + Math.random() * 20).toFixed(0),
    ph:   +(profile.phMin   + pr * (m + Math.random() * (1 - 2 * m))).toFixed(1),
  };
}

function genSemiRandomData(profile) {
  if (Math.random() >= 0.25) return genSafeData(profile);
  const base = genSafeData(profile);
  const type = Math.floor(Math.random() * 3);
  if (type === 0) base.temp = +(profile.tempMax + 1 + Math.random() * 4).toFixed(1);
  if (type === 1) base.hum  = +(profile.humMin  - 1 - Math.random() * 15).toFixed(0);
  if (type === 2) base.ph   = Math.random() < 0.5
    ? +(profile.phMin - 0.5 - Math.random()).toFixed(1)
    : +(profile.phMax + 0.5 + Math.random()).toFixed(1);
  return base;
}

// ──────────────────────────────────────────
// Start / Stop Monitor
// ──────────────────────────────────────────
function startMonitor(dataSourceFn) {
  document.getElementById('live-dot').classList.add('active');
  clearInterval(state.monitorInterval);
  updateMonitor(dataSourceFn());
  state.monitorInterval = setInterval(() => updateMonitor(dataSourceFn()), 5000);
}

function stopMonitor() {
  clearInterval(state.monitorInterval);
  state.monitorInterval = null;
  document.getElementById('live-dot').classList.remove('active');
}

function setMonitorHeader(modeLabel, profileName) {
  document.getElementById('monitor-mode-pill').textContent    = modeLabel;
  document.getElementById('monitor-profile-pill').textContent = profileName;
}

// ──────────────────────────────────────────
// MODE: Debug Sin Conexión
// ──────────────────────────────────────────
function startDebugSin(profile) {
  state.activeProfile = profile;
  setMonitorHeader('SIN CONEXIÓN', profile.nombre);
  showView('view-monitor');
  document.getElementById('event-log').innerHTML = '';
  startMonitor(() => genSemiRandomData(profile));
}

// ──────────────────────────────────────────
// MODE: Debug Recibir
// ──────────────────────────────────────────
function startDebugRecibir(profile) {
  state.activeProfile = profile;
  setMonitorHeader('DEBUG RECIBIR', profile.nombre);
  showView('view-monitor');
  document.getElementById('event-log').innerHTML = '';
  startMonitor(() => genSafeData(profile));
}

// ──────────────────────────────────────────
// MODE: Debug Dar
// ──────────────────────────────────────────
async function startDebugDar() {
  updateConnectStatus('Iniciando…', 'Buscando dispositivo receptor…');
  try {
    if (!navigator.bluetooth) throw new Error('Web Bluetooth no disponible');
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [BT_SERVICE_UUID] }],
    });
    device.addEventListener('gattserverdisconnected', () => onBtDisconnect('Debug Dar'));
    const server  = await device.gatt.connect();
    const service = await server.getPrimaryService(BT_SERVICE_UUID);
    state.btDevice = device; state.btServer = server; state.btService = service;
    updateConnectStatus('Conectado', 'Enviando perfiles…', 'ok');

    const profileChar = await service.getCharacteristic(BT_CHAR_PROFILE_UUID);
    await profileChar.writeValue(new TextEncoder().encode(JSON.stringify(state.profiles.slice(0, 10))));

    const selectChar = await service.getCharacteristic(BT_CHAR_SELECT_UUID);
    await selectChar.startNotifications();
    selectChar.addEventListener('characteristicvaluechanged', async (ev) => {
      const idx     = parseInt(new TextDecoder().decode(ev.target.value));
      const profile = state.profiles[idx] || state.profiles[0];
      updateConnectStatus('Emulando', `Enviando a: ${profile.nombre}`, 'ok');
      clearInterval(state.monitorInterval);
      const dataChar = await service.getCharacteristic(BT_CHAR_DATA_UUID);
      state.monitorInterval = setInterval(async () => {
        try { await dataChar.writeValue(new TextEncoder().encode(JSON.stringify(genSemiRandomData(profile)))); } catch {}
      }, 5000);
    });
  } catch (err) {
    updateConnectStatus('Error', err.message, 'err');
    document.getElementById('pulse-ring').classList.add('idle');
  }
}

// ──────────────────────────────────────────
// MODE: Producción
// ──────────────────────────────────────────
async function startProduccion() {
  updateConnectStatus('Buscando ESP32…', 'Iniciando Bluetooth…');
  try {
    if (!navigator.bluetooth) throw new Error('Web Bluetooth no disponible en este dispositivo/navegador');
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [BT_SERVICE_UUID] }],
    });
    updateConnectStatus('Conectando…', `Dispositivo: ${device.name || 'ESP32'}`, 'ok');
    device.addEventListener('gattserverdisconnected', () => onBtDisconnect('Producción'));

    const server  = await device.gatt.connect();
    const service = await server.getPrimaryService(BT_SERVICE_UUID);
    state.btDevice = device; state.btServer = server; state.btService = service;

    document.getElementById('connect-info').textContent = 'Leyendo perfiles de la SD…';
    const profileChar = await service.getCharacteristic(BT_CHAR_PROFILE_UUID);
    const profileVal  = await profileChar.readValue();
    let remoteProfiles = [];
    try { remoteProfiles = JSON.parse(new TextDecoder().decode(profileVal)); } catch {
      remoteProfiles = state.profiles.slice(0, 10);
    }

    updateConnectStatus('Conectado', 'Selecciona un perfil', 'ok');
    document.getElementById('connect-info').textContent = 'Selecciona el perfil activo:';

    showProfileSelectorForBt(remoteProfiles, async (profile, idx) => {
      state.activeProfile = profile;
      try {
        const selChar = await service.getCharacteristic(BT_CHAR_SELECT_UUID);
        await selChar.writeValue(new TextEncoder().encode(String(idx)));
      } catch {}
      const dataChar = await service.getCharacteristic(BT_CHAR_DATA_UUID);
      await dataChar.startNotifications();
      dataChar.addEventListener('characteristicvaluechanged', (ev) => {
        try { updateMonitor(JSON.parse(new TextDecoder().decode(ev.target.value))); } catch {}
      });
      setMonitorHeader('PRODUCCIÓN', profile.nombre);
      showView('view-monitor');
      document.getElementById('event-log').innerHTML = '';
      document.getElementById('live-dot').classList.add('active');
    });
  } catch (err) {
    updateConnectStatus('Error de conexión', err.message, 'err');
    document.getElementById('pulse-ring').classList.add('idle');
  }
}

// ──────────────────────────────────────────
// BT Disconnect handler
// ──────────────────────────────────────────
function onBtDisconnect(mode) {
  stopMonitor();
  addLog(new Date().toLocaleTimeString('es-PE', { hour12: false }),
    `⚡ Bluetooth desconectado (${mode})`, 'log-warn');
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

// ──────────────────────────────────────────
// Connect view helpers
// ──────────────────────────────────────────
function updateConnectStatus(badge, info, type = '') {
  const el = document.getElementById('connect-status');
  el.textContent = badge;
  el.className   = 'status-badge' + (type ? ` ${type}` : '');
  document.getElementById('connect-info').textContent = info;
}

// ── Safe way to rebind btn-start-monitor ─────
// Uses a stored handler reference instead of cloneNode.
function bindStartMonitorBtn(handler) {
  const btn = document.getElementById('btn-start-monitor');
  // Remove previous listener if any
  if (state._startMonitorHandler) {
    btn.removeEventListener('click', state._startMonitorHandler);
  }
  state._startMonitorHandler = handler;
  btn.addEventListener('click', handler);
}

// ── Profile selector for debug modes (no BT) ─
function showProfileSelectorForDebug(profiles, onSelect) {
  const selectorWrap = document.getElementById('profile-selector-wrap');
  const profileList  = document.getElementById('profile-list-connect');

  selectorWrap.classList.remove('hidden');
  profileList.innerHTML = '';
  let selectedIndex = 0;

  profiles.forEach((p, i) => {
    const li = document.createElement('li');
    li.textContent = p.nombre;
    if (i === 0) li.classList.add('selected');
    li.addEventListener('click', () => {
      profileList.querySelectorAll('li').forEach(el => el.classList.remove('selected'));
      li.classList.add('selected');
      selectedIndex = i;
    });
    profileList.appendChild(li);
  });

  bindStartMonitorBtn(() => {
    onSelect(profiles[selectedIndex] || profiles[0]);
  });
}

// ── Profile selector for BT modes (production) ─
function showProfileSelectorForBt(profiles, onSelect) {
  const selectorWrap = document.getElementById('profile-selector-wrap');
  const profileList  = document.getElementById('profile-list-connect');

  selectorWrap.classList.remove('hidden');
  profileList.innerHTML = '';
  let selectedIndex = 0;

  profiles.forEach((p, i) => {
    const li = document.createElement('li');
    li.textContent = p.nombre;
    if (i === 0) li.classList.add('selected');
    li.addEventListener('click', () => {
      profileList.querySelectorAll('li').forEach(el => el.classList.remove('selected'));
      li.classList.add('selected');
      selectedIndex = i;
    });
    profileList.appendChild(li);
  });

  bindStartMonitorBtn(() => {
    onSelect(profiles[selectedIndex] || profiles[0], selectedIndex);
  });
}

// ──────────────────────────────────────────
// MENU — Mode card clicks
// ──────────────────────────────────────────
document.querySelectorAll('.mode-card').forEach(card => {
  card.addEventListener('click', () => {
    const mode = card.dataset.mode;
    state.mode = mode;

    // Reset connect view state
    const titles = {
      'produccion':    'Modo Producción',
      'debug-dar':     'Modo Debug — Dar',
      'debug-recibir': 'Modo Debug — Recibir',
      'debug-sin':     'Modo Sin Conexión',
    };
    document.getElementById('connect-title').textContent = titles[mode] || 'Conectando…';
    document.getElementById('profile-selector-wrap').classList.add('hidden');
    document.getElementById('profile-list-connect').innerHTML = '';
    document.getElementById('pulse-ring').classList.remove('idle');
    updateConnectStatus('Iniciando', 'Preparando…');
    showView('view-connect');

    if (mode === 'debug-sin') {
      updateConnectStatus('Listo', 'Selecciona el perfil a simular:', 'ok');
      document.getElementById('pulse-ring').classList.add('idle');
      showProfileSelectorForDebug(state.profiles, startDebugSin);
      return;
    }

    if (mode === 'debug-recibir') {
      updateConnectStatus('Listo', 'Selecciona el perfil de planta:', 'ok');
      document.getElementById('pulse-ring').classList.add('idle');
      showProfileSelectorForDebug(DEBUG_PLANTS, startDebugRecibir);
      return;
    }

    if (mode === 'debug-dar') {
      startDebugDar();
      return;
    }

    if (mode === 'produccion') {
      startProduccion();
      return;
    }
  });
});

// ──────────────────────────────────────────
// Back buttons
// ──────────────────────────────────────────
function disconnectBt() {
  if (state.btDevice && state.btDevice.gatt.connected) {
    try { state.btDevice.gatt.disconnect(); } catch {}
  }
}

document.getElementById('btn-back-from-connect').addEventListener('click', () => {
  stopMonitor();
  disconnectBt();
  showView('view-menu');
});

document.getElementById('btn-back-from-monitor').addEventListener('click', () => {
  stopMonitor();
  disconnectBt();
  showView('view-menu');
});

document.getElementById('btn-back-from-profiles').addEventListener('click', () => {
  showView('view-menu');
});

document.getElementById('btn-go-profiles').addEventListener('click', () => {
  renderProfilesList();
  showView('view-profiles');
});

document.getElementById('btn-clear-log').addEventListener('click', () => {
  document.getElementById('event-log').innerHTML = '';
});

// ──────────────────────────────────────────
// Profiles Editor
// ──────────────────────────────────────────
function renderProfilesList() {
  const ul = document.getElementById('profiles-list');
  ul.innerHTML = '';
  state.profiles.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'profile-item';
    li.innerHTML = `
      <div class="profile-item-info">
        <div class="profile-item-name">${escHtml(p.nombre)}</div>
        <div class="profile-item-params">T:${p.tempMin}–${p.tempMax}°C | H≥${p.humMin}% | pH:${p.phMin}–${p.phMax}</div>
      </div>
      <div class="profile-item-actions">
        <button class="btn-icon" data-edit="${i}" title="Editar">✎</button>
        <button class="btn-icon del" data-del="${i}" title="Eliminar">✕</button>
      </div>
    `;
    ul.appendChild(li);
  });

  ul.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => openProfileModal(parseInt(btn.dataset.edit)))
  );
  ul.querySelectorAll('[data-del]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (state.profiles.length <= 1) return alert('Debes tener al menos un perfil.');
      if (confirm(`¿Eliminar perfil "${state.profiles[parseInt(btn.dataset.del)].nombre}"?`)) {
        state.profiles.splice(parseInt(btn.dataset.del), 1);
        saveProfiles();
        renderProfilesList();
      }
    })
  );
}

function openProfileModal(index) {
  state.editingIndex = index;
  const isNew = index === -1;
  const p     = isNew
    ? { nombre: '', tempMax: 30, tempMin: 18, humMin: 50, phMin: 6.0, phMax: 7.0 }
    : state.profiles[index];

  document.getElementById('modal-title').textContent = isNew ? 'Nuevo Perfil' : `Editar: ${p.nombre}`;
  document.getElementById('pf-nombre').value   = p.nombre;
  document.getElementById('pf-temp-max').value = p.tempMax;
  document.getElementById('pf-temp-min').value = p.tempMin;
  document.getElementById('pf-hum-min').value  = p.humMin;
  document.getElementById('pf-ph-min').value   = p.phMin;
  document.getElementById('pf-ph-max').value   = p.phMax;
  document.getElementById('profile-modal').classList.remove('hidden');
}

document.getElementById('btn-new-profile').addEventListener('click', () => {
  if (state.profiles.length >= 10) return alert('Máximo 10 perfiles permitidos.');
  openProfileModal(-1);
});

document.getElementById('btn-modal-cancel').addEventListener('click', () => {
  document.getElementById('profile-modal').classList.add('hidden');
  state.editingIndex = null;
});

document.getElementById('btn-modal-save').addEventListener('click', () => {
  const nombre  = document.getElementById('pf-nombre').value.trim();
  const tempMax = parseFloat(document.getElementById('pf-temp-max').value);
  const tempMin = parseFloat(document.getElementById('pf-temp-min').value);
  const humMin  = parseFloat(document.getElementById('pf-hum-min').value);
  const phMin   = parseFloat(document.getElementById('pf-ph-min').value);
  const phMax   = parseFloat(document.getElementById('pf-ph-max').value);

  if (!nombre) return alert('El nombre es requerido.');
  if ([tempMax, tempMin, humMin, phMin, phMax].some(isNaN)) return alert('Todos los valores numéricos son requeridos.');
  if (tempMin >= tempMax) return alert('Temp. mínima debe ser menor que la máxima.');
  if (phMin   >= phMax)   return alert('pH mínimo debe ser menor que el máximo.');
  if (humMin  < 0 || humMin > 100) return alert('Humedad debe estar entre 0 y 100.');

  const profile = { nombre, tempMax, tempMin, humMin, phMin, phMax };
  if (state.editingIndex === -1) state.profiles.push(profile);
  else state.profiles[state.editingIndex] = profile;

  saveProfiles();
  document.getElementById('profile-modal').classList.add('hidden');
  state.editingIndex = null;
  renderProfilesList();
});

// ──────────────────────────────────────────
// Utility
// ──────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ──────────────────────────────────────────
// Init
// ──────────────────────────────────────────
loadProfiles();
showView('view-menu');