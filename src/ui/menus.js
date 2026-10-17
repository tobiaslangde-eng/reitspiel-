import * as THREE from 'three';
import { ITEMS, TYPE_NAMES, SLOT_NAMES } from '../game/catalog.js';
import { BREEDS, COATS, PERSONALITIES, bondLevel, breedName } from '../horse/breeds.js';
import { ACHIEVEMENTS } from '../game/achievements.js';
import { WEATHER } from '../world/weather.js';
import { SEASON_NAMES } from '../world/sky.js';
import { WORLD_SIZE, HALF, RANCH, TOWN, ARENA } from '../world/terrain.js';
import { formatMoney } from '../core/utils.js';
import { deleteSave } from '../game/state.js';
import { esc } from './ui.js';

const TACK_SLOTS = [['saddle', 'Sattel'], ['pad', 'Satteldecke'], ['bridle', 'Zaumzeug'], ['breast', 'Brustgeschirr'], ['wraps', 'Gamaschen'], ['mask', 'Fliegenmaske']];

export class Menus {
  constructor(game) {
    this.game = game;
    this.selHorse = null;
  }

  openMain(tab = 'horses', horseId = null) {
    const g = this.game;
    if (horseId) this.selHorse = horseId;
    const tabs = [
      { id: 'horses', label: '🐴 Pferde', render: (el, r) => this.renderHorses(el, r) },
      { id: 'tack', label: '🏇 Ausrüstung', render: (el, r) => this.renderTack(el, r) },
      { id: 'outfit', label: '🤠 Outfit', render: (el, r) => this.renderOutfit(el, r) },
      { id: 'items', label: '🎒 Inventar', render: (el, r) => this.renderItems(el, r) },
      { id: 'quests', label: '📜 Aufträge', render: (el, r) => { el.innerHTML = '<div id="aq"></div>'; g.quests.renderActive(el.querySelector('#aq'), r); } },
      { id: 'trophies', label: '🏆 Vitrine', render: (el) => this.renderTrophies(el) },
      { id: 'ach', label: '🏅 Erfolge', render: (el) => this.renderAch(el) },
      { id: 'settings', label: '⚙️ Optionen', render: (el, r) => this.renderSettings(el, r) },
    ];
    g.ui.openPanel(`${g.state.playerName}s Ranch`, tabs);
    if (tab !== 'horses') g.ui.selectTab(tab);
  }

  horse() {
    const g = this.game;
    const id = this.selHorse || g.state.activeHorse;
    return g.horses.find((h) => h.data.id === id) || g.horses[0];
  }

