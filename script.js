/* ═══════════════════════════════════════════════════════
   AquaControl Pro — script.js
   MQTT connection · UI updates · Chart · Log
═══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   1. CONFIGURATION
══════════════════════════════════════════════════════ */
const CONFIG = {
  broker  : 'wss://broker.hivemq.com:8884/mqtt',
  clientId: 'aqua_web_' + Math.random().toString(16).slice(2, 10),

  topics: {
    bottom  : 'soujanya/water/bottom',
    top     : 'soujanya/water/top',
    tds     : 'soujanya/water/tds',
    motor   : 'soujanya/water/motor/status',
    motorCmd: 'soujanya/water/motor/control',
    valveCmd: 'soujanya/water/valve/control',
    valve   : 'soujanya/water/valve/status'
  },

  tdsThreshold : 500,
  maxLog       : 120,
  chartPoints  : 30
};

/* ══════════════════════════════════════════════════════
   2. STATE
══════════════════════════════════════════════════════ */
let mqttClient         = null;
let valveManualOverride = false;
let msgCount           = 0;
let uptimeSeconds      = 0;
let uptimeTimer        = null;
const tdsHistory       = Array(CONFIG.chartPoints).fill(0);

/* ══════════════════════════════════════════════════════
   3. DOM REFERENCES
══════════════════════════════════════════════════════ */
const DOM = {
  /* navbar */
  connDot       : document.getElementById('conn-dot'),
  connLabel     : document.getElementById('conn-label'),
  statusChip    : document.getElementById('status-chip'),
  lastUpdate    : document.getElementById('last-update'),
  uptimeDisplay : document.getElementById('uptime-display'),
  sysMsgs       : document.getElementById('sys-msgs'),
  sysConn       : document.getElementById('sys-conn'),

  /* summary row */
  scTds         : document.getElementById('sc-tds'),
  scQualityTag  : document.getElementById('sc-quality-tag'),
  scLevel       : document.getElementById('sc-level'),
  scLevelTag    : document.getElementById('sc-level-tag'),
  scMotor       : document.getElementById('sc-motor'),
  scMotorTag    : document.getElementById('sc-motor-tag'),
  scValve       : document.getElementById('sc-valve'),
  scValveTag    : document.getElementById('sc-valve-tag'),

  /* TDS card */
  gaugeFill     : document.getElementById('gauge-fill'),
  gaugeTdsVal   : document.getElementById('gauge-tds-val'),
  tdsQualityBadge: document.getElementById('tds-quality-badge'),

  /* tank card */
  tankFill      : document.getElementById('tank-fill'),
  tankPct       : document.getElementById('tank-pct'),
  topIndicator  : document.getElementById('top-indicator'),
  botIndicator  : document.getElementById('bot-indicator'),
  topLabel      : document.getElementById('top-label'),
  botLabel      : document.getElementById('bot-label'),
  levelPill     : document.getElementById('level-pill'),

  /* motor card */
  motorToggle   : document.getElementById('motor-toggle'),
  motorLabel    : document.getElementById('motor-label'),
  motorSub      : document.getElementById('motor-sub'),
  motorModeBadge: document.getElementById('motor-mode-badge'),
  botDot        : document.getElementById('bot-dot'),
  bottomTxt     : document.getElementById('bottom-status-txt'),

  /* valve card */
  valveVal      : document.getElementById('valve-val'),
  valveSub      : document.getElementById('valve-sub'),
  valveIcon     : document.getElementById('valve-icon'),
  valveToggle   : document.getElementById('valve-toggle'),
  valveManLabel : document.getElementById('valve-manual-label'),
  valveModeBadge: document.getElementById('valve-mode-badge'),

  /* log */
  logBox        : document.getElementById('log-box'),
  btnClear      : document.getElementById('btn-clear-log'),
  logCount      : document.getElementById('log-count')
};

