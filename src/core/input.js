// Keyboard + mouse input with "pressed this frame" tracking.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.dragging = false;
    this.mouseButtons = 0;
    this.mouseX = 0;
    this.mouseY = 0;
    this.enabled = true;
    this.lastMouseMove = 0;
    this.joy = { active: false, x: 0, y: 0 };

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.code;
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());

    canvas.addEventListener('mousedown', (e) => {
      this.mouseButtons |= 1 << e.button;
      this.dragging = true;
      this.pressed.add('Mouse' + e.button);
    });
    window.addEventListener('mouseup', (e) => {
      this.mouseButtons &= ~(1 << e.button);
      if (!this.mouseButtons) this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX; this.mouseY = e.clientY;
      if (this.dragging || document.pointerLockElement === canvas) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
        this.lastMouseMove = performance.now();
      }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // used by on-screen touch buttons
  virtualDown(code) {
    if (!this.down.has(code)) this.pressed.add(code);
    this.down.add(code);
  }
  virtualUp(code) { this.down.delete(code); }

  isDown(code) { return this.enabled && this.down.has(code); }
  wasPressed(code) { return this.enabled && this.pressed.has(code); }
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
  }
}