  // -------------------------------------------------------------- horses
  renderHorses(el, refresh) {
    const g = this.game, s = g.state;
    const sel = this.horse();
    el.innerHTML = `<p class="muted">Stallplätze: ${s.horses.length}/${g.ranch.capacity()} · Aktives Pferd kommt auf Pfiff (H).</p><div class="two-col"><div class="grid" id="hl" style="grid-template-columns:1fr"></div><div id="hd"></div></div>`;
    const list = el.querySelector('#hl');
    for (const h of g.horses) {
      if (h.data.wild) continue;
      const d = h.data;
      const c = document.createElement('div');
      c.className = 'card' + (h === sel ? ' sel' : '');
      c.style.cursor = 'pointer';
      const col = COATS[d.coat].base.map((v) => Math.round(v * 255)).join(',');
      const bl = bondLevel(d.bond);
      c.innerHTML = `<h3><span class="swatch" style="background:rgb(${col})"></span>${esc(d.name)} ${d.id === s.activeHorse ? '<span class="tag gold">aktiv</span>' : ''} ${(d.growth ?? 1) < 1 ? '<span class="tag turq">Fohlen</span>' : ''}</h3>
        <div class="muted">${esc(breedName(d))} · ${COATS[d.coat].name} · ${'❤'.repeat(bl.lvl)}</div>`;
      c.onclick = () => { this.selHorse = d.id; refresh(); };
      list.appendChild(c);
    }
    const d = sel.data;
    const pip = (v) => `<div class="pips"><i style="width:${v * 10}%"></i></div>`;
    const bl = bondLevel(d.bond);
    const hd = el.querySelector('#hd');
    hd.innerHTML = `<div class="card">
      <h3 style="font-size:22px">${esc(d.name)}</h3>
      <div>${esc(breedName(d))} · ${COATS[d.coat].name} · ${d.gender} · ${d.age} Jahre</div>
      <div class="muted">${PERSONALITIES[d.personality].icon} ${PERSONALITIES[d.personality].name} – ${PERSONALITIES[d.personality].desc}</div>
      ${d.parents ? `<div class="muted">Eltern: ${esc(d.parents.join(' & '))}</div>` : ''}
      <div class="section-title">Werte</div>
      <div class="stat">Tempo ${pip(d.stats.speed)} ${d.stats.speed}</div>
      <div class="stat">Ausdauer ${pip(d.stats.stamina)} ${d.stats.stamina}</div>
      <div class="stat">Wendigkeit ${pip(d.stats.agility)} ${d.stats.agility}</div>
      <div class="stat">Bindung <div class="pips"><i style="width:${d.bond}%;background:linear-gradient(90deg,#ff6a9a,#ffb0c8)"></i></div> ${bl.name}</div>
      <div class="muted">${d.shoes ? '🧲 Beschlagen' : 'Barhuf'} · Erfahrung ${Math.round(d.xp || 0)} · Wachstum ${Math.round((d.growth ?? 1) * 100)}%</div>
      <div class="desc">${esc(BREEDS[d.breed].desc)}</div>
      <div class="row" id="hbtn"></div></div>
      <div id="breed"></div>`;
    const row = hd.querySelector('#hbtn');
    const mk = (t, cls, fn) => { const b = document.createElement('button'); b.className = 'btn small ' + cls; b.textContent = t; b.onclick = fn; row.appendChild(b); return b; };
    mk('⭐ Als aktiv setzen', 'gold', () => { s.activeHorse = d.id; refresh(); }).disabled = d.id === s.activeHorse;
    mk('✏️ Umbenennen', '', () => {
      const n = prompt('Neuer Name für dein Pferd:', d.name);
      if (n && n.trim()) { d.name = n.trim().slice(0, 20); refresh(); }
    });
    mk('🏇 Ausrüstung', '', () => this.game.ui.selectTab('tack'));
    // breeding
    const br = hd.querySelector('#breed');
    if (g.wildlife.canBreed()) {
      const mares = s.horses.filter((h) => h.gender === 'Stute' && (h.growth ?? 1) >= 1);
      const stallions = s.horses.filter((h) => h.gender === 'Hengst' && (h.growth ?? 1) >= 1);
      br.innerHTML = `<div class="card"><h3>🍼 Fohlenzucht ($300)</h3>
        ${s.pregnancies.length ? `<div class="muted">Erwartet: ${s.pregnancies.map((p) => `${esc(s.horses.find((h) => h.id === p.mare)?.name || '?')} (Tag ${p.due})`).join(', ')}</div>` : ''}
        ${mares.length && stallions.length ? `<div class="row"><select id="mare">${mares.map((m) => `<option value="${m.id}">${esc(m.name)} ♀ (${esc(BREEDS[m.breed].name)})</option>`).join('')}</select>
        <select id="stal">${stallions.map((m) => `<option value="${m.id}">${esc(m.name)} ♂ (${esc(BREEDS[m.breed].name)})</option>`).join('')}</select>
        <button class="btn gold small" id="dobreed">Zucht starten</button></div>` : '<div class="muted">Du brauchst eine erwachsene Stute und einen Hengst.</div>'}</div>`;
      const btn = br.querySelector('#dobreed');
      if (btn) btn.onclick = () => {
        const m = s.horses.find((h) => h.id === br.querySelector('#mare').value);
        const st = s.horses.find((h) => h.id === br.querySelector('#stal').value);
        if (g.wildlife.breed(m, st)) refresh();
      };
    } else {
      br.innerHTML = '<p class="muted">🍼 Baue den zweiten Stall, um Fohlen zu züchten.</p>';
    }
  }

