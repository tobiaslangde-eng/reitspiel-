import { STARTER_HORSES, newGameState, loadGame, hasSave } from '../game/state.js';
import { BREEDS, COATS, PERSONALITIES } from '../horse/breeds.js';
import { esc } from './ui.js';
import { isTouchDevice } from './touch.js';

const $ = (id) => document.getElementById(id);

export class MainMenu {
  constructor(game) {
    this.game = game;
    this.starter = 0;
    if (hasSave()) $('btn-continue').classList.remove('hidden');
    const q = $('opt-quality');
    const saved = loadGame();
    if (saved) q.value = saved.settings.quality || 'auto';
    // PWA install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installEvent = e;
      $('btn-install').classList.remove('hidden');
    });
    $('btn-install').onclick = async () => {
      if (!this.installEvent) return;
      this.installEvent.prompt();
      await this.installEvent.userChoice;
      this.installEvent = null;
      $('btn-install').classList.add('hidden');
    };
    const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone;
    if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone) $('ios-hint').classList.remove('hidden');

    $('btn-continue').onclick = () => {
      const s = loadGame();
      if (!s) return;
      s.settings.quality = q.value;
      this.go(s);
    };
    $('btn-new').onclick = () => {
      $('menu-main').classList.add('hidden');
      $('menu-new').classList.remove('hidden');
      this.renderCards();
    };
    $('btn-back').onclick = () => {
      $('menu-new').classList.add('hidden');
      $('menu-main').classList.remove('hidden');
    };
    $('btn-start').onclick = () => {
      const name = $('new-name').value.trim() || 'Tessa';
      const hname = $('new-horse-name').value.trim() || STARTER_HORSES[this.starter].name;
      const s = newGameState(name, this.starter, hname);
      s.settings.quality = q.value;
      this.go(s);
    };
  }

  renderCards() {
    const box = $('starter-cards');
    box.innerHTML = '';
    STARTER_HORSES.forEach((st, i) => {
      const b = BREEDS[st.breed];
      const c = document.createElement('div');
      c.className = 'card' + (i === this.starter ? ' sel' : '');
      const col = COATS[st.coat].base.map((v) => Math.round(v * 255)).join(',');
      c.innerHTML = `<h3>${esc(st.name)}</h3>
        <div><span class="swatch" style="background:rgb(${col})"></span>${esc(b.name)} · ${COATS[st.coat].name}</div>
        <div class="desc">${esc(b.desc)}</div>
        <div class="muted">${st.gender} · ${PERSONALITIES[st.personality].icon} ${PERSONALITIES[st.personality].name}</div>
        <div class="muted">Tempo ${b.stats.speed} · Ausdauer ${b.stats.stamina} · Wendigkeit ${b.stats.agility}</div>`;
      c.onclick = () => { this.starter = i; $('new-horse-name').value = st.name; this.renderCards(); };
      box.appendChild(c);
    });
    if (!$('new-horse-name').value) $('new-horse-name').value = STARTER_HORSES[this.starter].name;
  }

  async go(state) {
    this.game.audio.init();
    // phones: go fullscreen in landscape (ignored where unsupported, e.g. iOS Safari)
    if (isTouchDevice()) {
      try {
        const el = document.documentElement;
        if (el.requestFullscreen && !document.fullscreenElement) await el.requestFullscreen({ navigationUI: 'hide' });
        if (screen.orientation?.lock) await screen.orientation.lock('landscape');
      } catch { /* not supported */ }
    }
    $('menu-main').classList.add('hidden');
    $('menu-new').classList.add('hidden');
    $('loading').classList.remove('hidden');
    try {
      await this.game.start(state);
    } catch (e) {
      console.error(e);
      $('loading-text').textContent = 'Fehler beim Laden: ' + e.message;
    }
  }

  async setLoading(text) {
    $('loading-text').textContent = text;
    await new Promise((r) => setTimeout(r, 30));
  }

  hide() { $('menu').classList.add('hidden'); }
}
