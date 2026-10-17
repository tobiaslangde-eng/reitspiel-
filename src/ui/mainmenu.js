import { STARTER_HORSES, newGameState, loadGame, hasSave, starterHorse } from '../game/state.js';
import { loadHorseAssets } from '../horse/horseModel.js';
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
    this.initShowcase(saved);

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
      const s = newGameState(name, this.starter, hname, this.previewHorse);
      s.settings.quality = q.value;
      this.go(s);
    };
  }

  // 3D backdrop with the selected (or saved active) horse; failures just leave the gradient
  async initShowcase(saved) {
    try {
      await loadHorseAssets(isTouchDevice() ? ['-mid', '-lo'] : ['', '-lo']);
      if (this.started) return;
      const { Showcase } = await import('./showcase.js');
      if (this.started) return;
      this.showcase = new Showcase($('menu-canvas'));
      const active = saved && saved.horses.find((h) => h.id === saved.activeHorse);
      if (active) this.showcase.setHorse(active);
      else this.preview(this.starter);
      $('menu').classList.add('has-3d');
    } catch (e) {
      console.warn('showcase disabled', e);
    }
  }

  preview(i) {
    this.previewHorse = starterHorse(i);
    if (this.showcase) this.showcase.setHorse(this.previewHorse);
  }

  renderCards() {
    const box = $('starter-cards');
    box.innerHTML = '';
    STARTER_HORSES.forEach((st, i) => {
      const b = BREEDS[st.breed];
      const c = document.createElement('div');
      c.className = 'card starter' + (i === this.starter ? ' sel' : '');
      const col = COATS[st.coat].base.map((v) => Math.round(v * 255)).join(',');
      const grade = Math.max(1, Math.min(5, Math.round((b.stats.speed + b.stats.stamina + b.stats.agility) / 6)));
      const p = PERSONALITIES[st.personality];
      c.innerHTML = `<div class="star-badge" style="width:48px;height:48px"><span style="font-size:20px">${grade}</span></div>
        <h3>${esc(st.name)}</h3>
        <div class="muted"><span class="swatch" style="background:rgb(${col})"></span>${esc(b.name)} · ${COATS[st.coat].name}</div>
        <div class="muted">${st.gender} · ${p.icon} ${p.name}</div>
        <div class="statgrid"><div><b>${b.stats.speed * 10}</b>TEMPO</div><div><b>${b.stats.stamina * 10}</b>AUSDAUER</div><div><b>${b.stats.agility * 10}</b>WENDIGK.</div></div>`;
      c.onclick = () => {
        if (this.starter !== i) this.preview(i);
        this.starter = i;
        $('new-horse-name').value = st.name;
        this.renderCards();
      };
      box.appendChild(c);
    });
    if (!$('new-horse-name').value) $('new-horse-name').value = STARTER_HORSES[this.starter].name;
    if (!this.previewHorse) this.preview(this.starter);
  }

  setProgress(f) {
    const el = $('load-fill');
    if (el) el.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%';
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
    this.started = true;
    if (this.showcase) { this.showcase.dispose(); this.showcase = null; }
    $('menu').classList.remove('has-3d');
    try {
      await this.game.start(state);
    } catch (e) {
      console.error(e);
      $('loading-text').textContent = 'Fehler beim Laden: ' + e.message;
    }
  }

  async setLoading(text) {
    $('loading-text').textContent = text;
    // seven loading steps in Game.start; horse assets report finer progress via setProgress
    this.step = (this.step || 0) + 1;
    this.setProgress(Math.min(0.95, this.step / 7));
    await new Promise((r) => setTimeout(r, 30));
  }

  hide() { $('menu').classList.add('hidden'); }
}