  // -------------------------------------------------------------- tack
  renderTack(el, refresh) {
    const g = this.game, s = g.state;
    const h = this.horse();
    const d = h.data;
    el.innerHTML = `<p>Ausrüstung für <b>${esc(d.name)}</b> <select id="hsel">${g.horses.filter((x) => !x.data.wild).map((x) => `<option value="${x.data.id}" ${x === h ? 'selected' : ''}>${esc(x.data.name)}</option>`).join('')}</select>
      <button class="btn small turq" id="tessa">✨ Komplettes Tessa-Set anlegen</button></p><div id="slots"></div>`;
    el.querySelector('#hsel').onchange = (e) => { this.selHorse = e.target.value; refresh(); };
    el.querySelector('#tessa').onclick = () => {
      Object.assign(d.tack, { saddle: 'saddle_tessa', bridle: 'bridle_tessa', pad: 'pad_tessa', breast: 'breast_tessa' });
      g.tack.dress(h); refresh();
    };
    const slots = el.querySelector('#slots');
    for (const [slot, label] of TACK_SLOTS) {
      const owned = s.owned.filter((id) => ITEMS[id]?.type === slot);
      const div = document.createElement('div');
      div.innerHTML = `<div class="section-title">${label}</div><div class="row"></div>`;
      const row = div.querySelector('.row');
      const none = document.createElement('button');
      none.className = 'btn small' + (!d.tack[slot] ? ' turq' : '');
      none.textContent = 'Ohne';
      none.onclick = () => { d.tack[slot] = null; g.tack.dress(h); refresh(); };
      row.appendChild(none);
      for (const id of owned) {
        const it = ITEMS[id];
        const b = document.createElement('button');
        b.className = 'btn small' + (d.tack[slot] === id ? ' turq' : '') + (it.special ? ' gold' : '');
        const c = it.leather ?? it.color;
        b.innerHTML = `${c !== undefined ? `<span class="swatch" style="background:#${new THREE.Color(c).getHexString()}"></span>` : ''}${esc(it.name)}`;
        b.title = it.desc || '';
        b.onclick = () => { d.tack[slot] = id; g.tack.dress(h); g.audio.click(); refresh(); };
        row.appendChild(b);
      }
      if (!owned.length) row.insertAdjacentHTML('beforeend', '<span class="muted">Noch nichts – schau in der Sattlerei vorbei!</span>');
      slots.appendChild(div);
    }
  }

  // -------------------------------------------------------------- outfit
  renderOutfit(el, refresh) {
    const g = this.game, s = g.state;
    el.innerHTML = '<p class="muted">Neue Kleidung gibt es bei Jesse im Modeladen von Dusty Creek.</p><div id="os"></div>';
    const os = el.querySelector('#os');
    for (const [slot, label] of Object.entries(SLOT_NAMES)) {
      const owned = s.owned.filter((id) => ITEMS[id]?.type === 'outfit' && ITEMS[id].slot === slot);
      const div = document.createElement('div');
      div.innerHTML = `<div class="section-title">${label}</div><div class="row"></div>`;
      const row = div.querySelector('.row');
      for (const id of owned) {
        const it = ITEMS[id];
        const b = document.createElement('button');
        b.className = 'btn small' + (s.outfit[slot] === id ? ' turq' : '');
        b.innerHTML = `${it.color ? `<span class="swatch" style="background:#${new THREE.Color(it.color).getHexString()}"></span>` : ''}${esc(it.name)}`;
        b.onclick = () => { s.outfit[slot] = id; g.player.rider.setOutfit(s.outfit); refresh(); };
        row.appendChild(b);
      }
      os.appendChild(div);
    }
  }

  renderItems(el) {
    const s = this.game.state;
    const items = Object.entries(s.items).filter(([, n]) => n > 0);
    el.innerHTML = `<p>Kontostand: <b>${formatMoney(s.money)}</b></p><div class="grid">${items.map(([id, n]) => `<div class="card"><h3>${ITEMS[id]?.icon || ''} ${esc(ITEMS[id]?.name || id)}</h3><div>Anzahl: <b>${n}</b></div><div class="muted">${TYPE_NAMES[ITEMS[id]?.type] || ''}</div></div>`).join('') || '<p>Dein Inventar ist leer.</p>'}</div>
      <div class="section-title">Besitz</div><div class="muted">${s.owned.filter((id) => ITEMS[id] && ITEMS[id].type !== 'outfit').map((id) => esc(ITEMS[id].name)).join(' · ')}</div>
      ${s.treasure ? '<p>🗺️ Du hast eine aktive Schatzkarte – öffne die Karte (M)!</p>' : ''}`;
  }

  renderTrophies(el) {
    const s = this.game.state;
    const tr = s.trophies;
    el.innerHTML = `<p class="muted">${this.game.ranch.has('house') ? 'Deine Pokale stehen auch in der Vitrine auf der Veranda deines Ranchhauses!' : 'Baue das Ranchhaus, um deine Pokale in einer echten Vitrine auszustellen.'}</p>
      <div class="trophy-shelf">${tr.map((t) => `<div class="trophy"><div class="ic">${t.kind === 'trophy' ? (t.place === 1 ? '🏆' : '🥈') : (t.place === 1 ? '🎗️' : t.place === 2 ? '🔴' : '⚪')}</div>
      <b>${t.place}. Platz</b><div class="muted">${esc(t.event)}<br>${esc(t.tier)} · ${esc(t.horse)}<br>Tag ${t.day}</div></div>`).join('') || '<p>Noch keine Trophäen. Melde dich bei Dolly an der Rodeo-Arena an!</p>'}</div>`;
  }

