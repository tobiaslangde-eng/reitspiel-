import { clamp } from '../core/utils.js';
import { ITEMS } from './catalog.js';
import { bondLevel, PERSONALITIES } from '../horse/breeds.js';
import { g_bond } from '../player/player.js';
import { riverInfo, waterDepthAt } from '../world/terrain.js';
import { esc } from '../ui/ui.js';

const COOLDOWN = 4; // in-game hours before an action gives bond again

export class Care {
  constructor(game) {
    this.game = game;
    this.horse = null;
  }

  absHours() { const s = this.game.state; return s.day * 24 + s.hour; }

  nearestHorse(maxD = 3.5) {
    const p = this.game.player.pos;
    let best = null, bd = maxD;
    for (const h of this.game.horses) {
      if (h.data.wild || h.forSale) continue;
      const d = h.pos.distanceTo(p);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  interactables() { return []; }

  open(h) {
    const g = this.game;
    if (g.player.mode === 'ride') { g.ui.toast('Steig zuerst ab (E), um dein Pferd zu pflegen.'); return; }
    h = h || this.nearestHorse();
    if (!h) { g.ui.toast('Kein Pferd in der Nähe. Pfeife (H), damit es kommt!'); return; }
    this.horse = h;
    h.state = 'stand'; h.stateT = 999; h.maneuver = null; h.speed = 0; h.wantUpdate = true;
    g.player.faceTowards(h.pos);
    g.ui.openPanel(`Pflege: ${h.data.name}`, [
      { id: 'care', label: '🪮 Pflege', render: (el, refresh) => this.render(el, refresh) },
      { id: 'mane', label: '🎀 Mähne & Schweif', render: (el, refresh) => this.renderMane(el, refresh) },
    ], () => { h.stateT = 5; h.wantUpdate = false; this.horse = null; });
  }

  ready(h, key) {
    h.data.care = h.data.care || {};
    const last = h.data.care[key] || -99;
    return this.absHours() - last >= COOLDOWN;
  }
  mark(h, key) { h.data.care = h.data.care || {}; h.data.care[key] = this.absHours(); }

  bond(h, key, amount) {
    if (this.ready(h, key)) { g_bond(this.game, h, amount, key); this.mark(h, key); this.game.state.stats.carePoints += 1; return true; }
    this.game.fx.hearts(h);
    return false;
  }

  needsBlock(h) {
    const n = h.data.needs;
    const bar = (label, v, icon) => `<div class="need">${icon} ${label}<div class="pips" style="flex:1;height:10px"><i style="width:${v}%"></i></div><span>${Math.round(v)}%</span></div>`;
    const bl = bondLevel(h.data.bond);
    return `${bar('Hunger gestillt', n.hunger, '🌾')}${bar('Durst gestillt', n.thirst, '💧')}${bar('Sauberkeit', n.clean, '✨')}${bar('Zufriedenheit', n.happy, '😊')}
      <div class="need">❤️ Bindung: <b>${bl.name}</b><div class="pips" style="flex:1;height:10px"><i style="width:${h.data.bond}%;background:linear-gradient(90deg,#ff6a9a,#ffb0c8)"></i></div></div>
      <div class="muted">${PERSONALITIES[h.data.personality].icon} ${PERSONALITIES[h.data.personality].name}: ${PERSONALITIES[h.data.personality].desc}</div>`;
  }

  render(el, refresh) {
    const g = this.game, s = g.state;
    const h = this.horse;
    el.innerHTML = `<div class="two-col"><div>
        <div class="section-title">Bürsten</div>
        <p class="muted">Halte die Maustaste gedrückt (oder wische mit dem Finger) und bürste den Schmutz aus dem Fell!</p>
        <canvas id="brush-canvas" width="420" height="260" style="width:100%;border-radius:10px;border:3px solid #7a5230;cursor:grab;background:#6a4a30"></canvas>
        <div id="brush-progress" class="muted"></div>
      </div><div>
        <div class="section-title">Zustand</div>${this.needsBlock(h)}
        <div class="section-title">Hufe auskratzen</div><div class="row" id="hooves"></div>
        <div class="section-title">Füttern & Tränken</div><div class="row" id="feed"></div>
        <div class="section-title">Zuneigung</div><div class="row" id="love"></div>
      </div></div>`;
    // ---- brushing minigame
    const cv = el.querySelector('#brush-canvas');
    const ctx = cv.getContext('2d');
    const coat = h.rig.coatMat.userData.uniforms.uBase.value;
    const css = `rgb(${coat.r ** (1 / 2.2) * 255 | 0},${coat.g ** (1 / 2.2) * 255 | 0},${coat.b ** (1 / 2.2) * 255 | 0})`;
    ctx.fillStyle = css; ctx.fillRect(0, 0, cv.width, cv.height);
    // horse silhouette hint (barrel of the body)
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 300; i++) { ctx.fillRect(Math.random() * cv.width, Math.random() * cv.height, 30, 1); }
    const dirtAmount = 1 - h.data.needs.clean / 100;
    const spots = [];
    const n = Math.floor(10 + dirtAmount * 40);
    for (let i = 0; i < n; i++) spots.push({ x: Math.random() * cv.width, y: Math.random() * cv.height, r: 10 + Math.random() * 22, a: 0.5 + Math.random() * 0.5 });
    const drawDirt = () => {
      ctx.fillStyle = css; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < cv.height; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(140, y + 6, 280, y - 6, 420, y + 3); ctx.stroke(); }
      for (const sp of spots) {
        if (sp.a <= 0.02) continue;
        ctx.fillStyle = `rgba(92,66,40,${sp.a})`;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(60,40,20,${sp.a * 0.5})`;
        ctx.beginPath(); ctx.arc(sp.x + 3, sp.y + 2, sp.r * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      if (this.sparkle > 0) { ctx.font = '28px serif'; ctx.fillText('✨', this.sx - 14, this.sy + 8); }
    };
    drawDirt();
    const total = spots.reduce((a, b) => a + b.a, 0) || 1;
    const prog = el.querySelector('#brush-progress');
    const update = () => {
      const left = spots.reduce((a, b) => a + Math.max(0, b.a), 0);
      const pct = Math.round((1 - left / total) * 100);
      prog.textContent = `Sauber: ${pct}%`;
      return pct;
    };
    update();
    let down = false, strokes = 0, done = false;
    cv.style.touchAction = 'none';
    cv.onpointerdown = (e) => { down = true; cv.style.cursor = 'grabbing'; try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ } cv.onpointermove(e); };
    cv.onpointerup = cv.onpointercancel = () => { down = false; cv.style.cursor = 'grab'; };
    cv.onpointermove = (e) => {
      if (!down || done) return;
      const r = cv.getBoundingClientRect();
      const x = (e.clientX - r.left) * (cv.width / r.width), y = (e.clientY - r.top) * (cv.height / r.height);
      this.sx = x; this.sy = y; this.sparkle = 1;
      for (const sp of spots) if (Math.hypot(sp.x - x, sp.y - y) < sp.r + 18) sp.a -= 0.08;
      strokes++;
      if (strokes % 6 === 0) { g.audio.brush(); g.player.rider.play('brush', 0.8); }
      drawDirt();
      const pct = update();
      h.data.needs.clean = clamp(Math.max(h.data.needs.clean, pct), 0, 100);
      if (pct >= 96 && !done) {
        done = true;
        h.data.needs.clean = 100;
        h.data.needs.happy = clamp(h.data.needs.happy + 15, 0, 100);
        const gave = this.bond(h, 'brush', 4);
        g.audio.blow(h.pos);
        g.ui.toast(`✨ ${h.data.name} glänzt wie neu!${gave ? ' ❤ Bindung +' : ''}`, 'gold');
        g.events.emit('care', { type: 'brush', horse: h });
        prog.innerHTML = '<b>Blitzblank! ✨</b>';
      }
    };
    // ---- hooves
    const hooves = el.querySelector('#hooves');
    const names = ['vorne links', 'vorne rechts', 'hinten links', 'hinten rechts'];
    h.data.hoofDone = h.data.hoofDone || {};
    const hdKey = s.day;
    names.forEach((nm, i) => {
      const b = document.createElement('button');
      const doneH = h.data.hoofDone[i] === hdKey;
      b.className = 'btn small' + (doneH ? ' turq' : '');
      b.textContent = (doneH ? '✔ ' : '🧲 ') + nm;
      b.onclick = () => {
        if (doneH) return;
        g.player.rider.play('hoof', 1.2);
        g.audio.dig();
        h.rig.legs[i].knee.rotation.x += 0.9;
        h.data.hoofDone[i] = hdKey;
        if ([0, 1, 2, 3].every((k) => h.data.hoofDone[k] === hdKey)) {
          this.bond(h, 'hoof', 3);
          g.ui.toast('Alle vier Hufe sind sauber! 👍');
          g.events.emit('care', { type: 'hoof', horse: h });
        }
        refresh();
      };
      hooves.appendChild(b);
    });
    // ---- feed & water
    const feed = el.querySelector('#feed');
    for (const id of ['hay', 'apple', 'carrot', 'treat']) {
      const it = ITEMS[id];
      const cnt = s.items[id] || 0;
      const b = document.createElement('button');
      b.className = 'btn small';
      b.textContent = `${it.icon} ${it.name} (${cnt})`;
      b.disabled = cnt <= 0;
      b.onclick = () => {
        s.items[id]--;
        const n2 = h.data.needs;
        n2.hunger = clamp(n2.hunger + it.food, 0, 100);
        if (it.happy) n2.happy = clamp(n2.happy + it.happy, 0, 100);
        h.startManeuver('graze', { dur: 2.5 });
        g.player.rider.play('feed', 1.2);
        g.audio.crunch();
        const gave = this.bond(h, id === 'treat' ? 'treat' : 'feed_' + id, it.bond);
        g.ui.toast(`${it.icon} ${h.data.name} frisst ${it.name === 'Heu' ? 'Heu' : 'den ' + it.name}. Mmmh!${gave ? ' ❤' : ''}`);
        g.events.emit('care', { type: 'feed', item: id, horse: h });
        refresh();
      };
      feed.appendChild(b);
    }
    const nearWater = riverInfo(h.pos.x, h.pos.z).d < 25 || waterDepthAt(h.pos.x, h.pos.z) > 0 || (g.ranch.has('trough') && g.ranch.isInside(h.pos)) || g.ranch.isInside(h.pos, -40);
    const wb = document.createElement('button');
    wb.className = 'btn turq small';
    wb.textContent = '💧 Tränken';
    wb.disabled = !nearWater;
    wb.title = nearWater ? '' : 'Kein Wasser in der Nähe (Fluss, Tränke oder Ranch).';
    wb.onclick = () => {
      h.data.needs.thirst = 100;
      h.startManeuver('drink', { dur: 3 });
      g.audio.slurp();
      this.bond(h, 'water', 2);
      g.ui.toast(`💧 ${h.data.name} hat ausgiebig getrunken.`);
      g.events.emit('care', { type: 'water', horse: h });
      refresh();
    };
    feed.appendChild(wb);
    if (!nearWater) { const m = document.createElement('div'); m.className = 'muted'; m.textContent = 'Zum Tränken: Fluss, Ranch oder Wassertränke.'; feed.appendChild(m); }
    // ---- love
    const love = el.querySelector('#love');
    const pat = document.createElement('button');
    pat.className = 'btn small'; pat.textContent = '🤗 Streicheln';
    pat.onclick = () => { g.player.rider.play('pat', 1.4); g.audio.blow(h.pos); this.bond(h, 'pat', 2); h.data.needs.happy = clamp(h.data.needs.happy + 5, 0, 100); g.events.emit('care', { type: 'pat', horse: h }); refresh(); };
    const tack = document.createElement('button');
    tack.className = 'btn small'; tack.textContent = '🐎 Ausrüstung';
    tack.onclick = () => { g.ui.closePanel(); g.menus.openMain('tack', h.data.id); };
    const ride = document.createElement('button');
    ride.className = 'btn gold small'; ride.textContent = '🤠 Aufsteigen';
    ride.onclick = () => { g.ui.closePanel(); g.player.mount(h); };
    love.append(pat, tack, ride);
  }

  renderMane(el, refresh) {
    const g = this.game, s = g.state;
    const h = this.horse;
    const ribbons = s.owned.filter((id) => ITEMS[id]?.type === 'ribbon');
    el.innerHTML = `<p class="muted">Flechte die Mähne deines Pferdes! Für Schleifen brauchst du Mähnenschleifen aus der Sattlerei.</p>
      <div class="section-title">Mähne</div><div class="row" id="styles"></div>
      <div class="section-title">Schleifen</div><div class="row" id="ribbons"></div>
      <div class="section-title">Schweif</div><div class="row" id="tail"></div>`;
    const styles = [['offen', 'Offen & wild'], ['zoepfe', 'Zöpfe'], ['schleifen', 'Zöpfe mit Schleifen']];
    for (const [k, label] of styles) {
      const b = document.createElement('button');
      b.className = 'btn small' + (h.data.maneStyle === k ? ' turq' : '');
      b.textContent = label;
      b.disabled = k === 'schleifen' && !ribbons.length;
      b.onclick = () => {
        h.data.maneStyle = k;
        if (k === 'schleifen' && !h.data.ribbon) h.data.ribbon = ITEMS[ribbons[0]].color;
        h.applyManeStyle();
        g.player.rider.play('brush', 1.5);
        if (k !== 'offen') { this.bond(h, 'braid', 2); g.events.emit('care', { type: 'braid', horse: h }); }
        refresh();
      };
      el.querySelector('#styles').appendChild(b);
    }
    for (const id of ribbons) {
      const it = ITEMS[id];
      const b = document.createElement('button');
      b.className = 'btn small';
      b.innerHTML = `<span class="swatch" style="background:#${it.color.toString(16).padStart(6, '0')}"></span>${esc(it.name)}`;
      b.onclick = () => { h.data.ribbon = it.color; h.data.maneStyle = 'schleifen'; h.applyManeStyle(); refresh(); };
      el.querySelector('#ribbons').appendChild(b);
    }
    if (!ribbons.length) el.querySelector('#ribbons').innerHTML = '<span class="muted">Noch keine Schleifen – Martha in der Sattlerei verkauft welche.</span>';
    const tb = document.createElement('button');
    tb.className = 'btn small' + (h.data.tailBraid ? ' turq' : '');
    tb.textContent = h.data.tailBraid ? 'Schweif öffnen' : 'Schweif flechten';
    tb.onclick = () => { h.data.tailBraid = !h.data.tailBraid; if (h.data.maneStyle === 'offen' && h.data.tailBraid) h.data.maneStyle = 'zoepfe'; h.applyManeStyle(); refresh(); };
    el.querySelector('#tail').appendChild(tb);
  }

  update() {
    if (this.horse && this.game.ui.panelOpen) {
      this.horse.speed = 0;
      this.game.player.faceTowards(this.horse.pos);
    }
  }
}
