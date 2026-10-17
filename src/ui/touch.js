// Touch controls for phones and tablets: floating joystick (left), camera drag & pinch (right),
// and context-sensitive action buttons. Buttons feed virtual key presses into Input.
export function isTouchDevice() {
  return (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || navigator.maxTouchPoints > 1;
}

const BUTTONS = {
  ride: [
    { id: 'jump', label: '⤴', title: 'Springen', key: 'Space', size: 'xl' },
    { id: 'sprint', label: '💨', title: 'Sprint', key: 'ShiftLeft', hold: true, size: 'l' },
    { id: 'slide', label: '🛑', title: 'Stopp', key: 'KeyX' },
    { id: 'spin', label: '🌀', title: 'Spin', key: 'KeyC', hold: true },
    { id: 'lasso', label: '🪢', title: 'Lasso', key: 'KeyF' },
    { id: 'pat', label: '🤗', title: 'Loben', key: 'KeyT' },
  ],
  foot: [
    { id: 'run', label: '🏃', title: 'Rennen', key: 'ShiftLeft', hold: true, size: 'l' },
    { id: 'whistle', label: '🎶', title: 'Pfeifen', key: 'KeyH', size: 'l' },
    { id: 'care', label: '🪮', title: 'Pflege', key: 'KeyG' },
    { id: 'crouch', label: '🧎', title: 'Ducken', key: 'KeyC', toggle: true },
    { id: 'lasso', label: '🪢', title: 'Lasso', key: 'KeyF' },
  ],
};

export class TouchControls {
  constructor(game) {
    this.game = game;
    const input = game.input;
    this.input = input;
    document.body.classList.add('touch');
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div id="joy-zone"><div id="joy-base"><div id="joy-knob"></div></div></div>
      <div id="look-zone"></div>
      <div id="touch-top">
        <button data-key="Tab" title="Menü">☰</button>
        <button data-key="KeyM" title="Karte">🗺️</button>
        <button data-key="KeyJ" title="Aufträge">📜</button>
        <button data-key="KeyP" title="Foto">📷</button>
        <button data-key="Escape" title="Pause">⏸</button>
      </div>
      <div id="touch-actions"></div>
      <button id="touch-use" class="hidden"></button>
      <div id="touch-photo" class="hidden">
        <button data-hold="KeyE">⬆</button><button data-hold="KeyQ">⬇</button>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.mode = null;
    this.joy = { active: false, x: 0, y: 0, id: null, cx: 0, cy: 0 };
    input.joy = this.joy;
    this.looks = new Map();
    this.pinch = null;

    // top bar & photo buttons
    root.querySelectorAll('[data-key]').forEach((b) => this.bindButton(b, { key: b.dataset.key }));
    root.querySelectorAll('[data-hold]').forEach((b) => this.bindButton(b, { key: b.dataset.hold, hold: true }));
    this.useBtn = root.querySelector('#touch-use');
    this.bindButton(this.useBtn, { key: 'KeyE' });

    // joystick
    const zone = root.querySelector('#joy-zone');
    const base = root.querySelector('#joy-base');
    const knob = root.querySelector('#joy-knob');
    const R = 56;
    zone.addEventListener('pointerdown', (e) => {
      if (this.joy.id !== null) return;
      try { zone.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
      this.joy.id = e.pointerId;
      this.joy.active = true;
      this.joy.cx = e.clientX; this.joy.cy = e.clientY;
      base.style.left = `${e.clientX - R - 10}px`; base.style.top = `${e.clientY - R - 10}px`;
      base.classList.add('on');
      knob.style.transform = 'translate(0px,0px)';
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joy.id) return;
      let dx = e.clientX - this.joy.cx, dy = e.clientY - this.joy.cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.joy.x = dx / R; this.joy.y = -dy / R;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
    });
    const end = (e) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.id = null; this.joy.active = false; this.joy.x = 0; this.joy.y = 0;
      base.classList.remove('on');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    // camera look + pinch zoom
    const look = root.querySelector('#look-zone');
    look.addEventListener('pointerdown', (e) => {
      try { look.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
      this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.looks.size === 2) {
        const [a, b] = [...this.looks.values()];
        this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
      e.preventDefault();
    });
    look.addEventListener('pointermove', (e) => {
      const p = this.looks.get(e.pointerId);
      if (!p) return;
      if (this.looks.size === 1) {
        input.mouseDX += (e.clientX - p.x) * 1.5;
        input.mouseDY += (e.clientY - p.y) * 1.5;
        input.lastMouseMove = performance.now();
      }
      p.x = e.clientX; p.y = e.clientY;
      if (this.looks.size === 2 && this.pinch) {
        const [a, b] = [...this.looks.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const diff = this.pinch - d;
        if (Math.abs(diff) > 18) { input.wheel += Math.sign(diff); this.pinch = d; }
      }
    });
    const lend = (e) => { this.looks.delete(e.pointerId); if (this.looks.size < 2) this.pinch = null; };
    look.addEventListener('pointerup', lend);
    look.addEventListener('pointercancel', lend);

    // no long-press menus / zooming
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  bindButton(el, { key, hold = false, toggle = false }) {
    const input = this.input;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.game.audio.init();
      if (toggle) {
        const on = !el.classList.contains('on');
        el.classList.toggle('on', on);
        if (on) input.virtualDown(key); else input.virtualUp(key);
        return;
      }
      el.classList.add('on');
      input.virtualDown(key);
      if (!hold) setTimeout(() => { input.virtualUp(key); el.classList.remove('on'); }, 90);
    });
    if (hold) {
      const up = () => { input.virtualUp(key); el.classList.remove('on'); };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    }
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    const box = this.root.querySelector('#touch-actions');
    box.innerHTML = '';
    for (const def of BUTTONS[mode] || []) {
      const b = document.createElement('button');
      b.className = 'tbtn ' + (def.size || '');
      b.innerHTML = `<span>${def.label}</span><small>${def.title}</small>`;
      this.bindButton(b, def);
      box.appendChild(b);
    }
    // releasing toggles when switching modes
    this.input.virtualUp('KeyC');
  }

  update() {
    const g = this.game;
    const hidden = g.ui.modalOpen || !g.started;
    this.root.classList.toggle('dim', hidden);
    this.root.classList.toggle('photo', !!g.photo?.active);
    this.root.querySelector('#touch-photo').classList.toggle('hidden', !g.photo?.active);
    if (g.player) this.setMode(g.player.mode === 'ride' ? 'ride' : 'foot');
    const it = g.currentInteract;
    if (it && !hidden) {
      if (this.useBtn.dataset.label !== it.label) { this.useBtn.dataset.label = it.label; this.useBtn.textContent = it.label; }
      this.useBtn.classList.remove('hidden');
    } else this.useBtn.classList.add('hidden');
  }
}
