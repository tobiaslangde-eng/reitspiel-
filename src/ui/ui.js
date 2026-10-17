import { formatMoney } from '../core/utils.js';
import { bondLevel } from '../horse/breeds.js';
import { SEASON_NAMES } from '../world/sky.js';
import { heightAt, colorAt, WORLD_SIZE, HALF, ROADS } from '../world/terrain.js';

const $ = (id) => document.getElementById(id);
const SEASON_ICON = { spring: '🌸', summer: '🌻', autumn: '🍂', winter: '❄️' };

export function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export class UI {
  constructor(game) {
    this.game = game;
    this.modalOpen = false;
    this.dialogOpen = false;
    this.panelOnClose = null;
    $('panel-close').onclick = () => this.closePanel();
    $('panel').addEventListener('mousedown', (e) => { if (e.target.id === 'panel') this.closePanel(); });
    const strip = $('compass-strip');
    const dirs = ['N', '·', 'NO', '·', 'O', '·', 'SO', '·', 'S', '·', 'SW', '·', 'W', '·', 'NW', '·'];
    let html = '';
    for (let k = 0; k < 3; k++) for (const d of dirs) html += `<span>${d}</span>`;
    strip.innerHTML = html;
    this.mapImg = null;
  }

  show(id, v = true) { $(id).classList.toggle('hidden', !v); }

  // ------------------------------------------------------------ toasts / banners
  toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.innerHTML = msg;
    $('toasts').appendChild(t);
    while ($('toasts').children.length > 5) $('toasts').firstChild.remove();
    setTimeout(() => t.classList.add('out'), 4200);
    setTimeout(() => t.remove(), 4700);
  }

  banner(text, sub = '', dur = 2.5) {
    const b = $('banner');
    b.innerHTML = `${esc(text)}${sub ? `<small>${sub}</small>` : ''}`;
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.add('hidden'), dur * 1000);
  }

  prompt(text) {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    const p = $('prompt');
    if (!text) { p.classList.add('hidden'); return; }
    p.innerHTML = text;
    p.classList.remove('hidden');
  }

  eventHud(html) {
    if (html === this.lastEvent) return;
    this.lastEvent = html;
    const e = $('hud-event');
    if (!html) { e.classList.add('hidden'); return; }
    e.innerHTML = html;
    e.classList.remove('hidden');
  }

  questHud(html) {
    if (html === this.lastQuest) return;
    this.lastQuest = html;
    const q = $('hud-quest');
    if (!html) { q.classList.add('hidden'); return; }
    q.innerHTML = html;
    q.classList.remove('hidden');
  }

  // ------------------------------------------------------------ panel
  openPanel(title, tabs, onClose) {
    // tabs: [{ id, label, render(container) }] or a single render function
    this.closeDialog();
    $('panel-title').textContent = title;
    const tabBar = $('panel-tabs');
    tabBar.innerHTML = '';
    const body = $('panel-body');
    const list = typeof tabs === 'function' ? [{ id: 'main', label: '', render: tabs }] : tabs;
    const select = (tab) => {
      [...tabBar.children].forEach((b) => b.classList.toggle('active', b.dataset.id === tab.id));
      body.innerHTML = '';
      this.currentTab = tab;
      tab.render(body, () => select(tab));
      body.scrollTop = 0;
    };
    if (list.length > 1) {
      for (const t of list) {
        const b = document.createElement('button');
        b.textContent = t.label; b.dataset.id = t.id;
        b.onclick = () => { this.game.audio.click(); select(t); };
        tabBar.appendChild(b);
      }
    }
    this.panelTabs = list;
    this.panelOnClose = onClose || null;
    select(list[0]);
    $('panel').classList.remove('hidden');
    this.modalOpen = true;
    this.panelOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  refreshPanel() {
    if (!this.panelOpen || !this.currentTab) return;
    const body = $('panel-body');
    const st = body.scrollTop;
    body.innerHTML = '';
    this.currentTab.render(body, () => this.refreshPanel());
    body.scrollTop = st;
  }

  selectTab(id) {
    const t = this.panelTabs?.find((x) => x.id === id);
    if (t) [...$('panel-tabs').children].find((b) => b.dataset.id === id)?.click();
  }

  closePanel() {
    if (!this.panelOpen) return;
    $('panel').classList.add('hidden');
    this.panelOpen = false;
    this.modalOpen = this.dialogOpen;
    const cb = this.panelOnClose; this.panelOnClose = null;
    if (cb) cb();
  }

  // ------------------------------------------------------------ dialog
  dialog(name, portrait, text, options = [{ label: 'Tschüss!' }]) {
    $('dialog-name').textContent = name;
    $('dialog-portrait').textContent = portrait;
    $('dialog-text').innerHTML = text;
    const box = $('dialog-options');
    box.innerHTML = '';
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'btn' + (o.gold ? ' gold' : '');
      b.innerHTML = `${i + 1}. ${o.label}`;
      b.onclick = () => { this.game.audio.click(); this.closeDialog(); if (o.fn) o.fn(); };
      box.appendChild(b);
    });
    this.dialogOptions = options;
    $('dialog').classList.remove('hidden');
    this.dialogOpen = true;
    this.modalOpen = true;
  }

  closeDialog() {
    if (!this.dialogOpen) return;
    $('dialog').classList.add('hidden');
    this.dialogOpen = false;
    this.modalOpen = this.panelOpen;
  }

  handleKeys(input) {
    if (this.dialogOpen) {
      for (let i = 0; i < 6; i++) {
        if (input.pressed.has('Digit' + (i + 1)) && this.dialogOptions[i]) {
          const o = this.dialogOptions[i];
          this.closeDialog(); if (o.fn) o.fn();
          return true;
        }
      }
      if (input.pressed.has('Escape')) { this.closeDialog(); return true; }
    }
    if (this.panelOpen && input.pressed.has('Escape')) { this.closePanel(); return true; }
    return false;
  }

  // ------------------------------------------------------------ HUD
  updateHUD() {
    const g = this.game, s = g.state;
    const hh = Math.floor(s.hour), mm = Math.floor((s.hour - hh) * 60);
    const timeIcon = s.hour > 6 && s.hour < 19 ? '☀️' : '🌙';
    $('hud-time').textContent = `${timeIcon} Tag ${s.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const w = g.weather.info;
    $('hud-season').textContent = `${SEASON_ICON[g.season]} ${SEASON_NAMES[g.season]} · ${w.icon} ${w.name}`;
    $('hud-money').textContent = formatMoney(s.money);
    const p = g.player;
    const h = p.mode === 'ride' ? p.horse : g.activeHorseEntity();
    if (h) {
      $('hud-horse-name').textContent = `🐴 ${h.data.name}`;
      const bl = bondLevel(h.data.bond);
      $('hud-bond').textContent = '❤'.repeat(bl.lvl) + '♡'.repeat(5 - bl.lvl) + '  ' + bl.name;
      const frac = h.stamina / h.maxStamina();
      const f = $('stamina-fill');
      f.style.width = (frac * 100).toFixed(1) + '%';
      f.classList.toggle('low', frac < 0.25 || h.exhausted);
      $('hud-gait').textContent = p.mode === 'ride' ? `${p.gaitName()} · Stufe ${p.gait}${h.waterDepth > 0.2 ? ' · 💧' : ''}` : 'Zu Fuß' + (p.speed > 3 ? ' (rennen)' : '');
    }
    // compass: bearing of the camera view, north = -z, east = +x
    let deg = (-g.followCam.yaw * 180) / Math.PI % 360; if (deg < 0) deg += 360;
    $('compass-strip').style.left = `${180 - ((16 + deg / 22.5) * 45 + 22.5)}px`;
  }

  // ------------------------------------------------------------ maps
  buildMapImage(size = 512, season = 'summer') {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const wx = (x / size) * WORLD_SIZE - HALF, wz = (y / size) * WORLD_SIZE - HALF;
        const h = heightAt(wx, wz);
        const hx = heightAt(wx + 3, wz);
        let col;
        if (h < 0) col = [0.25, 0.5, 0.62];
        else {
          col = colorAt(wx, wz, h, 0.9, season);
          const shade = 1 + (h - hx) * 0.08;
          col = col.map((v) => v * shade);
        }
        // parchment tint
        const i = (y * size + x) * 4;
        img.data[i] = Math.min(255, col[0] * 200 + 45);
        img.data[i + 1] = Math.min(255, col[1] * 190 + 40);
        img.data[i + 2] = Math.min(255, col[2] * 160 + 30);
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const toPx = (wx, wz) => [((wx + HALF) / WORLD_SIZE) * size, ((wz + HALF) / WORLD_SIZE) * size];
    g.strokeStyle = 'rgba(120,80,40,0.8)'; g.lineWidth = size / 300; g.setLineDash([size / 120, size / 200]);
    for (const r of ROADS) { g.beginPath(); r.forEach(([x, z], i) => { const [px, py] = toPx(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke(); }
    g.setLineDash([]);
    this.mapImg = c;
    return c;
  }

  drawMinimap(markers) {
    const cv = $('minimap');
    const g = cv.getContext('2d');
    const W = cv.width;
    const p = this.game.player.position;
    const scale = 1.2; // px per meter at minimap
    g.save();
    g.clearRect(0, 0, W, W);
    g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#3a2a1a'; g.fillRect(0, 0, W, W);
    const yaw = this.game.followCam.yaw;
    g.translate(W / 2, W / 2);
    g.rotate(yaw);
    if (this.mapImg) {
      const ms = this.mapImg.width;
      const k = WORLD_SIZE / ms; // meters per map px
      const sx = ((p.x + HALF) / WORLD_SIZE) * ms, sy = ((p.z + HALF) / WORLD_SIZE) * ms;
      const span = W / scale / k;
      g.drawImage(this.mapImg, sx - span, sy - span, span * 2, span * 2, -W, -W, W * 2, W * 2);
    }
    for (const m of markers) {
      const dx = (m.x - p.x) * scale, dz = (m.z - p.z) * scale;
      let x = dx, y = dz;
      const d = Math.hypot(x, y);
      const lim = W / 2 - 10;
      if (d > lim) { if (!m.edge) continue; x *= lim / d; y *= lim / d; }
      g.save(); g.translate(x, y); g.rotate(-yaw);
      if (m.icon) { g.font = `${m.size || 14}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(m.icon, 0, 0); }
      else { g.fillStyle = m.color || '#fff'; g.beginPath(); g.arc(0, 0, m.r || 3, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
    g.restore();
    // player arrow (always up = camera direction)
    g.save(); g.translate(W / 2, W / 2);
    const h = this.game.player.mode === 'ride' ? this.game.player.horse.heading : this.game.player.heading;
    g.rotate(yaw - h + Math.PI);
    g.fillStyle = '#ffe08a'; g.strokeStyle = '#3a2212'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.fillStyle = '#ffe08a'; g.font = 'bold 14px Rye, serif'; g.textAlign = 'center';
    g.save(); g.translate(W / 2, W / 2); g.rotate(yaw); g.fillText('N', 0, -W / 2 + 14); g.restore();
  }
}