  renderAch(el) {
    const s = this.game.state;
    const n = ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;
    el.innerHTML = `<p>${n} von ${ACHIEVEMENTS.length} freigeschaltet</p><div class="grid">${ACHIEVEMENTS.map((a) => `<div class="card ach ${s.achievements[a.id] ? 'done' : ''}"><div class="icon">${s.achievements[a.id] ? a.icon : '🔒'}</div><h3>${esc(a.name)}</h3><div class="desc">${esc(a.desc)}</div></div>`).join('')}</div>`;
  }

  renderSettings(el) {
    const g = this.game, s = g.state, st = s.settings;
    el.innerHTML = `<div class="two-col"><div>
      <div class="section-title">Ton</div>
      <label>Musik <input type="range" id="mv" min="0" max="1" step="0.05" value="${st.music}"></label><br>
      <label>Geräusche <input type="range" id="sv" min="0" max="1" step="0.05" value="${st.sfx}"></label>
      <div class="section-title">Steuerung</div>
      <label>Maus-Empfindlichkeit <input type="range" id="ms" min="0.3" max="2.5" step="0.1" value="${st.sensitivity}"></label>
      <div class="section-title">Grafik</div>
      <label>Qualität <select id="q"><option value="auto">Automatisch</option><option value="low">Niedrig</option><option value="medium">Mittel</option><option value="high">Hoch</option></select></label>
      <p class="muted">Aktuell: ${g.quality}. Änderungen gelten nach Neustart.</p>
    </div><div>
      <div class="section-title">Jahreszeit</div>
      <select id="season"><option value="">Automatisch (wechselt alle 5 Tage)</option>${Object.entries(SEASON_NAMES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <div class="section-title">Wetter</div>
      <select id="weather"><option value="">Automatisch</option>${Object.entries(WEATHER).map(([k, v]) => `<option value="${k}">${v.icon} ${v.name}</option>`).join('')}</select>
      <div class="section-title">Uhrzeit</div>
      <div class="row">${[['🌅 Morgen', 6.5], ['☀️ Mittag', 12], ['🌇 Sonnenuntergang', 17.7], ['🌙 Nacht', 23]].map(([l, h]) => `<button class="btn small" data-h="${h}">${l}</button>`).join('')}</div>
      <div class="section-title">Spielstand</div>
      <div class="row"><button class="btn small gold" id="save">💾 Speichern</button><button class="btn small" id="reset">🗑️ Neues Spiel</button></div>
    </div></div>`;
    el.querySelector('#q').value = st.quality;
    el.querySelector('#season').value = st.seasonOverride || '';
    el.querySelector('#weather').value = st.weatherOverride || '';
    el.querySelector('#mv').oninput = (e) => { st.music = +e.target.value; g.audio.setVolumes(st.music, st.sfx); };
    el.querySelector('#sv').oninput = (e) => { st.sfx = +e.target.value; g.audio.setVolumes(st.music, st.sfx); };
    el.querySelector('#ms').oninput = (e) => { st.sensitivity = +e.target.value; g.followCam.sensitivity = 0.0035 * st.sensitivity; };
    el.querySelector('#q').onchange = (e) => { st.quality = e.target.value; };
    el.querySelector('#season').onchange = (e) => {
      st.seasonOverride = e.target.value || null;
      const ns = g.computeSeason();
      if (ns !== g.season) { g.season = ns; g.applySeason(); }
    };
    el.querySelector('#weather').onchange = (e) => { st.weatherOverride = e.target.value || null; g.weather.override = st.weatherOverride; if (!st.weatherOverride) g.weather.nextChange = 0; };
    el.querySelectorAll('[data-h]').forEach((b) => (b.onclick = () => { s.hour = +b.dataset.h; g.envT = 0; }));
    el.querySelector('#save').onclick = () => g.save();
    el.querySelector('#reset').onclick = () => { if (confirm('Wirklich ein neues Spiel starten? Der aktuelle Spielstand wird gelöscht.')) { deleteSave(); location.reload(); } };
  }

