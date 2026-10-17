import { clamp } from '../core/utils.js';

// Tracks riding statistics and horse needs over time.
export class Stats {
  constructor(game) {
    this.game = game;
  }

  trackRide(h, dt) {
    const s = this.game.state.stats;
    s.distance += h.moved || 0;
    s.maxSpeed = Math.max(s.maxSpeed, Math.abs(h.speed));
    if (this.game.sky.isNight && Math.abs(h.speed) > 1) s.nightRides += dt;
    // riding builds a little trust and dirt
    if (Math.abs(h.speed) > 1) {
      h.data.bond = clamp(h.data.bond + dt * 0.004, 0, 100);
      h.data.xp = (h.data.xp || 0) + dt * Math.abs(h.speed) * 0.01;
    }
  }

  update(dt, hours) {
    const g = this.game;
    const ranch = g.ranch;
    const autoWater = ranch.has('trough');
    const autoHay = ranch.has('hayshed');
    const autoPasture = ranch.has('pasture');
    for (const h of g.horses) {
      const n = h.data.needs;
      if (!n) continue;
      const ridden = h.rider ? 1 : 0;
      const atRanch = ranch.isInside(h.pos, 30);
      n.hunger = clamp(n.hunger - hours * (2.2 + ridden * 2), 0, 100);
      n.thirst = clamp(n.thirst - hours * (3 + ridden * 3 + (g.season === 'summer' ? 1.5 : 0)), 0, 100);
      n.clean = clamp(n.clean - hours * (0.8 + ridden * 1.5 + g.weather.wetness * 2), 0, 100);
      if (atRanch && !ridden) {
        if (autoWater) n.thirst = clamp(n.thirst + hours * 12, 0, 100);
        if (autoHay) n.hunger = clamp(n.hunger + hours * 6, 0, 100);
        if (autoPasture && g.season !== 'winter') n.hunger = clamp(n.hunger + hours * 4, 0, 100);
      }
      if (h.waterDepth > 0.3 && !ridden) n.thirst = clamp(n.thirst + hours * 20, 0, 100);
      const avg = (n.hunger + n.thirst + n.clean) / 3;
      n.happy = clamp(n.happy + (avg - n.happy) * hours * 0.1, 0, 100);
      // neglect slowly erodes trust
      if (avg < 25) h.data.bond = clamp(h.data.bond - hours * 0.2, 0, 100);
      h.rig.coatMat.userData.uniforms.uDirt.value = clamp(1 - n.clean / 100, 0, 1) * 0.9;
      h.rig.coatMat.userData.uniforms.uWet.value = g.weather.wetness * (h.rig.root.visible ? 1 : 0);
    }
  }
}
