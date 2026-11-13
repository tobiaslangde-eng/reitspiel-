// Tastatur, Maus und Touch
export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.pressed = new Set(); this.mdx = 0; this.mdy = 0; this.wheel = 0;
    this.joy = { x: 0, y: 0, id: null, ox: 0, oy: 0 }; this.look = { id: null, x: 0, y: 0 };
    this.touch = false; this.lastLook = 0; this.enabled = true;
    const down = (c) => { if (!this.keys.has(c)) this.pressed.add(c); this.keys.add(c); };
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) down(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    let drag = false;
    canvas.addEventListener('mousedown', (e) => { drag = true; if (e.button === 0 && this.wantLock && !document.pointerLockElement) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* optional */ } } });
    addEventListener('mouseup', () => { drag = false; });
    addEventListener('mousemove', (e) => { if (drag || document.pointerLockElement === canvas) { this.mdx += e.movementX; this.mdy += e.movementY; this.lastLook = performance.now(); } });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Touch: linke Hälfte Joystick, rechte Hälfte Kamera
    const ts = (e) => {
      this.touch = true; document.body.classList.add('touch');
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && this.joy.id === null) { this.joy.id = t.identifier; this.joy.ox = t.clientX; this.joy.oy = t.clientY; this.joy.x = this.joy.y = 0; this.onJoy && this.onJoy(true, t.clientX, t.clientY, 0, 0); }
        else if (this.look.id === null) { this.look.id = t.identifier; this.look.x = t.clientX; this.look.y = t.clientY; }
      }
      e.preventDefault();
    };
    const tm = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) { let dx = (t.clientX - this.joy.ox) / 55, dy = (t.clientY - this.joy.oy) / 55; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } this.joy.x = dx; this.joy.y = dy; this.onJoy && this.onJoy(true, this.joy.ox, this.joy.oy, dx, dy); }
        else if (t.identifier === this.look.id) { this.mdx += (t.clientX - this.look.x) * 1.6; this.mdy += (t.clientY - this.look.y) * 1.6; this.look.x = t.clientX; this.look.y = t.clientY; this.lastLook = performance.now(); }
      }
      e.preventDefault();
    };
    const te = (e) => { for (const t of e.changedTouches) { if (t.identifier === this.joy.id) { this.joy.id = null; this.joy.x = this.joy.y = 0; this.onJoy && this.onJoy(false); } if (t.identifier === this.look.id) this.look.id = null; } };
    canvas.addEventListener('touchstart', ts, { passive: false }); canvas.addEventListener('touchmove', tm, { passive: false });
    canvas.addEventListener('touchend', te); canvas.addEventListener('touchcancel', te);
    this.down = down;
  }
  // Bildschirmtaste an virtuelle Taste binden
  bindButton(el, code) {
    const on = (e) => { e.preventDefault(); this.touch = true; this.down(code); el.classList.add('on'); };
    const off = (e) => { e.preventDefault(); this.keys.delete(code); el.classList.remove('on'); };
    el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off); el.addEventListener('touchcancel', off);
    el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
  }
  held(...c) { return c.some((k) => this.keys.has(k)); }
  hit(...c) { return c.some((k) => this.pressed.has(k)); }
  axisX() { return (this.held('KeyA', 'ArrowLeft') ? 1 : 0) - (this.held('KeyD', 'ArrowRight') ? 1 : 0) - this.joy.x; }
  axisY() { return (this.held('KeyW', 'ArrowUp') ? 1 : 0) - (this.held('KeyS', 'ArrowDown') ? 1 : 0) - this.joy.y; }
  endFrame() { this.pressed.clear(); this.mdx = this.mdy = 0; this.wheel = 0; }
}