/* ══════════════════════════════════════════════════════
   4. UPTIME COUNTER
══════════════════════════════════════════════════════ */
function startUptime() {
  uptimeSeconds = 0;
  if (uptimeTimer) clearInterval(uptimeTimer);
  uptimeTimer = setInterval(() => {
    uptimeSeconds++;
    const h = String(Math.floor(uptimeSeconds / 3600)).padStart(2,'0');
    const m = String(Math.floor((uptimeSeconds % 3600) / 60)).padStart(2,'0');
    const s = String(uptimeSeconds % 60).padStart(2,'0');
    DOM.uptimeDisplay.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

/* ══════════════════════════════════════════════════════
   5. EVENT LOG
══════════════════════════════════════════════════════ */
function addLog(type, msg) {
  const time = new Date().toLocaleTimeString('en-GB');
  const tags = { info: 'INFO', warn: 'WARN', ok: 'OK', err: 'ERR' };

  const el = document.createElement('div');
  el.className = 'log-entry';
  el.innerHTML = `<span class="log-time">${time}</span><span class="log-tag ${type}">[${tags[type]}]</span><span class="log-msg"> ${msg}</span>`;

  DOM.logBox.prepend(el);

  while (DOM.logBox.children.length > CONFIG.maxLog) {
    DOM.logBox.removeChild(DOM.logBox.lastChild);
  }

  // Update count badge
  const count = Math.min(DOM.logBox.children.length, CONFIG.maxLog);
  DOM.logCount.textContent = count;
}

DOM.btnClear.addEventListener('click', () => {
  DOM.logBox.innerHTML = '';
  DOM.logCount.textContent = '0';
  addLog('info', 'Log cleared.');
});

/* ══════════════════════════════════════════════════════
   6. TDS SPARKLINE CHART
══════════════════════════════════════════════════════ */
function drawChart() {
  const canvas = document.getElementById('tdsChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.offsetWidth || 260, h = 72;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  const max = Math.max(...tdsHistory, 50);
  const pts = tdsHistory.map((v, i) => ({
    x: (i / (tdsHistory.length - 1)) * w,
    y: h - (v / max) * (h - 6) - 3
  }));

  // Area gradient — blue for light mode
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(0,113,227,0.14)');
  grad.addColorStop(1, 'rgba(0,113,227,0)');

  ctx.beginPath();
  ctx.moveTo(pts[0].x, h);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length-1].x, h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = '#0071e3';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Threshold line at 500 PPM
  const ty = h - (CONFIG.tdsThreshold / max) * (h - 6) - 3;
  if (ty > 0 && ty < h) {
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, ty); ctx.lineTo(w, ty);
    ctx.strokeStyle = 'rgba(191,72,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
window.addEventListener('resize', drawChart);

/* ══════════════════════════════════════════════════════
   7. TDS GAUGE UPDATE
══════════════════════════════════════════════════════ */
function updateGauge(v) {
  // Arc length = 172 (half circle ~180°)
  const pct = Math.min(v / 1000, 1);
  const offset = 172 - (pct * 172);
  DOM.gaugeFill.style.strokeDashoffset = offset;

  // Color
  let color;
  if      (v < 150) color = '#4ade80';
  else if (v < 300) color = '#86efac';
  else if (v < 500) color = '#f59e0b';
  else              color = '#f87171';
  DOM.gaugeFill.style.stroke = color;
  DOM.gaugeTdsVal.textContent = v;
  DOM.gaugeTdsVal.style.fill = color;
}

/* ══════════════════════════════════════════════════════
   8. CONNECTION STATUS
══════════════════════════════════════════════════════ */
function setOnline(online) {
  DOM.connDot.classList.toggle('online', online);
  DOM.statusChip.classList.toggle('online', online);
  DOM.connLabel.textContent = online ? 'Online' : 'Offline';
  DOM.sysConn.textContent   = online ? 'Connected' : 'Disconnected';
  DOM.sysConn.style.color   = online ? 'var(--green)' : 'var(--red)';
  if (online) startUptime();
  else if (uptimeTimer) { clearInterval(uptimeTimer); uptimeTimer = null; }
}

/* ══════════════════════════════════════════════════════
   9. SENSOR UPDATERS
══════════════════════════════════════════════════════ */

function updateTDS(raw) {
  const v = parseInt(raw) || 0;
  tdsHistory.push(v); tdsHistory.shift();

  updateGauge(v);
  DOM.scTds.textContent = v + ' PPM';

  let qText, qColor, tagText, tagColor;
  if (v < 150) {
    qText='✅  Excellent — Safe to drink'; tagText='Excellent'; qColor='#4ade80'; tagColor='var(--green)';
  } else if (v < 300) {
    qText='✅  Good quality'; tagText='Good'; qColor='#86efac'; tagColor='var(--green)';
  } else if (v < 500) {
    qText='⚠️  Acceptable — Monitor closely'; tagText='Acceptable'; qColor='#f59e0b'; tagColor='var(--orange)';
  } else {
    qText='🚫  Impure — Draining now'; tagText='Draining'; qColor='#f87171'; tagColor='var(--red)';
  }

  DOM.tdsQualityBadge.textContent = qText;
  DOM.tdsQualityBadge.style.color = qColor;
  DOM.tdsQualityBadge.style.borderColor = qColor + '44';
  DOM.scQualityTag.textContent = tagText;
  DOM.scQualityTag.style.color = tagColor;

  drawChart();
  addLog(v > CONFIG.tdsThreshold ? 'warn' : 'ok', `TDS: ${v} PPM — ${tagText}`);
}

function updateBottomSensor(msg) {
  const wet = msg === 'WATER';
  DOM.botIndicator.classList.toggle('active', wet);
  DOM.botDot.classList.toggle('active', wet);
  DOM.botLabel.textContent   = wet ? 'WATER DETECTED' : 'EMPTY';
  DOM.bottomTxt.textContent  = wet
    ? 'Bottom sensor: Water present — tank filling'
    : 'Bottom sensor: Dry — pump may be needed';
  addLog('info', 'Bottom sensor → ' + msg);
  refreshTankVisual();
}

function updateTopSensor(msg) {
  const full = msg === 'FULL';
  DOM.topIndicator.classList.toggle('active', full);
  DOM.topLabel.textContent = full ? 'FULL' : 'NOT FULL';
  addLog('info', 'Top sensor → ' + msg);
  refreshTankVisual();
}

function refreshTankVisual() {
  const botWet  = DOM.botIndicator.classList.contains('active');
  const topFull = DOM.topIndicator.classList.contains('active');

  let level, fillH, pct, color, pillColor;
  if (!botWet)       { level='EMPTY';   fillH='5%';  pct='~0%';  color='#f87171'; pillColor='rgba(248,113,113,0.2)'; }
  else if (topFull)  { level='FULL';    fillH='95%'; pct='~100%'; color='#4ade80'; pillColor='rgba(74,222,128,0.2)'; }
  else               { level='PARTIAL'; fillH='52%'; pct='~50%';  color='#38bdf8'; pillColor='rgba(56,189,248,0.2)'; }

  DOM.tankFill.style.height = fillH;
  DOM.tankFill.style.background = `linear-gradient(0deg, ${color}cc 0%, ${color}44 100%)`;
  DOM.tankPct.textContent = pct;
  DOM.levelPill.textContent = level;
  DOM.levelPill.style.color = color;
  DOM.levelPill.style.background = pillColor;
  DOM.levelPill.style.borderColor = color + '44';

  DOM.scLevel.textContent = level;
  DOM.scLevelTag.textContent = level;
  DOM.scLevelTag.style.color = color;
}

function updateMotorStatus(msg) {
  const on = msg === 'ON';
  DOM.motorToggle.checked = on;
  setMotorUI(on);
  addLog(on ? 'ok' : 'info', 'Motor → ' + msg);
}

function setMotorUI(on) {
  DOM.motorLabel.textContent = on ? 'ON' : 'OFF';
  DOM.motorLabel.className   = 'big-status ' + (on ? 'on' : '');
  DOM.motorSub.textContent   = on ? 'Pumping — filling the tank' : 'Standby — tank level normal';
  DOM.scMotor.textContent    = on ? 'ON' : 'OFF';
  DOM.scMotorTag.textContent = on ? 'Running' : 'Standby';
  DOM.scMotorTag.style.color = on ? 'var(--green)' : '';
}

function refreshValveDisplay(forceOpen) {
  let isOpen;
  if (valveManualOverride) {
    isOpen = DOM.valveToggle.checked;
  } else if (forceOpen !== undefined) {
    isOpen = forceOpen;
  } else {
    const tds = parseInt(DOM.gaugeTdsVal.textContent) || 0;
    isOpen = tds > CONFIG.tdsThreshold;
  }
  setValveUI(isOpen);
  if (!valveManualOverride) {
    DOM.valveToggle.checked   = isOpen;
    DOM.valveManLabel.textContent = isOpen ? 'ON' : 'OFF';
    DOM.valveManLabel.className   = 'manual-state ' + (isOpen ? 'on' : 'off');
  }
}

function setValveUI(isOpen) {
  DOM.valveVal.textContent = isOpen ? 'OPEN' : 'CLOSED';
  DOM.valveVal.className   = 'big-status ' + (isOpen ? 'open' : 'closed');
  DOM.valveSub.textContent = isOpen ? 'Draining — flushing impure water' : 'Sealed — water quality OK';
  DOM.valveIcon.classList.toggle('open', isOpen);
  DOM.scValve.textContent  = isOpen ? 'OPEN' : 'CLOSED';
  DOM.scValveTag.textContent = isOpen ? 'Draining' : valveManualOverride ? 'Manual' : 'Auto Mode';
  DOM.scValveTag.style.color = isOpen ? 'var(--orange)' : '';
  DOM.valveModeBadge.textContent = valveManualOverride ? 'MANUAL' : 'AUTO';
}

setInterval(() => { if (!valveManualOverride) refreshValveDisplay(); }, 3000);

/* ══════════════════════════════════════════════════════
   10. MQTT MESSAGE ROUTER
══════════════════════════════════════════════════════ */
function handleMessage(topic, payload) {
  const msg = payload.toString().trim();

  // Track message count
  msgCount++;
  DOM.sysMsgs.textContent = msgCount;
  DOM.lastUpdate.textContent = new Date().toLocaleTimeString('en-GB');

  const T = CONFIG.topics;
  if (topic === T.tds)    { updateTDS(msg);          return; }
  if (topic === T.bottom) { updateBottomSensor(msg); return; }
  if (topic === T.top)    { updateTopSensor(msg);    return; }
  if (topic === T.motor)  { updateMotorStatus(msg);  return; }
  if (topic === T.valve) {
    if (!valveManualOverride) refreshValveDisplay(msg === 'OPEN');
    addLog(msg === 'OPEN' ? 'warn' : 'ok', 'Valve → ' + msg);
    return;
  }
}

/* ══════════════════════════════════════════════════════
   11. MQTT CONNECTION
══════════════════════════════════════════════════════ */
function connectMQTT() {
  addLog('info', 'Connecting to broker.hivemq.com...');

  mqttClient = mqtt.connect(CONFIG.broker, {
    clientId: CONFIG.clientId,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000
  });

  mqttClient.on('connect', () => {
    setOnline(true);
    addLog('ok', 'Connected · client: ' + CONFIG.clientId);
    const T = CONFIG.topics;
    [T.bottom, T.top, T.tds, T.motor, T.valve].forEach(t => {
      mqttClient.subscribe(t, { qos: 0 }, err => {
        if (err) addLog('err', 'Subscribe failed: ' + t);
        else     addLog('info', 'Subscribed: ' + t);
      });
    });
  });

  mqttClient.on('reconnect', () => { setOnline(false); addLog('warn', 'Reconnecting...'); });
  mqttClient.on('error',    e  => { setOnline(false); addLog('err', 'Error: ' + e.message); });
  mqttClient.on('offline',  () => { setOnline(false); addLog('warn', 'Connection lost.'); });
  mqttClient.on('message', handleMessage);
}

/* ══════════════════════════════════════════════════════
   12. MOTOR MANUAL TOGGLE
══════════════════════════════════════════════════════ */
DOM.motorToggle.addEventListener('change', function () {
  const wantOn = this.checked;
  setMotorUI(wantOn);  // immediate UI update

  if (!mqttClient || !mqttClient.connected) {
    addLog('err', 'Not connected — motor command failed.');
    this.checked = !wantOn;
    setMotorUI(!wantOn);
    return;
  }

  const cmd = wantOn ? 'ON' : 'OFF';
  mqttClient.publish(CONFIG.topics.motorCmd, cmd, { qos: 1 }, err => {
    if (err) {
      addLog('err', 'Motor publish failed.');
      this.checked = !wantOn;
      setMotorUI(!wantOn);
    } else {
      DOM.motorModeBadge.textContent = 'MANUAL';
      addLog('ok', 'Motor command → ' + cmd);
    }
  });
});

/* ══════════════════════════════════════════════════════
   13. VALVE MANUAL TOGGLE
══════════════════════════════════════════════════════ */
DOM.valveToggle.addEventListener('change', function () {
  const wantOpen = this.checked;

  DOM.valveManLabel.textContent = wantOpen ? 'ON' : 'OFF';
  DOM.valveManLabel.className   = 'manual-state ' + (wantOpen ? 'on' : 'off');

  if (!mqttClient || !mqttClient.connected) {
    addLog('err', 'Not connected — valve command failed.');
    this.checked = !wantOpen;
    DOM.valveManLabel.textContent = !wantOpen ? 'ON' : 'OFF';
    DOM.valveManLabel.className   = 'manual-state ' + (!wantOpen ? 'on' : 'off');
    return;
  }

  valveManualOverride = wantOpen;
  const cmd = wantOpen ? 'OPEN' : 'CLOSE';

  mqttClient.publish(CONFIG.topics.valveCmd, cmd, { qos: 1 }, err => {
    if (err) {
      addLog('err', 'Valve publish failed.');
      this.checked = !wantOpen;
      valveManualOverride = false;
      DOM.valveManLabel.textContent = !wantOpen ? 'ON' : 'OFF';
      DOM.valveManLabel.className   = 'manual-state ' + (!wantOpen ? 'on' : 'off');
    } else {
      addLog('ok', 'Valve command → ' + cmd);
      setValveUI(wantOpen);
    }
  });
});

/* ══════════════════════════════════════════════════════
   14. INIT
══════════════════════════════════════════════════════ */
drawChart();
connectMQTT();
