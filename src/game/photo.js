import { POOL } from '../world/terrain.js';

const $ = (id) => document.getElementById(id);

// Photo mode: free camera, filters, time-of-day slider, PNG download.
export class Photo {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.freezeTime = false;
    this.pendingShot = false;
    $('photo-exit').onclick = () => this.exit();
    $('photo-shoot').onclick = () => { this.pendingShot = true; };
    $('photo-filter').onchange = (e) => this.setFilter(e.target.value);
    $('photo-hide-rider').onchange = (e) => { this.game.player.rider.root.visible = !e.target.checked; };
    $('photo-time').oninput = (e) => { this.game.state.hour = parseFloat(e.target.value); this.game.envT = 0; };
  }

  enter() {
    const g = this.game;
    this.active = true;
    this.freezeTime = true;
    g.followCam.enterFree();
    g.ui.show('hud', false);
    g.ui.show('photo-ui', true);
    $('photo-time').value = g.state.hour;
    if (g.player.horse) g.player.horse.speed = 0;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  exit() {
    const g = this.game;
    this.active = false;
    this.freezeTime = false;
    g.followCam.exitFree();
    g.ui.show('hud', true);
    g.ui.show('photo-ui', false);
    g.player.rider.root.visible = true;
    $('photo-hide-rider').checked = false;
    this.setFilter('none');
    $('photo-filter').value = 'none';
  }

  setFilter(f) {
    const c = this.game.canvas;
    c.className = f === 'none' ? '' : 'filter-' + f;
    this.filter = f;
  }

  handleKeys(inp) {
    if (inp.wasPressed('KeyP') || inp.wasPressed('Escape')) this.exit();
    if (inp.wasPressed('Enter') || inp.wasPressed('KeyF')) this.pendingShot = true;
    // free camera needs mouse look without dragging
    if (inp.wasPressed('Mouse0') && document.pointerLockElement !== this.game.canvas) this.game.canvas.requestPointerLock?.();
  }

  capture() {
    this.pendingShot = false;
    const g = this.game;
    const src = g.canvas;
    // bake the CSS filter into the image
    const out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    const ctx = out.getContext('2d');
    const filters = { warm: 'sepia(0.25) saturate(1.3) contrast(1.05) brightness(1.05)', sepia: 'sepia(0.85) contrast(1.1)', bw: 'grayscale(1) contrast(1.15)', vivid: 'saturate(1.6) contrast(1.1)', dream: 'brightness(1.1) saturate(1.2) blur(1px)' };
    ctx.filter = filters[this.filter] || 'none';
    ctx.drawImage(src, 0, 0);
    ctx.filter = 'none';
    // little western frame + caption
    ctx.strokeStyle = 'rgba(243,227,194,0.9)'; ctx.lineWidth = Math.max(6, out.width / 200);
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, out.width - ctx.lineWidth * 2, out.height - ctx.lineWidth * 2);
    ctx.font = `${Math.round(out.height / 30)}px Rye, Georgia, serif`;
    ctx.fillStyle = 'rgba(255,243,216,0.9)'; ctx.textAlign = 'right';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    const h = g.player.horse || g.activeHorseEntity();
    ctx.fillText(`${g.state.playerName}${h ? ' & ' + h.data.name : ''} · Silver Spur Ranch · Tag ${g.state.day}`, out.width - out.height / 25, out.height - out.height / 25);
    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `silver-spur-ranch-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    // flash
    const f = $('fade');
    f.style.background = '#fff'; f.classList.add('on');
    setTimeout(() => { f.classList.remove('on'); setTimeout(() => (f.style.background = '#000'), 600); }, 80);
    g.state.stats.photos++;
    const cam = g.camera.position;
    const horseInView = g.horses.some((x) => x.pos.distanceTo(cam) < 18 && !x.data.wild);
    g.events.emit('photo', {
      hour: g.state.hour,
      night: g.sky.darkness > 0.6,
      nearWaterfall: Math.hypot(cam.x - POOL.x, cam.z - POOL.z) < 90,
      horseInView,
    });
    g.ui.toast('📸 Foto gespeichert!');
  }
}
