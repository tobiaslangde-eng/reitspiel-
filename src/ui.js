// Menüs, Editoren, HUD
import { BREEDS, BREED, STATS, STAT_NAMES, TYPE_NAMES, COLOR_PRESETS, FACE_NAMES, LEG_NAMES, coatOf, statOf, ageText, horseValue, makeHorse, genesFromPreset, foalColorOdds, randomName, RIDE_AGE } from './data.js';
import { SKINS, HAIRS, CLOTHES, HAIR_STYLES } from './human.js';
import { DISCIPLINES, LEVELS, PRIZE } from './events.js';
import { GAIT_NAMES } from './entities.js';
import { LOC, POIS, TRACK, PADDOCK, MARKET } from './world.js';
import { fmtMoney, clamp, TAU } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SEX = { Stute: '♀ Stute', Hengst: '♂ Hengst', Wallach: '⚲ Wallach' };
const HATS = ['#c9b38a', '#3b2a1c', '#111114', '#e8e3d6', '#7a5a3a'];

export class UI {
  constructor(G) {
    this.G = G; this.screen = $('#screen'); this.open = null; this.sel = null; this.tab = 'horses';
    this.screen.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) { G.audio.start(); G.audio.click(); this.act(b.dataset.a, b.dataset.v, b); } });
    this.screen.addEventListener('input', (e) => { const t = e.target; if (t.dataset.i) this.inp(t.dataset.i, t.value, t); });
    this.mm = $('#minimap canvas').getContext('2d');
    this.el = { money: $('#money'), clock: $('#clock'), hname: $('#hname'), hgait: $('#hgait'), hspeed: $('#hspeed'), stam: $('#stam i'), prompt: $('#prompt'), ev: $('#ev'), evMain: $('#evMain'), evSub: $('#evSub'), task: $('#task'), msg: $('#msg'), count: $('#count'), toasts: $('#toasts'), loc: $('#loc'), hinfo: $('#hinfo'), gaits: $('#gaits') };
  }
  toast(text, kind = '') { const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = text; this.el.toasts.appendChild(d); setTimeout(() => d.classList.add('out'), 4200); setTimeout(() => d.remove(), 4800); }
  banner(text) { const l = this.el.loc; l.textContent = text; l.classList.remove('show'); void l.offsetWidth; l.classList.add('show'); }
  show(name, html, cls = '') { this.open = name; this.screen.className = 'on ' + cls; this.screen.innerHTML = html; document.body.classList.add('ui-open'); if (document.pointerLockElement) document.exitPointerLock(); }
  close() { this.open = null; this.screen.className = ''; this.screen.innerHTML = ''; document.body.classList.remove('ui-open'); this.G.preview.stop(); }

  // ---------- Bausteine ----------
  bars(h) {
    return `<div class="stats">${STATS.map((k) => { const v = statOf(h, k), p = h.pot[k]; return `<div class="st"><span>${STAT_NAMES[k]}</span><div class="bar"><i style="width:${clamp(v, 0, 100)}%"></i><b style="left:${p}%"></b></div><em>${Math.round(v)}</em></div>`; }).join('')}</div>`;
  }
  meta(h) { const c = coatOf(h.genes, h.age); return `<span class="dot" style="background:${c.body}"></span>${esc(h.breedName)} · ${SEX[h.sex]} · ${ageText(h)} · ${c.name} · ${Math.round(h.conf.height * (h.age < 4 ? 0.6 + 0.4 * (1 - (1 - h.age / 4) ** 2) : 1))} cm`; }
  swatches(key, list, cur) { return `<div class="sw">${list.map((c) => `<button data-a="sw" data-v="${key}|${c}" class="${c === cur ? 'on' : ''}" style="background:${c}" aria-label="Farbe"></button>`).join('')}</div>`; }
  seg(key, list, cur) { return `<div class="seg">${list.map((l, i) => `<button data-a="seg" data-v="${key}|${i}" class="${i === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`; }

  // ---------- Titel ----------
  title() {
    const has = this.G.hasSave();
    this.show('title', `<div class="title"><div class="logo"><small>Open-World-Reitspiel</small><h1>Silbertal<span>Ranch</span></h1><p>Züchte, trainiere und reite deine Pferde – Western und Englisch.</p></div>
    <div class="menu">${has ? '<button class="big pri" data-a="continue">Fortsetzen</button>' : ''}<button class="big ${has ? '' : 'pri'}" data-a="new">Neues Spiel</button><button class="big" data-a="help">Steuerung</button></div></div>`, 'clear');
  }
  help(back) {
    this.back = back;
    this.show('help', `<div class="panel narrow"><h2>Steuerung</h2><div class="cols2"><div><h3>Im Sattel</h3><table class="keys">
    <tr><td><kbd>W</kbd> / <kbd>S</kbd></td><td>Gangart höher / niedriger (Schritt · Trab · Galopp · Renngalopp)</td></tr><tr><td><kbd>A</kbd> <kbd>D</kbd></td><td>Lenken · im Stand: Wenden / Spins</td></tr><tr><td><kbd>Shift</kbd></td><td>Treiben (Sprint im Renngalopp)</td></tr><tr><td><kbd>Leertaste</kbd></td><td>Springen</td></tr><tr><td><kbd>X</kbd></td><td>Durchparieren zum Halt (Western: Sliding Stop)</td></tr><tr><td><kbd>S</kbd> halten</td><td>im Stand rückwärts richten</td></tr><tr><td><kbd>E</kbd></td><td>Absteigen / Aktion</td></tr></table></div>
    <div><h3>Zu Fuß &amp; allgemein</h3><table class="keys"><tr><td><kbd>W A S D</kbd></td><td>Laufen · <kbd>Shift</kbd> rennen</td></tr><tr><td><kbd>E</kbd></td><td>Aufsteigen / Aktion</td></tr><tr><td><kbd>H</kbd></td><td>Pferd herbeipfeifen</td></tr><tr><td>Maus</td><td>Kamera (Klick fängt die Maus) · Mausrad Zoom</td></tr><tr><td><kbd>Tab</kbd> / <kbd>M</kbd></td><td>Handy: Karte, Schnellreise, Einstellungen</td></tr></table>
    <p class="hint">Touch: links Joystick, rechts wischen für die Kamera, Tasten am rechten Rand.</p></div></div><div class="row end"><button class="pri" data-a="back">Zurück</button></div></div>`);
  }

  // ---------- Charakter-Editor ----------
  charEditor(look, name, done, first) {
    this.ce = { look: { ...look }, name, done, first, style: 0 };
    this.G.preview.human(this.ce.look, 'western'); this.renderChar();
  }
  renderChar() {
    const c = this.ce, l = c.look;
    this.show('char', `<div class="side"><h2>${c.first ? 'Erstelle deine Reiterin / deinen Reiter' : 'Charakter bearbeiten'}</h2>
    <label>Name<input data-i="cname" value="${esc(c.name)}" maxlength="18" id="in-cname"></label>
    <label>Statur<input type="range" min="0" max="1" step="0.05" value="${l.build}" data-i="build" id="in-build"></label>
    <label>Größe<input type="range" min="0.9" max="1.08" step="0.01" value="${l.size}" data-i="size" id="in-size"></label>
    <label>Hautton</label>${this.swatches('skin', SKINS, l.skin)}
    <label>Frisur</label>${this.seg('hairStyle', HAIR_STYLES, l.hairStyle)}
    <label>Haarfarbe</label>${this.swatches('hair', HAIRS, l.hair)}
    <label>Outfit-Vorschau</label>${this.seg('pstyle', ['Western', 'Englisch'], c.style)}
    ${c.style === 0 ? `<label>Hemd</label>${this.swatches('shirt', CLOTHES, l.shirt)}<label>Jeans</label>${this.swatches('jeans', CLOTHES, l.jeans)}<label>Hut</label>${this.swatches('hat', HATS, l.hat)}` : `<label>Turnierjacket</label>${this.swatches('jacket', CLOTHES, l.jacket)}<label>Reithose</label>${this.swatches('breeches', CLOTHES, l.breeches)}`}
    <div class="row end">${c.first ? '' : '<button data-a="cancel">Abbrechen</button>'}<button class="pri" data-a="charDone">${c.first ? 'Weiter zum Pferd' : 'Übernehmen'}</button></div></div>`, 'clear left');
  }

  // ---------- Pferde-Editor ----------
  horseEditor(o) {
    const b = BREED[o.breed || 'quarter'];
    this.he = { o, breed: b.id, sex: 'Stute', color: 'Brauner', grey: false, roan: false, tobiano: false, leopard: false, face: 1, legs: 1, mane: b.conf.mane, hk: 0.5, bulk: 1, name: randomName('Stute'), style: b.type === 'W' ? 0 : 1, age: 5 };
    this.makeEd(); this.renderHorseEd();
  }
  makeEd() {
    const e = this.he, b = BREED[e.breed];
    const h = makeHorse({ breed: e.breed, sex: e.sex, age: e.age, genes: genesFromPreset(e.color, e), face: e.face, legs: [e.legs, e.legs > 1 ? e.legs - 1 : e.legs, e.legs, e.legs], height: Math.round(b.height[0] + (b.height[1] - b.height[0]) * e.hk), bulkMul: e.bulk, mane: e.mane, name: e.name, train: 0.4, bond: 30 });
    if (e.h) { h.pot = e.h.breed === h.breed ? e.h.pot : h.pot; h.seed = e.h.seed; h.id = e.h.id; }
    h.style = e.style ? 'english' : 'western'; e.h = h; this.G.preview.horse(h);
  }
  price() { const e = this.he; return e.o.free ? 0 : Math.round(BREED[e.breed].price * 1.4 / 50) * 50; }
  renderHorseEd() {
    const e = this.he, b = BREED[e.breed], groups = {};
    for (const br of BREEDS) (groups[br.type] = groups[br.type] || []).push(br);
    const pr = this.price(), can = pr <= this.G.state.money;
    this.show('horse', `<div class="side wide"><h2>${e.o.free ? 'Gestalte dein erstes Pferd' : 'Wunschpferd gestalten'}</h2>
    <label>Rasse<select data-i="breed" id="in-breed">${Object.keys(groups).map((t) => `<optgroup label="${TYPE_NAMES[t]}">${groups[t].map((br) => `<option value="${br.id}" ${br.id === e.breed ? 'selected' : ''}>${br.name}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <p class="desc"><b>${b.origin}</b> · ${TYPE_NAMES[b.type]} · ${b.height[0]}–${b.height[1]} cm<br>${b.desc}</p>${this.bars(e.h)}
    <label>Name<input data-i="hname" value="${esc(e.name)}" maxlength="16" id="in-hname"></label>
    <label>Geschlecht</label>${this.seg('sex', ['Stute', 'Hengst', 'Wallach'], ['Stute', 'Hengst', 'Wallach'].indexOf(e.sex))}
    <label>Fellfarbe<select data-i="color" id="in-color">${Object.keys(COLOR_PRESETS).map((c) => `<option ${c === e.color ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label>Zeichnung</label><div class="seg wrap">${[['grey', 'Schimmel'], ['roan', 'Roan'], ['tobiano', 'Schecke'], ['leopard', 'Tigerschecke']].map(([k, n]) => `<button data-a="flag" data-v="${k}" class="${e[k] ? 'on' : ''}">${n}</button>`).join('')}</div>
    <label>Abzeichen Kopf</label>${this.seg('face', FACE_NAMES.map((n) => n.replace('Kein Abzeichen', 'Keins')), e.face)}
    <label>Abzeichen Beine</label>${this.seg('legs', LEG_NAMES, e.legs)}
    <label>Mähne<input type="range" min="0.2" max="1.6" step="0.05" value="${e.mane}" data-i="mane" id="in-mane"></label>
    <label>Größe<input type="range" min="0" max="1" step="0.05" value="${e.hk}" data-i="hk" id="in-hk"></label>
    <label>Kaliber<input type="range" min="0.92" max="1.08" step="0.01" value="${e.bulk}" data-i="bulk" id="in-bulk"></label>
    <label>Reitweise</label>${this.seg('hstyle', ['Western', 'Englisch'], e.style)}
    <div class="row end">${e.o.free ? '' : `<span class="price ${can ? '' : 'bad'}">${fmtMoney(pr)}</span><button data-a="cancel">Abbrechen</button>`}<button class="pri" data-a="horseDone" ${can ? '' : 'disabled'}>${e.o.free ? 'Spiel starten' : 'Kaufen'}</button></div></div>`, 'clear left');
  }

  // ---------- Stall ----------
  stable(tab) {
    const G = this.G, S = G.state; if (tab) this.tab = tab;
    if (!this.sel || !S.horses.find((h) => h.id === this.sel)) this.sel = S.activeId || (S.horses[0] && S.horses[0].id);
    const h = S.horses.find((x) => x.id === this.sel);
    const list = S.horses.map((x) => `<button class="hcard ${x.id === this.sel ? 'on' : ''}" data-a="selHorse" data-v="${x.id}"><b>${esc(x.name)}${x.id === S.activeId ? ' <i class="tag">gesattelt</i>' : ''}${x.pregnant ? ' <i class="tag g">tragend</i>' : ''}</b><span>${this.meta(x)}</span></button>`).join('');
    let body = '';
    if (this.tab === 'horses' && h) {
      const need = (n, v) => `<div class="st"><span>${n}</span><div class="bar ${v < 30 ? 'low' : ''}"><i style="width:${v}%"></i></div><em>${Math.round(v)}</em></div>`;
      const ride = h.age >= RIDE_AGE;
      body = `<h2>${esc(h.name)}</h2><p class="desc">${this.meta(h)}${h.parents ? `<br>Abstammung: ${esc(h.parents[1])} × ${esc(h.parents[0])}` : ''}<br>Starts ${h.starts} · Siege ${h.wins} · Wert ${fmtMoney(horseValue(h))}${h.pregnant ? `<br><b class="g">Tragend – Fohlen in ${h.pregnant.days} Tag(en)</b>` : ''}</p>
      ${this.bars(h)}<p class="hint">Balken = aktuelle Leistung, Strich = genetisches Potenzial</p>
      <div class="stats">${need('Futter', h.food)}${need('Pflege', h.clean)}${need('Vertrauen', h.bond)}</div>
      <div class="row wrap"><button class="pri" data-a="saddle" ${ride ? '' : 'disabled'}>${ride ? (h.id === S.activeId ? 'Zum Pferd' : 'Satteln &amp; reiten') : 'Zu jung zum Reiten'}</button>
      <button data-a="feed" ${S.money < 20 || h.food > 95 ? 'disabled' : ''}>Füttern ($20)</button><button data-a="groom" ${h.clean > 95 ? 'disabled' : ''}>Striegeln</button>
      <button data-a="tack">${h.style === 'western' ? 'Westernsattel → Englisch' : 'Englischsattel → Western'}</button><button data-a="rename">Umbenennen</button><button class="bad" data-a="sell" ${S.horses.length < 2 ? 'disabled' : ''}>Verkaufen (${fmtMoney(horseValue(h) * 0.8)})</button></div>
      <h3>Training <small>Energie heute: ${'●'.repeat(h.energy)}${'○'.repeat(3 - h.energy)}</small></h3><div class="row wrap">${STATS.map((k) => `<button data-a="train" data-v="${k}" ${h.energy < 1 || h.age < 2.5 || h.train[k] >= 1 ? 'disabled' : ''}>${STAT_NAMES[k]} ${Math.round(h.train[k] * 100)}%</button>`).join('')}</div>`;
    } else if (this.tab === 'breed') {
      const mares = S.horses.filter((x) => x.sex === 'Stute' && x.age >= 3 && x.age <= 20 && !x.pregnant), own = S.horses.filter((x) => x.sex === 'Hengst' && x.age >= 3);
      const studs = G.studs; const B = this.br = this.br || {};
      if (!mares.find((m) => m.id === B.mare)) B.mare = mares[0] && mares[0].id;
      const all = own.map((x) => ({ h: x, fee: 0 })).concat(studs.map((x) => ({ h: x, fee: x.fee })));
      if (!all.find((s) => s.h.id === B.sire)) B.sire = all[0] && all[0].h.id;
      const mare = mares.find((m) => m.id === B.mare), sire = all.find((s) => s.h.id === B.sire);
      body = `<h2>Zucht</h2>${!mares.length ? '<p class="desc">Du brauchst eine Stute (3–20 Jahre), die nicht tragend ist.</p>' : `
      <div class="cols2"><div><h3>Stute</h3>${mares.map((m) => `<button class="hcard ${m.id === B.mare ? 'on' : ''}" data-a="bMare" data-v="${m.id}"><b>${esc(m.name)}</b><span>${this.meta(m)}</span></button>`).join('')}</div>
      <div><h3>Hengst</h3>${all.map((s) => `<button class="hcard ${s.h.id === B.sire ? 'on' : ''}" data-a="bSire" data-v="${s.h.id}"><b>${esc(s.h.name)} <i class="tag">${s.fee ? 'Decktaxe ' + fmtMoney(s.fee) : 'eigener Hengst'}</i></b><span>${this.meta(s.h)}</span></button>`).join('')}</div></div>
      ${mare && sire ? `<h3>Erwartetes Fohlen</h3><div class="cols2"><div>${this.bars({ ...mare, pot: Object.fromEntries(STATS.map((k) => [k, (mare.pot[k] + sire.h.pot[k]) / 2])), train: Object.fromEntries(STATS.map((k) => [k, 1])), age: 8, food: 100, clean: 100, bond: 0 })}</div><div><p class="desc">Mögliche Farben:<br>${foalColorOdds(mare, sire.h).map(([n, p]) => `${n} <b>${p}%</b>`).join('<br>')}</p></div></div>
      <p class="hint">Tragzeit: 3 Tage. Fohlen wachsen in der Koppel auf und sind mit 3 Jahren (6 Tagen) reitbar.</p>
      <div class="row end"><button class="pri" data-a="breedGo" ${S.money < sire.fee ? 'disabled' : ''}>Decken lassen${sire.fee ? ' (' + fmtMoney(sire.fee) + ')' : ''}</button></div>` : ''}`}`;
    } else if (this.tab === 'rest') {
      body = `<h2>Ausruhen</h2><p class="desc">Tag ${S.day} · ${G.clockText()} Uhr<br>Über Nacht vergeht die Zeit: Fohlen wachsen, Stuten kommen der Geburt näher, der Pferdemarkt wechselt sein Angebot und deine Pferde bekommen neue Trainingsenergie.</p>
      <div class="row"><button class="pri" data-a="sleep">Bis zum nächsten Morgen schlafen</button><button data-a="sleep3">3 Tage vergehen lassen</button></div>`;
    }
    this.show('stable', `<div class="panel"><div class="tabs"><button data-a="tab" data-v="horses" class="${this.tab === 'horses' ? 'on' : ''}">Pferde (${S.horses.length})</button><button data-a="tab" data-v="breed" class="${this.tab === 'breed' ? 'on' : ''}">Zucht</button><button data-a="tab" data-v="rest" class="${this.tab === 'rest' ? 'on' : ''}">Ausruhen</button><span class="sp"></span><b class="cash">${fmtMoney(S.money)}</b><button data-a="close" aria-label="Schließen">✕</button></div>
    <div class="split"><div class="list">${list}</div><div class="detail">${body}</div></div></div>`);
  }

  // ---------- Markt ----------
  market() {
    const G = this.G, S = G.state;
    const cards = G.marketData.map((h) => `<div class="mcard ${S.sold.includes(h.id) ? 'sold' : ''}"><b>${esc(h.name)}</b><span>${this.meta(h)}</span>${this.bars(h)}<div class="row end"><span class="price">${fmtMoney(h.price)}</span><button class="pri" data-a="buy" data-v="${h.id}" ${S.sold.includes(h.id) || S.money < h.price ? 'disabled' : ''}>${S.sold.includes(h.id) ? 'Verkauft' : 'Kaufen'}</button></div></div>`).join('');
    this.show('market', `<div class="panel"><div class="tabs"><b class="ttl">Pferdemarkt Silbertal</b><span class="sp"></span><b class="cash">${fmtMoney(S.money)}</b><button data-a="close" aria-label="Schließen">✕</button></div>
    <div class="grid">${cards}</div><div class="row end"><span class="hint">Neues Angebot jeden Morgen.</span><button data-a="custom">Wunschpferd gestalten …</button></div></div>`);
  }

  // ---------- Turniere ----------
  tournament() {
    const G = this.G, S = G.state, a = G.active;
    if (!this.td) this.td = { disc: 'barrel', level: 0 };
    const d = DISCIPLINES.find((x) => x.id === this.td.disc), max = S.progress[d.id] || 0; if (this.td.level > max) this.td.level = max;
    const lv = this.td.level, fee = Math.round(PRIZE[lv] * 0.1);
    const why = !a ? 'Kein gesatteltes Pferd – wähle im Stall „Satteln & reiten“.' : a.d.age < RIDE_AGE ? 'Dein Pferd ist zu jung.' : a.d.pregnant ? 'Tragende Stuten starten nicht.' : S.money < fee ? 'Nicht genug Geld für das Nenngeld.' : '';
    const li = (st) => DISCIPLINES.filter((x) => x.style === st).map((x) => `<button class="hcard ${x.id === d.id ? 'on' : ''}" data-a="tDisc" data-v="${x.id}"><b>${x.name}</b><span>Klasse ${LEVELS[S.progress[x.id] || 0]} freigeschaltet · Bestes: ${S.best[x.id] || '–'}</span></button>`).join('');
    this.show('tour', `<div class="panel"><div class="tabs"><b class="ttl">Meldestelle – Turniere</b><span class="sp"></span><b class="cash">${fmtMoney(S.money)}</b><button data-a="close" aria-label="Schließen">✕</button></div>
    <div class="split"><div class="list"><h3>Western</h3>${li('western')}<h3>Englisch</h3>${li('english')}</div>
    <div class="detail"><h2>${d.name} <small>${d.style === 'western' ? 'Westernreiten' : 'Englische Reitweise'}</small></h2><p class="desc">${d.desc}<br>Wichtig: <b>${d.stats.map((k) => STAT_NAMES[k]).join(' &amp; ')}</b></p>
    <label>Klasse</label><div class="seg">${LEVELS.map((l, i) => `<button data-a="tLevel" data-v="${i}" class="${i === lv ? 'on' : ''}" ${i > max ? 'disabled' : ''}>${i > max ? '🔒 ' : ''}${l}</button>`).join('')}</div>
    <p class="desc">Preisgeld 1. Platz <b class="g">${fmtMoney(PRIZE[lv])}</b> · Nenngeld ${fmtMoney(fee)}<br>Platz 1–3 schaltet die nächste Klasse frei.</p>
    ${a ? `<h3>Dein Starter: ${esc(a.d.name)}</h3>${this.bars(a.d)}` : ''}${why ? `<p class="warn">${why}</p>` : ''}
    <div class="row end"><button class="pri" data-a="tStart" ${why ? 'disabled' : ''}>Nennen &amp; starten</button></div></div></div></div>`);
  }
  results(r) {
    const rows = r.rows.map((x, i) => `<tr class="${x.you ? 'you' : ''}"><td>${i + 1}.</td><td>${esc(x.name)}</td><td>${esc(x.horse)}</td><td>${x.text}</td></tr>`).join('');
    const head = r.dnf ? 'Ausgeschieden' : r.place === 1 ? 'Sieg!' : r.place <= 3 ? `Platz ${r.place} – auf dem Treppchen` : `Platz ${r.place}`;
    this.show('results', `<div class="panel narrow res"><small>${r.disc.name} · Klasse ${LEVELS[r.level]}</small><h1 class="${r.place <= 3 && !r.dnf ? 'win' : ''}">${head}</h1>${r.extra ? `<p class="desc">${r.extra}</p>` : ''}
    <table class="rank">${rows}</table><p class="desc">${r.prize ? `Preisgeld <b class="g">+${fmtMoney(r.prize)}</b>` : 'Kein Preisgeld'}${r.unlocked ? ` · <b>Klasse ${LEVELS[r.unlocked]} freigeschaltet!</b>` : ''}<br>${r.gain}</p>
    <div class="row end"><button data-a="tAgain">Weiteres Turnier</button><button class="pri" data-a="close">Weiter</button></div></div>`);
  }

  // ---------- Handy ----------
  phone() {
    const G = this.G, S = G.state;
    this.show('phone', `<div class="phone"><div class="ph-top"><span>${G.clockText()}</span><span>Tag ${S.day}</span><span>${fmtMoney(S.money)}</span></div>
    <canvas id="bigmap" width="560" height="560"></canvas>
    <h3>Schnellreise</h3><div class="row wrap">${Object.keys(LOC).filter((k) => k !== 'lake').map((k) => `<button data-a="travel" data-v="${k}">${LOC[k].name}</button>`).join('')}</div>
    <h3>Mehr</h3><div class="row wrap"><button data-a="editChar">Charakter</button><button data-a="help2">Steuerung</button><button data-a="mute">Ton ${G.audio.on ? 'an' : 'aus'}</button><button data-a="qual">Grafik: ${['Niedrig', 'Hoch'][S.quality]}</button><button data-a="save">Speichern</button><button data-a="toTitle">Hauptmenü</button></div>
    <div class="row end"><button class="pri" data-a="close">Schließen</button></div></div>`);
    this.drawMap($('#bigmap').getContext('2d'), 560, 0, 0, 560 / 1500, 0, true);
  }

  // ---------- Aktionen ----------
  act(a, v, el) {
    const G = this.G, S = G.state;
    const selH = () => S.horses.find((x) => x.id === this.sel);
    switch (a) {
      case 'continue': G.continueGame(); break;
      case 'new': G.startNew(); break;
      case 'help': this.help(() => this.title()); break;
      case 'help2': this.help(() => this.phone()); break;
      case 'back': this.back && this.back(); break;
      case 'close': this.close(); break;
      case 'cancel': this.close(); if (this.cancelTo) { const f = this.cancelTo; this.cancelTo = null; f(); } break;
      case 'sw': { const [k, c] = v.split('|'); this.ce.look[k] = c; G.preview.human(this.ce.look, this.ce.style ? 'english' : 'western'); this.renderChar(); break; }
      case 'seg': {
        const [k, i] = v.split('|'), n = +i;
        if (k === 'hairStyle') { this.ce.look.hairStyle = n; G.preview.human(this.ce.look, this.ce.style ? 'english' : 'western'); this.renderChar(); }
        else if (k === 'pstyle') { this.ce.style = n; G.preview.human(this.ce.look, n ? 'english' : 'western'); this.renderChar(); }
        else { const e = this.he; if (k === 'sex') { e.sex = ['Stute', 'Hengst', 'Wallach'][n]; } else if (k === 'hstyle') e.style = n; else e[k] = n; this.makeEd(); this.renderHorseEd(); }
        break;
      }
      case 'flag': this.he[v] = !this.he[v]; this.makeEd(); this.renderHorseEd(); break;
      case 'charDone': { const c = this.ce; c.name = (c.name || '').trim() || 'Alex'; this.close(); c.done(c.look, c.name); break; }
      case 'horseDone': { const e = this.he, h = e.h; h.name = (e.name || '').trim() || randomName(h.sex); const p = this.price(); this.close(); e.o.done(h, p); break; }
      case 'tab': this.stable(v); break;
      case 'selHorse': this.sel = v; this.stable(); break;
      case 'saddle': this.close(); G.saddle(this.sel); break;
      case 'feed': { const h = selH(); S.money -= 20; h.food = 100; h.bond = Math.min(100, h.bond + 1); G.changed(h); this.stable(); break; }
      case 'groom': { const h = selH(); h.clean = 100; h.bond = Math.min(100, h.bond + 3); G.changed(h); this.stable(); break; }
      case 'tack': { const h = selH(); h.style = h.style === 'western' ? 'english' : 'western'; G.changed(h, true); this.stable(); break; }
      case 'rename': { const h = selH(); this.show('rename', `<div class="panel narrow"><h2>Neuer Name</h2><label><input data-i="rn" id="in-rn" value="${esc(h.name)}" maxlength="16"></label><div class="row end"><button data-a="tab" data-v="horses">Abbrechen</button><button class="pri" data-a="renameOk">Speichern</button></div></div>`); this.rn = h.name; break; }
      case 'renameOk': { const h = selH(); h.name = (this.rn || '').trim() || h.name; G.changed(h); this.stable(); break; }
      case 'sell': { const h = selH(); if (el.dataset.sure) { G.sell(h); this.sel = null; this.stable(); } else { el.dataset.sure = 1; el.textContent = 'Wirklich verkaufen?'; } break; }
      case 'train': { const h = selH(); h.energy--; h.train[v] = Math.min(1, h.train[v] + 0.07); h.bond = Math.min(100, h.bond + 1); G.changed(h); G.audio.good(); this.stable(); break; }
      case 'bMare': this.br.mare = v; this.stable(); break;
      case 'bSire': this.br.sire = v; this.stable(); break;
      case 'breedGo': G.breed(this.br.mare, this.br.sire); this.tab = 'horses'; this.sel = this.br.mare; this.stable(); break;
      case 'sleep': this.close(); G.sleep(1); break;
      case 'sleep3': this.close(); G.sleep(3); break;
      case 'buy': G.buy(v); this.market(); break;
      case 'custom': this.cancelTo = () => this.market(); this.horseEditor({ free: false, done: (h, p) => { G.buyCustom(h, p); this.cancelTo = null; } }); break;
      case 'tDisc': this.td.disc = v; this.td.level = S.progress[v] || 0; this.tournament(); break;
      case 'tLevel': this.td.level = +v; this.tournament(); break;
      case 'tStart': this.close(); G.startEvent(this.td.disc, this.td.level); break;
      case 'tAgain': this.tournament(); break;
      case 'travel': this.close(); G.travel(v); break;
      case 'editChar': this.cancelTo = null; this.charEditor(S.player.look, S.player.name, (look, name) => { S.player.look = look; S.player.name = name; G.player.setLook(look); G.save(); }); break;
      case 'mute': G.audio.setMute(G.audio.on); this.phone(); break;
      case 'qual': S.quality = S.quality ? 0 : 1; G.applyQuality(); this.phone(); break;
      case 'save': G.save(); this.toast('Spielstand gespeichert'); break;
      case 'toTitle': G.save(); this.close(); G.toTitle(); break;
    }
  }
  inp(k, v, el) {
    const G = this.G;
    if (k === 'cname') this.ce.name = v;
    else if (k === 'build' || k === 'size') { this.ce.look[k] = +v; G.preview.human(this.ce.look, this.ce.style ? 'english' : 'western'); }
    else if (k === 'rn') this.rn = v;
    else if (k === 'hname') this.he.name = v;
    else if (k === 'breed') { const e = this.he; e.breed = v; e.mane = BREED[v].conf.mane; e.style = BREED[v].type === 'W' ? 0 : 1; e.h = null; this.makeEd(); this.renderHorseEd(); }
    else if (k === 'color') { this.he.color = v; this.makeEd(); }
    else if (k === 'mane' || k === 'hk' || k === 'bulk') { this.he[k] = +v; this.makeEd(); }
  }

  // ---------- HUD ----------
  hud(dt) {
    const G = this.G, S = G.state, e = this.el, p = G.player;
    e.money.textContent = fmtMoney(S.money); e.clock.textContent = `Tag ${S.day} · ${G.clockText()}`;
    const h = p.horse;
    e.hinfo.hidden = !h;
    if (h) {
      e.hname.textContent = h.d.name; e.hgait.textContent = h.slide ? 'Sliding Stop' : h.speed < -0.1 ? 'Rückwärts' : GAIT_NAMES[h.aGait] + (h.tired ? ' · erschöpft' : ''); e.hspeed.textContent = Math.round(Math.abs(h.speed) * 3.6) + ' km/h';
      e.stam.style.width = h.stamina + '%'; e.stam.parentNode.classList.toggle('low', h.stamina < 25);
      const g = p.gait; if (this.lastG !== g) { this.lastG = g; [...e.gaits.children].forEach((c, i) => c.classList.toggle('on', i === g)); }
    }
    const ev = G.event;
    e.ev.hidden = !ev;
    if (ev) {
      const d = ev['hud_' + ev.disc.id](); e.evMain.textContent = d.main; e.evSub.textContent = d.sub; e.task.textContent = ev.task || '';
      e.msg.textContent = ev.msgT > 0 ? ev.msg : ''; e.count.textContent = ev.state === 'count' ? (ev.count > 3 ? ev.disc.name : Math.ceil(ev.count)) : '';
    }
    if (this.promptText !== G.prompt) { this.promptText = G.prompt; e.prompt.hidden = !G.prompt; e.prompt.innerHTML = G.prompt ? `<kbd>E</kbd> ${esc(G.prompt)}` : ''; }
    this.drawMap(this.mm, 176, p.pos.x, p.pos.z, 0.55, G.cam.yaw, false);
  }
  drawMap(c, size, px, pz, sc, yaw, full) {
    const G = this.G, W = G.world, h = size / 2;
    c.save(); c.clearRect(0, 0, size, size);
    c.fillStyle = full ? '#3d5a38' : 'rgba(46,66,44,0.92)'; c.fillRect(0, 0, size, size);
    c.translate(h, h); if (!full) c.rotate(Math.PI + yaw); c.scale(sc, sc); c.translate(-px, -pz);
    c.fillStyle = '#2f6a80'; c.beginPath(); c.arc(LOC.lake.x, LOC.lake.z, 92, 0, TAU); c.fill();
    c.strokeStyle = '#b89c6c'; c.lineWidth = TRACK.w; c.beginPath(); for (let s = 0; s <= TRACK.len; s += 12) { const t = W.trackPoint(s); s ? c.lineTo(t[0], t[1]) : c.moveTo(t[0], t[1]); } c.closePath(); c.stroke();
    c.strokeStyle = '#d9d9d6'; c.lineWidth = full ? 9 : 7; c.lineJoin = 'round';
    for (const rd of W.roads) { c.beginPath(); rd.pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke(); }
    c.strokeStyle = '#7a5c3a'; c.lineWidth = 1.5; for (const P of [PADDOCK, MARKET]) c.strokeRect(P.x0, P.z0, P.x1 - P.x0, P.z1 - P.z0);
    for (const r of W.mapRects) { c.save(); c.translate(r.x, r.z); c.rotate(-r.ry); c.fillStyle = r.c; c.fillRect(-r.w / 2, -r.d / 2, r.w, r.d); c.restore(); }
    const blip = (x, z, col, r, txt) => {
      let dx = x - px, dz = z - pz; const d = Math.hypot(dx, dz), lim = (h - 10) / sc;
      if (!full && d > lim) { dx *= lim / d; dz *= lim / d; }
      c.save(); c.translate(px + dx, pz + dz); c.scale(1 / sc, 1 / sc); c.fillStyle = col; c.strokeStyle = '#111'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
      if (txt) { if (!full) c.rotate(-(Math.PI + yaw)); c.fillStyle = '#111'; c.font = 'bold 10px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 0, 1); }
      c.restore();
    };
    for (const hz of G.horses) if (hz !== G.active) blip(hz.pos.x, hz.pos.z, '#a9743f', 3);
    for (const p of POIS) blip(p.x, p.z, p.color, 8, p.icon);
    if (G.active && G.player.horse !== G.active) blip(G.active.pos.x, G.active.pos.z, '#ffffff', 5, '♞');
    if (G.event && G.event.beacon.visible) blip(G.event.tx, G.event.tz, '#ffd23a', 6);
    if (full) blip(G.player.pos.x, G.player.pos.z, '#ff4a3a', 6);
    c.restore();
    if (!full) { c.fillStyle = '#fff'; c.strokeStyle = '#111'; c.lineWidth = 1.5; c.save(); c.translate(h, h); c.rotate(-(G.player.heading - yaw)); c.beginPath(); c.moveTo(0, -8); c.lineTo(6, 7); c.lineTo(0, 3.5); c.lineTo(-6, 7); c.closePath(); c.fill(); c.stroke(); c.restore(); }
  }
}
