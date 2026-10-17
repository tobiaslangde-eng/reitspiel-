// Static collision world: circles and oriented boxes in a spatial hash.
const CELL = 16;

export class Colliders {
  constructor() {
    this.grid = new Map();
    this.all = [];
  }
  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  _insert(c, minX, minZ, maxX, maxZ) {
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
        const k = this.key(cx, cz);
        let arr = this.grid.get(k);
        if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(c);
      }
    }
    this.all.push(c);
    return c;
  }

  // top: absolute world height of the obstacle top (used for jumping over)
  addCircle(x, z, r, top = 1e9, tag = null) {
    const c = { type: 'c', x, z, r, top, tag, enabled: true };
    return this._insert(c, x - r, z - r, x + r, z + r);
  }

  addBox(x, z, hw, hd, rot = 0, top = 1e9, tag = null) {
    const c = { type: 'b', x, z, hw, hd, rot, cos: Math.cos(rot), sin: Math.sin(rot), top, tag, enabled: true };
    const R = Math.hypot(hw, hd);
    return this._insert(c, x - R, z - R, x + R, z + R);
  }

  // A thin box between two points (fences, logs)
  addSegment(ax, az, bx, bz, thick, top, tag = null) {
    const x = (ax + bx) / 2, z = (az + bz) / 2;
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bz - az, bx - ax);
    return this.addBox(x, z, len / 2, thick / 2, -rot, top, tag);
  }

  remove(c) {
    c.enabled = false;
  }

  query(x, z) {
    return this.grid.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL))) || [];
  }

  // Pushes p (object with x,z) out of colliders. footY = current bottom height.
  // Returns the first collider that was hit (or null).
  resolve(p, r, footY = 0) {
    let hit = null;
    const list = this.query(p.x, p.z);
    for (const c of list) {
      if (!c.enabled || footY > c.top) continue;
      if (c.type === 'c') {
        const dx = p.x - c.x, dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        const m = c.r + r;
        if (d < m && d > 1e-5) {
          p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m;
          hit = hit || c;
        }
      } else {
        // to box local
        const dx = p.x - c.x, dz = p.z - c.z;
        const lx = dx * c.cos - dz * c.sin;
        const lz = dx * c.sin + dz * c.cos;
        const qx = Math.max(-c.hw, Math.min(c.hw, lx));
        const qz = Math.max(-c.hd, Math.min(c.hd, lz));
        let ox = lx - qx, oz = lz - qz;
        let d = Math.hypot(ox, oz);
        if (d < r) {
          let nx, nz, push;
          if (d > 1e-5) { nx = ox / d; nz = oz / d; push = r - d; }
          else {
            // inside: push along the smallest penetration axis
            const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
            if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; push = px + r; }
            else { nx = 0; nz = Math.sign(lz) || 1; push = pz + r; }
          }
          const nlx = lx + nx * push, nlz = lz + nz * push;
          p.x = c.x + nlx * c.cos + nlz * c.sin;
          p.z = c.z - nlx * c.sin + nlz * c.cos;
          hit = hit || c;
        }
      }
    }
    return hit;
  }
}
