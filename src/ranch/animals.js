import * as THREE from 'three';
import { heightAt, waterDepthAt, PLAY_LIMIT } from '../world/terrain.js';
import { clamp, damp, dampAngle, rand, canvasTexture } from '../core/utils.js';

function legMesh(r, len, m) {
  const g = new THREE.CylinderGeometry(r, r * 0.8, len, 6);
  g.translate(0, -len / 2, 0);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  return mesh;
}

function cowTexture(kind) {
  return canvasTexture(256, 128, (g, w, h) => {
    const base = { brown: '#7a4a26', black: '#1c1816', red: '#8a3a1c', white: '#eee8dc', longhorn: '#b07040' }[kind];
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    if (kind === 'white' || kind === 'longhorn' || kind === 'black') {
      g.fillStyle = kind === 'white' ? '#1c1816' : '#f0ebe0';
      for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 28, 8 + Math.random() * 20, Math.random() * 3, 0, 7); g.fill(); }
    }
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  });
}

// ---------------------------------------------------------------------------
class Critter {
  constructor(game, kind) {
    this.game = game;
    this.kind = kind;
    this.pos = new THREE.Vector3();
    this.heading = Math.random() * 6;
    this.speed = 0;
    this.target = null;
    this.state = 'idle';
    this.t = Math.random() * 10;
    this.stateT = rand(1, 5);
    this.legs = [];
    this.root = new THREE.Group();
    game.scene.add(this.root);
    this.radius = 0.5;
    this.maxSpeed = 2;
  }
  setPos(x, z) { this.pos.set(x, heightAt(x, z), z); }
  steer(dt, tx, tz, speed, arrive = 1) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < arrive) { this.speed = damp(this.speed, 0, 6, dt); return true; }
    this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 4, dt);
    this.speed = damp(this.speed, speed, 3, dt);
    return false;
  }
  move(dt) {
    const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
    const p = { x: nx, z: nz };
    if (waterDepthAt(nx, nz) > 0.8) { this.speed = 0; return; }
    this.game.colliders.resolve(p, this.radius, this.pos.y);
    this.pos.x = clamp(p.x, -PLAY_LIMIT, PLAY_LIMIT);
    this.pos.z = clamp(p.z, -PLAY_LIMIT, PLAY_LIMIT);
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;
  }
  animLegs(dt, freq = 2, amp = 0.5) {
    this.t += dt * freq * Math.min(2.5, this.speed + 0.001);
    const k = Math.min(1, this.speed);
    this.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.t * 4 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * amp * k; });
  }
}

