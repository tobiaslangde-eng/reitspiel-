export class Events {
  constructor() { this.map = new Map(); }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.map.get(type).delete(fn);
  }
  emit(type, data) {
    const s = this.map.get(type);
    if (s) for (const fn of [...s]) fn(data);
    const all = this.map.get('*');
    if (all) for (const fn of [...all]) fn(type, data);
  }
}