  // -------------------------------------------------------------- map
  openMap() {
    const g = this.game, s = g.state;
    g.ui.openPanel('Karte des Territoriums', (el) => {
      el.innerHTML = `<canvas id="bigmap" width="900" height="900"></canvas>
        <div class="row" style="justify-content:center;margin-top:8px"><button class="btn small" data-t="ranch">🏠 Zur Ranch reisen</button><button class="btn small" data-t="town">🏘️ Nach Dusty Creek reisen</button><button class="btn small" data-t="arena">🏆 Zur Rodeo-Arena reisen</button></div>
        <p class="muted" style="text-align:center">Schnellreise nur zu bekannten Orten. ${s.treasure ? '❌ = Schatzgebiet (gestrichelter Kreis)' : ''}</p>`;
      const cv = el.querySelector('#bigmap');
      const ctx = cv.getContext('2d');
      const W = cv.width;
      ctx.drawImage(g.ui.mapImg, 0, 0, W, W);
      const toPx = (x, z) => [((x + HALF) / WORLD_SIZE) * W, ((z + HALF) / WORLD_SIZE) * W];
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const icon = (x, z, ic, label, size = 22) => {
        const [px, py] = toPx(x, z);
        ctx.font = `${size}px serif`; ctx.fillText(ic, px, py);
        if (label) { ctx.font = '15px Rye, serif'; ctx.fillStyle = '#2a1608'; ctx.fillText(label, px, py + size * 0.9); }
      };
      icon(RANCH.x, RANCH.z, '🏠', 'Deine Ranch', 26);
      icon(TOWN.x, TOWN.z, '🏘️', 'Dusty Creek', 26);
      icon(ARENA.x, ARENA.z, '🏆', 'Rodeo', 20);
      icon(160, 120, '🏡', 'Millers', 18);
      icon(70, 430, '🐎', 'Mustangs', 18);
      for (const p of g.places.list) if (s.discovered.includes(p.id)) icon(p.x, p.z, p.icon, p.name, 18);
      for (const m of g.quests.markers()) icon(m.x, m.z, m.icon, '', 16);
      if (s.treasure) {
        const [px, py] = toPx(s.treasure.cx, s.treasure.cz);
        const r = (s.treasure.r / WORLD_SIZE) * W;
        ctx.setLineDash([8, 6]); ctx.strokeStyle = '#a01010'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        icon(s.treasure.cx, s.treasure.cz, '❌', '', 20);
      }
      const pp = g.player.position;
      const [px, py] = toPx(pp.x, pp.z);
      ctx.fillStyle = '#ffd040'; ctx.strokeStyle = '#2a1608'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = '16px Rye, serif'; ctx.fillStyle = '#2a1608'; ctx.fillText('Du', px, py - 18);
      ctx.font = 'bold 26px Rye, serif'; ctx.fillText('N', W / 2, 24);
      el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => this.travel(b.dataset.t)));
    });
  }

  travel(where) {
    const g = this.game;
    if (g.competitions.active) { g.ui.toast('Nicht während eines Turniers!'); return; }
    const dest = { ranch: { x: RANCH.x + 8, z: RANCH.z + 14 }, town: { x: TOWN.x - 60, z: TOWN.z + 2 }, arena: { x: ARENA.x - 36, z: ARENA.z + 8 } }[where];
    g.ui.closePanel();
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    setTimeout(() => {
      const p = g.player;
      if (p.mode === 'ride') p.horse.setPosition(dest.x, dest.z, p.horse.heading);
      else {
        p.pos.set(dest.x, 0, dest.z);
        const h = g.activeHorseEntity();
        if (h && !h.rider) { h.setPosition(dest.x + 2, dest.z + 1); h.state = 'stand'; h.home = null; }
      }
      g.followCam.focus.set(dest.x, 0, dest.z);
      g.state.hour += 0.5;
      fade.classList.remove('on');
    }, 700);
  }

  // -------------------------------------------------------------- pause & help
  openPause() {
    const g = this.game;
    if (g.ranch.placing) return;
    if (g.competitions.active) { g.competitions.abort('Turnier abgebrochen.'); return; }
    g.ui.openPanel('Pause', (el) => {
      el.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;max-width:360px;margin:0 auto">
        <button class="btn gold" id="p-resume">▶ Weiterspielen</button>
        <button class="btn" id="p-save">💾 Speichern</button>
        <button class="btn" id="p-menu">📖 Menü (Tab)</button>
        <button class="btn" id="p-help">❓ Steuerung & Hilfe</button>
        <button class="btn" id="p-quit">🏠 Speichern & zum Hauptmenü</button></div>`;
      el.querySelector('#p-resume').onclick = () => g.ui.closePanel();
      el.querySelector('#p-save').onclick = () => { g.save(); g.ui.closePanel(); };
      el.querySelector('#p-menu').onclick = () => { g.ui.closePanel(); this.openMain(); };
      el.querySelector('#p-help').onclick = () => this.showHelp();
      el.querySelector('#p-quit').onclick = () => { g.save(true); location.reload(); };
    });
  }

  showHelp(first = false) {
    const g = this.game;
    g.ui.openPanel(first ? `Willkommen auf der Silver Spur Ranch!` : 'Steuerung & Hilfe', (el) => {
      el.innerHTML = `${first ? `<p style="font-size:17px">Howdy, <b>${esc(g.state.playerName)}</b>! Das hier ist deine eigene kleine Ranch – noch mit Planwagen und Lagerfeuer. Verdiene Geld mit Aufträgen und Rodeos, baue die Ranch aus, sammle Pferde und erkunde die Prärie. Dein Pferd trägt schon den Spezialsattel <b>„Tessa“</b>! ✨</p>` : ''}
      <div class="two-col"><div>
        <div class="section-title">Reiten</div>
        <div class="list-item"><span>W / S</span><span>Vorwärts / Bremsen, Rückwärtsrichten</span></div>
        <div class="list-item"><span>A / D</span><span>Lenken</span></div>
        <div class="list-item"><span>1 · 2 · 3 (oder Q/R)</span><span>Schritt · Trab · Galopp</span></div>
        <div class="list-item"><span>Shift (halten)</span><span>Eine Gangart schneller (Renngalopp)</span></div>
        <div class="list-item"><span>Leertaste</span><span>Springen (ab Trab)</span></div>
        <div class="list-item"><span>X</span><span>Sliding Stop (aus dem Galopp)</span></div>
        <div class="list-item"><span>C + A/D (halten)</span><span>Spin (im Stand)</span></div>
        <div class="list-item"><span>Z / Y</span><span>Steigen (ab Bindung „Vertraut“)</span></div>
        <div class="list-item"><span>T</span><span>Pferd loben / klopfen</span></div>
        <div class="list-item"><span>F</span><span>Lasso werfen / loslassen</span></div>
      </div><div>
        <div class="section-title">Allgemein</div>
        <div class="list-item"><span>E</span><span>Auf-/Absteigen, Sprechen, Benutzen</span></div>
        <div class="list-item"><span>H</span><span>Pferd herpfeifen (zu Fuß)</span></div>
        <div class="list-item"><span>G</span><span>Pferd pflegen (zu Fuß)</span></div>
        <div class="list-item"><span>Strg / C</span><span>Ducken (Wildpferde zähmen)</span></div>
        <div class="list-item"><span>Maus ziehen / Klick</span><span>Kamera drehen (Klick = Maus fangen)</span></div>
        <div class="list-item"><span>Mausrad</span><span>Kamera-Zoom</span></div>
        <div class="list-item"><span>Tab / I</span><span>Menü: Pferde, Ausrüstung, Outfit …</span></div>
        <div class="list-item"><span>M · J · B</span><span>Karte · Aufträge · Ranch ausbauen</span></div>
        <div class="list-item"><span>P</span><span>Fotomodus</span></div>
        <div class="list-item"><span>Esc</span><span>Pause</span></div>
      </div></div>
      <div class="section-title">Tipps</div>
      <ul>
        <li>Die Ausdauerleiste sinkt im Galopp – im Schritt erholt sich dein Pferd.</li>
        <li>Je besser du dein Pferd pflegst (G), desto größer die Bindung – und desto besser gehorcht es.</li>
        <li>In <b>Dusty Creek</b> (Osten, der Straße folgen) gibt es Aufträge, Läden, den Hufschmied und den Pferdehandel. Südlich davon liegt die Rodeo-Arena.</li>
        <li>Rosie im Saloon verkauft Schatzkarten und kennt Gerüchte über versteckte Orte.</li>
      </ul>
      ${first ? '<div style="text-align:center"><button class="btn gold" id="go">Los geht\'s! 🤠</button></div>' : ''}`;
      const go = el.querySelector('#go');
      if (go) go.onclick = () => g.ui.closePanel();
    }, () => { g.state.tutorialDone = true; });
  }
}