class Cow extends Critter {
  constructor(game, kindName) {
    super(game, 'cow');
    const tex = cowTexture(kindName);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: kindName === 'white' ? 0x2a2420 : 0x2a1a10, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.0, 4, 10), m);
    body.rotation.x = Math.PI / 2; body.position.y = 1.0; body.scale.set(1, 1, 1.05); body.castShadow = true;
    this.root.add(body);
    this.head = new THREE.Group(); this.head.position.set(0, 1.15, 0.8); this.root.add(this.head);
    const hm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.5), m); hm.position.set(0, -0.05, 0.2); hm.castShadow = true; this.head.add(hm);
    const muz = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.14), new THREE.MeshStandardMaterial({ color: 0xd8a090 })); muz.position.set(0, -0.14, 0.47); this.head.add(muz);
    const longhorn = kindName === 'longhorn';
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.04, longhorn ? 0.9 : 0.22, 6), new THREE.MeshStandardMaterial({ color: 0xe8dcc0 }));
      horn.rotation.z = s * -(Math.PI / 2 - (longhorn ? 0.25 : 0.6)); horn.position.set(s * (longhorn ? 0.55 : 0.22), 0.12, 0.1); this.head.add(horn);
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.1), m); ear.position.set(s * 0.24, 0.02, 0.05); ear.rotation.z = s * 0.3; this.head.add(ear);
    }
    for (const [x, z] of [[-0.25, 0.55], [0.25, 0.55], [-0.25, -0.55], [0.25, -0.55]]) {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.8, z); this.root.add(pivot);
      pivot.add(legMesh(0.08, 0.8, m));
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 6), dark); hoof.position.y = -0.78; pivot.add(hoof);
      this.legs.push(pivot);
    }
    const tail = legMesh(0.025, 0.7, m); tail.position.set(0, 1.25, -0.9); tail.rotation.x = 0.2; this.root.add(tail);
    this.tail = tail;
    this.radius = 0.8;
    this.maxSpeed = 4.2;
    this.home = null;
    this.tethered = null;
    this.mooT = rand(5, 30);
  }
  update(dt, threats) {
    this.stateT -= dt;
    let fleeing = false;
    if (this.tethered) {
      const t = this.tethered.pos;
      const d = Math.hypot(t.x - this.pos.x, t.z - this.pos.z);
      if (d > 4) this.steer(dt, t.x, t.z, Math.min(this.maxSpeed * 1.6, d * 1.2), 0.5);
      else this.speed = damp(this.speed, 0, 4, dt);
    } else {
      for (const th of threats) {
        const dx = this.pos.x - th.x, dz = this.pos.z - th.z;
        const d = Math.hypot(dx, dz);
        if (d < th.r) {
          fleeing = true;
          const s = (th.r - d) / th.r;
          this.steer(dt, this.pos.x + dx / d * 10, this.pos.z + dz / d * 10, this.maxSpeed * (0.5 + s * 0.6), 0);
        }
      }
      if (!fleeing) {
        if (this.state === 'walk' && this.target) { if (this.steer(dt, this.target.x, this.target.z, 1.0, 1) || this.stateT < 0) { this.state = 'graze'; this.stateT = rand(3, 10); } }
        else {
          this.speed = damp(this.speed, 0, 3, dt);
          if (this.stateT < 0 && this.home) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * this.home.r;
            this.target = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
            this.state = 'walk'; this.stateT = 15;
          }
        }
      }
    }
    this.move(dt);
    this.animLegs(dt, 1.4, 0.5);
    const graze = this.state === 'graze' && this.speed < 0.2 && !fleeing;
    this.head.rotation.x = damp(this.head.rotation.x, graze ? 0.9 : 0, 3, dt);
    this.head.position.y = graze ? 0.8 : 1.15;
    this.tail.rotation.z = Math.sin(this.t * 2 + this.pos.x) * 0.3;
    this.mooT -= dt;
    if (this.mooT < 0) { this.mooT = rand(15, 50); this.game.audio.moo(this.pos); }
  }
}

class Chicken extends Critter {
  constructor(game, color) {
    super(game, 'chicken');
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), m); body.position.y = 0.3; body.scale.set(0.9, 0.9, 1.2); body.castShadow = true; this.root.add(body);
    this.head = new THREE.Group(); this.head.position.set(0, 0.45, 0.14); this.root.add(this.head);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), m); this.head.add(h);
    const comb = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.08), new THREE.MeshStandardMaterial({ color: 0xd02020 })); comb.position.set(0, 0.08, 0); this.head.add(comb);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 4), new THREE.MeshStandardMaterial({ color: 0xe0a020 })); beak.rotation.x = Math.PI / 2; beak.position.z = 0.09; this.head.add(beak);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 5), m); tail.position.set(0, 0.4, -0.18); tail.rotation.x = -0.8; this.root.add(tail);
    for (const x of [-0.06, 0.06]) { const p = new THREE.Group(); p.position.set(x, 0.18, 0); p.add(legMesh(0.012, 0.18, new THREE.MeshStandardMaterial({ color: 0xe0a020 }))); this.root.add(p); this.legs.push(p); }
    this.radius = 0.2;
    this.cluckT = rand(3, 20);
  }
  update(dt) {
    this.stateT -= dt;
    if (this.state === 'walk' && this.target) { if (this.steer(dt, this.target.x, this.target.z, 0.8, 0.3) || this.stateT < 0) { this.state = 'peck'; this.stateT = rand(1, 4); } }
    else {
      this.speed = damp(this.speed, 0, 6, dt);
      if (this.stateT < 0 && this.home) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * this.home.r;
        this.target = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
        this.state = 'walk'; this.stateT = 8;
      }
    }
    // scatter from the player
    const p = this.game.player.position;
    const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    if (d < 1.5) { this.heading = Math.atan2(this.pos.x - p.x, this.pos.z - p.z); this.speed = 2.5; }
    this.move(dt);
    this.animLegs(dt, 3, 0.7);
    this.head.rotation.x = this.state === 'peck' ? Math.max(0, Math.sin(this.t * 3 + performance.now() * 0.012)) * 1.2 : 0;
    this.cluckT -= dt;
    if (this.cluckT < 0) { this.cluckT = rand(8, 30); this.game.audio.cluck(this.pos); }
  }
}

class Dog extends Critter {
  constructor(game, cat = false) {
    super(game, cat ? 'cat' : 'dog');
    this.isCat = cat;
    const col = cat ? 0xd08a3a : 0x6a4426;
    const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.9 });
    const s = cat ? 0.55 : 1;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16 * s, 0.45 * s, 4, 8), m);
    body.rotation.x = Math.PI / 2; body.position.y = 0.45 * s; body.castShadow = true; this.root.add(body);
    this.head = new THREE.Group(); this.head.position.set(0, 0.62 * s, 0.33 * s); this.root.add(this.head);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.14 * s, 10, 8), m); h.castShadow = true; this.head.add(h);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.09 * s, cat ? 0.06 * s : 0.16 * s), cat ? m : white); snout.position.set(0, -0.03 * s, 0.13 * s); this.head.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025 * s, 6, 4), new THREE.MeshStandardMaterial({ color: cat ? 0xe08090 : 0x111111 })); nose.position.set(0, 0, (cat ? 0.17 : 0.22) * s); this.head.add(nose);
    for (const sd of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, (cat ? 0.12 : 0.1) * s, 4), m);
      ear.position.set(sd * 0.08 * s, 0.13 * s, 0); ear.rotation.z = sd * (cat ? -0.2 : -0.6); if (!cat) ear.rotation.x = 0.6; this.head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018 * s, 6, 4), new THREE.MeshStandardMaterial({ color: cat ? 0x60c040 : 0x1a1008, roughness: 0.2 })); eye.position.set(sd * 0.06 * s, 0.03 * s, 0.11 * s); this.head.add(eye);
    }
    if (!cat) { const chest = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), white); chest.position.set(0, 0.42, 0.25); this.root.add(chest); }
    for (const [x, z] of [[-0.09, 0.22], [0.09, 0.22], [-0.09, -0.22], [0.09, -0.22]]) {
      const p = new THREE.Group(); p.position.set(x * s, 0.38 * s, z * s); this.root.add(p);
      p.add(legMesh(0.04 * s, 0.38 * s, m));
      this.legs.push(p);
    }
    this.tail = new THREE.Group(); this.tail.position.set(0, 0.55 * s, -0.32 * s); this.root.add(this.tail);
    const tm = legMesh(0.025 * s, (cat ? 0.4 : 0.3) * s, m); tm.rotation.x = Math.PI; this.tail.add(tm);
    this.tail.rotation.x = cat ? -0.3 : -0.9;
    this.radius = 0.25;
    this.barkT = rand(10, 40);
    this.home = null;
  }
  update(dt) {
    const g = this.game;
    this.stateT -= dt;
    const p = g.player.position;
    const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    if (!this.isCat) {
      // follow the player around, staying a few meters behind
      const riding = g.player.mode === 'ride';
      const near = riding ? 6 : 3;
      if (d > 200) this.setPos(p.x - 3, p.z - 3);
      if (d > near) {
        const sp = riding ? Math.min(13, Math.abs(g.player.horse.speed) + 2 + (d - near) * 0.5) : Math.min(6, 1 + d);
        this.steer(dt, p.x + 1.5, p.z - 1.5, sp, near * 0.8);
        this.sitting = false;
      } else {
        this.speed = damp(this.speed, 0, 6, dt);
        if (this.speed < 0.1) this.sitting = true;
      }
      this.barkT -= dt;
      if (this.barkT < 0) { this.barkT = rand(20, 60); g.audio.bark(this.pos); }
      this.tail.rotation.z = Math.sin(performance.now() * 0.02) * 0.5;
    } else {
      if (this.state === 'walk' && this.target) { if (this.steer(dt, this.target.x, this.target.z, 0.9, 0.5) || this.stateT < 0) { this.state = 'sit'; this.stateT = rand(5, 15); } }
      else {
        this.speed = damp(this.speed, 0, 6, dt);
        if (this.stateT < 0 && this.home) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * this.home.r;
          this.target = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
          this.state = 'walk'; this.stateT = 12;
        }
      }
      this.sitting = this.state === 'sit';
      this.tail.rotation.z = Math.sin(performance.now() * 0.003) * 0.4;
    }
    this.move(dt);
    this.animLegs(dt, 3, 0.6);
    this.root.children[0].rotation.x = Math.PI / 2 - (this.sitting ? 0.5 : 0);
    if (this.sitting) { this.legs[2].rotation.x = -1.2; this.legs[3].rotation.x = -1.2; }
  }
}

// ---------------------------------------------------------------------------
export class Animals {
  constructor(game) {
    this.game = game;
    this.cattle = [];
    this.chickens = [];
    this.dog = null;
    this.cat = null;
    const b = game.state.ranch.buildings;
    for (const k of ['coop', 'doghouse', 'barn', 'cattle']) if (b[k]) this.onBuilding(k);
  }

  onBuilding(k) {
    const g = this.game;
    const L = g.ranch;
    if (k === 'coop' && !this.chickens.length) {
      const base = { x: 24, z: -40, r: 5 };
      for (let i = 0; i < 7; i++) {
        const c = new Chicken(g, [0xf0ece0, 0xb06a30, 0x2a2420, 0xd8b070][i % 4]);
        c.home = base; c.setPos(base.x + rand(-3, 3), base.z + rand(-3, 3));
        this.chickens.push(c);
      }
    }
    if (k === 'doghouse' && !this.dog) {
      this.dog = new Dog(g, false); this.dog.setPos(12, -27);
    }
    if (k === 'barn' && !this.cat) {
      this.cat = new Dog(g, true); this.cat.home = { x: 30, z: -10, r: 8 }; this.cat.setPos(30, -6);
    }
    if (k === 'cattle') {
      const pen = L.cattlePen();
      this.spawnCattle(6, { x: pen.x, z: pen.z, r: Math.min(pen.hw, pen.hd) - 3 }, 'ranch');
    }
  }

  spawnCattle(n, home, tag) {
    const kinds = ['brown', 'black', 'white', 'red', 'longhorn'];
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = new Cow(this.game, kinds[Math.floor(Math.random() * kinds.length)]);
      c.home = home; c.tag = tag;
      c.setPos(home.x + rand(-home.r, home.r) * 0.6, home.z + rand(-home.r, home.r) * 0.6);
      c.root.position.copy(c.pos);
      this.cattle.push(c);
      out.push(c);
    }
    return out;
  }

  removeCow(c) {
    this.game.scene.remove(c.root);
    this.cattle = this.cattle.filter((x) => x !== c);
  }

  update(dt) {
    const g = this.game;
    const threats = [];
    const p = g.player;
    if (p.mode === 'ride') threats.push({ x: p.horse.pos.x, z: p.horse.pos.z, r: 11 });
    else threats.push({ x: p.pos.x, z: p.pos.z, r: 3 });
    if (this.dog && this.dog.speed > 1) threats.push({ x: this.dog.pos.x, z: this.dog.pos.z, r: 5 });
    const cam = g.camera.position;
    for (const c of this.cattle) {
      if (c.pos.distanceTo(cam) > 250 && !c.tethered && !c.important) { c.root.visible = false; continue; }
      c.root.visible = true;
      c.update(dt, threats);
    }
    for (const c of this.chickens) if (c.pos.distanceTo(cam) < 120) c.update(dt);
    if (this.dog) this.dog.update(dt);
    if (this.cat && this.cat.pos.distanceTo(cam) < 120) this.cat.update(dt);
  }

  interactables(p) {
    const out = [];
    if (p.mode !== 'foot') return out;
    if (this.dog) out.push({ x: this.dog.pos.x, z: this.dog.pos.z, r: 1.8, label: 'Buddy streicheln 🐕', action: () => { this.game.audio.bark(this.dog.pos); this.game.ui.toast('Buddy wedelt glücklich mit dem Schwanz!'); this.game.events.emit('petDog'); } });
    if (this.cat) out.push({ x: this.cat.pos.x, z: this.cat.pos.z, r: 1.5, label: 'Stallkatze streicheln 🐈', action: () => { this.game.audio.meow(this.cat.pos); this.game.ui.toast('Die Stallkatze schnurrt zufrieden. Prrr …'); this.game.events.emit('petCat'); } });
    return out;
  }
}

export { Cow };
