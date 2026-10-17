import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Input } from './core/input.js';
import { Events } from './core/events.js';
import { clamp, lerp, smoothstep } from './core/utils.js';
import { Terrain, heightAt, RANCH, POOL, riverInfo } from './world/terrain.js';
import { Sky, SEASONS, SEASON_NAMES, DAYS_PER_SEASON, SECONDS_PER_HOUR } from './world/sky.js';
import { Water } from './world/water.js';
import { Weather, WEATHER } from './world/weather.js';
import { Vegetation, Grass } from './world/vegetation.js';
import { Colliders } from './world/colliders.js';
import { setNightGlow } from './world/buildings.js';
import { Horse } from './horse/horse.js';
import { Tack } from './horse/tack.js';
import { Player } from './player/player.js';
import { FollowCamera } from './player/camera.js';
import { FX } from './fx/fx.js';
import { AudioEngine } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { Menus } from './ui/menus.js';
import { MainMenu } from './ui/mainmenu.js';
import { newGameState, saveGame, loadGame } from './game/state.js';
import { Ranch } from './ranch/ranch.js';
import { Animals } from './ranch/animals.js';
import { Town } from './world/town.js';
import { Places } from './world/places.js';
import { Quests } from './game/quests.js';
import { Competitions } from './game/competitions.js';
import { Lasso } from './game/lasso.js';
import { Care } from './game/care.js';
import { Achievements } from './game/achievements.js';
import { Wildlife } from './game/wildlife.js';
import { Photo } from './game/photo.js';
import { Stats } from './game/stats.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.events = new Events();
    this.input = new Input(this.canvas);
    this.audio = new AudioEngine();
    this.ui = new UI(this);
    this.time = 0;
    this.started = false;
    this.mainMenu = new MainMenu(this);
  }

  detectQuality() {
    const mem = navigator.deviceMemory || 8;
    const cores = navigator.hardwareConcurrency || 4;
    const small = Math.min(screen.width, screen.height) < 700;
    if (small || mem <= 4 || cores <= 4) return 'low';
    if (cores >= 8 && mem >= 8) return 'high';
    return 'medium';
  }

  async start(state) {
    this.state = state;
    const qSetting = state.settings.quality === 'auto' ? this.detectQuality() : state.settings.quality;
    this.quality = qSetting;
    await this.mainMenu.setLoading('Die Prärie wird erschaffen …');
    try { await Promise.race([document.fonts.load('40px Rye'), new Promise((r) => setTimeout(r, 1500))]); } catch { /* fonts optional */ }

    // Renderer
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.FogExp2(0xaabbcc, 0.0015);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3500);
    this.followCam = new FollowCamera(this.camera, this.input);

    await this.mainMenu.setLoading('Berge und Canyons wachsen …');
    this.colliders = new Colliders();
    this.terrain = new Terrain(scene, this.quality);
    this.sky = new Sky(scene);
    this.sky.setShadowQuality(this.quality);
    this.weather = new Weather(scene);
    this.weather.override = state.settings.weatherOverride;
    this.water = new Water(scene);
    await this.mainMenu.setLoading('Bäume, Kakteen und Blumen sprießen …');
    this.vegetation = new Vegetation(scene, this.colliders, this.quality);
    this.grass = new Grass(scene, this.quality);
    this.fx = new FX(this);
    this.tack = new Tack(this);

    await this.mainMenu.setLoading('Die Ranch und das Städtchen werden gebaut …');
    this.ranch = new Ranch(this);
    this.town = new Town(this);
    this.places = new Places(this);
    this.animals = new Animals(this);
    this.stats = new Stats(this);

    // Horses
    this.horses = [];
    for (const hd of state.horses) this.spawnHorse(hd);
    this.player = new Player(this);
    this.care = new Care(this);
    this.lasso = new Lasso(this);
    this.wildlife = new Wildlife(this);
    this.quests = new Quests(this);
    this.competitions = new Competitions(this);
    this.achievements = new Achievements(this);
    this.photo = new Photo(this);
    this.menus = new Menus(this);

    // Place player
    const active = this.activeHorseEntity();
    if (state.pos) {
      this.player.pos.set(state.pos.x, heightAt(state.pos.x, state.pos.z), state.pos.z);
      if (active) active.setPosition(state.pos.x + 2, state.pos.z + 1, 0);
    } else {
      this.player.pos.set(RANCH.x + 6, RANCH.h, RANCH.z + 18);
      if (active) active.setPosition(RANCH.x + 8, RANCH.z + 16, -Math.PI / 2);
    }
    if (active) { active.home = null; active.state = 'stand'; }
    this.followCam.yaw = Math.PI * 0.85;
    this.followCam.focus.copy(this.player.pos);

    // Post processing
    this.composer = null;
    if (this.quality !== 'low') {
      const comp = new EffectComposer(r);
      comp.addPass(new RenderPass(scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.6, 0.92);
      comp.addPass(this.bloom);
      comp.addPass(new OutputPass());
      this.composer = comp;
    }
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envT = 0;

    // Season & world look
    this.season = this.computeSeason();
    this.applySeason(true);
    this.ui.buildMapImage(512, this.season);

    // Events
    this.weather.onThunder = (delay) => this.onThunder(delay);
    window.addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('click', () => {
      if (!this.ui.modalOpen && !this.photo.active && this.started && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock?.();
      }
    });
    this.resize();
    this.audio.setVolumes(state.settings.music, state.settings.sfx);

    // Warm up shader compilation
    await this.mainMenu.setLoading('Pferde werden gestriegelt …');
    this.updateWorld(0.016);
    r.compile(scene, this.camera);
    this.mainMenu.hide();
    this.ui.show('hud');
    this.started = true;
    this.clock = new THREE.Clock();
    this.autosaveT = 60;
    this.ui.banner(`Willkommen, ${state.playerName}!`, 'Deine eigene Ranch im Wilden Westen', 4);
    if (!state.tutorialDone) setTimeout(() => this.menus.showHelp(true), 1500);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  spawnHorse(hd) {
    const h = new Horse(this, hd);
    h.onStep = (horse, i) => { if (horse.pos.distanceTo(this.camera.position) < 60) this.fx.onStep(horse, i); };
    h.onEvent = (type, data, horse) => this.onHorseEvent(type, data, horse);
    const pad = this.ranch.paddockArea();
    const a = Math.random() * Math.PI * 2, rr = Math.random() * pad.r * 0.7;
    h.setPosition(pad.x + Math.cos(a) * rr, pad.z + Math.sin(a) * rr, Math.random() * 6);
    h.home = pad;
    h.state = 'stand';
    this.horses.push(h);
    return h;
  }

  removeHorse(id) {
    const i = this.horses.findIndex((h) => h.data.id === id);
    if (i >= 0) { this.tack.removeReins(this.horses[i]); this.horses[i].dispose(); this.horses.splice(i, 1); }
    this.state.horses = this.state.horses.filter((h) => h.id !== id);
  }

  activeHorseEntity() {
    return this.horses.find((h) => h.data.id === this.state.activeHorse) || this.horses[0];
  }

  computeSeason() {
    const o = this.state.settings.seasonOverride;
    if (o) return o;
    return SEASONS[Math.floor((this.state.day - 1) / DAYS_PER_SEASON) % 4];
  }

  applySeason(initial = false) {
    this.terrain.recolor(this.season);
    this.vegetation.setSeason(this.season);
    this.grass.setSeason(this.season);
    if (!initial) {
      this.ui.buildMapImage(512, this.season);
      this.ui.banner(SEASON_NAMES[this.season], { spring: 'Blumenwiesen blühen auf', summer: 'Heiße Tage in der Prärie', autumn: 'Buntes Laub fällt', winter: 'Schnee bedeckt das Land' }[this.season], 3.5);
    }
    this.events.emit('season', this.season);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    if (!this.renderer) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(w, h);
    this.fx.setViewport(h * this.renderer.getPixelRatio());
  }

  onThunder(delay) {
    const near = delay < 0.6;
    this.audio.thunder(delay, near);
    this.followCam.shake = near ? 0.8 : 0.2;
    setTimeout(() => {
      for (const h of this.horses) if (h.pos.distanceTo(this.player.position) < 80) h.spook();
      if (this.player.horse) {
        const d = this.player.horse.data;
        if (d.personality === 'aengstlich') this.ui.toast(`${d.name} erschrickt vor dem Donner!`);
      }
    }, delay * 1000);
  }

  onHorseEvent(type, data, horse) {
    const ridden = horse === this.player.horse;
    switch (type) {
      case 'jump':
        this.audio.snort(horse);
        if (ridden) this.state.stats.jumps++;
        break;
      case 'land':
        this.fx.burst(horse.pos, undefined, 10, 0.5);
        this.audio.hoof('sand', 1.2, horse.pos);
        break;
      case 'refuse':
        this.audio.whinny(horse);
        if (ridden) this.ui.toast(`${horse.data.name} verweigert den Sprung! Mehr Vertrauen hilft.`);
        break;
      case 'spook':
        this.audio.whinny(horse);
        break;
      case 'buck': case 'rear':
        this.audio.whinny(horse);
        break;
      case 'exhausted':
        if (ridden) { this.ui.toast(`${horse.data.name} ist erschöpft – gönn ihm eine Pause.`); this.audio.blow(horse.pos); }
        break;
      case 'slidingStop':
        if (ridden) {
          this.state.stats.slides++;
          if (data.distance > 4) this.ui.toast(`Sliding Stop: ${data.distance.toFixed(1)} m! 🤠`);
        }
        break;
      case 'spin':
        if (ridden && data.turns >= 0.9) { this.state.stats.spins += Math.floor(data.turns); this.ui.toast(`Spin: ${data.turns.toFixed(1)} Drehungen!`); }
        break;
      case 'slideStart':
        break;
      default:
    }
    this.events.emit('horse:' + type, { horse, data, ridden });
  }

  // ------------------------------------------------------------------ main loop
  frame() {
    let dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    const inp = this.input;
    this.handleGlobalKeys();
    if (this.paused) dt = 0;

    // time of day
    const s = this.state;
    const hoursDelta = dt / SECONDS_PER_HOUR * (this.timeScale || 1);
    if (!this.photo.freezeTime) s.hour += hoursDelta;
    if (s.hour >= 24) { s.hour -= 24; this.newDay(); }

    this.player.update(dt);
    // horses
    const ppos = this.player.position;
    for (const h of this.horses) {
      if (h.rider) continue;
      const far = h.pos.distanceTo(this.camera.position) > 220;
      if (far && !h.wantUpdate && Math.random() > 0.2) continue;
      const input = h.think(dt, this.player.mode === 'foot' ? this.player.pos : ppos);
      h.drive(far ? dt * 5 : dt, input);
    }
    if (this.player.horse?.maneuver?.type === 'slide' && this.player.horse.speed > 0.5) this.fx.slideDust(this.player.horse);

    this.wildlife.update(dt);
    this.animals.update(dt);
    this.ranch.update(dt);
    this.town.update(dt);
    this.places.update(dt);
    this.lasso.update(dt);
    this.care.update(dt);
    this.quests.update(dt);
    this.competitions.update(dt);
    this.achievements.update(dt);
    this.stats.update(dt, hoursDelta);

    // camera
    const target = this.player.mode === 'ride' ? this.player.horse.pos : this.player.pos;
    const heading = this.player.mode === 'ride' ? this.player.horse.heading : this.player.heading;
    const moving = this.player.mode === 'ride' ? Math.abs(this.player.horse.speed) > 0.5 : this.player.speed > 0.5;
    this.followCam.update(dt, target, heading, moving, this.player.mode === 'ride' ? 2.0 * Math.max(0.8, this.player.horse.scale) : 1.5);
    this.audio.listener = this.camera.position;

    this.updateWorld(dt, hoursDelta);
    this.updateInteraction();
    this.updateHudThrottled(dt);

    // render
    if (this.composer && !this.photo.noBloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    if (this.photo.pendingShot) this.photo.capture();
    inp.endFrame();

    this.autosaveT -= dt;
    if (this.autosaveT < 0) { this.autosaveT = 90; this.save(true); }
  }

  updateWorld(dt, hoursDelta = 0) {
    const s = this.state;
    const seasonIdx = SEASONS.indexOf(this.season);
    const focus = this.player ? this.player.position : new THREE.Vector3();
    this.weather.update(dt, hoursDelta, this.season, s.hour, focus, this.time);
    const w = this.weather.cur;
    const res = this.sky.update(s.hour, seasonIdx, w, focus, this.time, this.weather.flash);
    this.sky.mesh.position.copy(this.camera.position);
    this.dayInfo = res;
    // fog
    const fogD = 0.0011 + w.fog * 0.016 + w.dust * 0.009 + w.rain * 0.003 + w.snow * 0.005 + (s.hour > 4.5 && s.hour < 8 ? 0.0012 : 0);
    this.scene.fog.density = fogD;
    this.scene.fog.color.copy(this.sky.fogColor);
    this.terrain.horizonMat.color.copy(this.sky.fogColor).lerp(new THREE.Color(0.25, 0.28, 0.35).multiplyScalar(0.3 + res.day * 0.7), 0.35 - w.fog * 0.3);
    this.renderer.toneMappingExposure = lerp(0.75, 1.0, res.day) + this.weather.flash * 0.6;
    this.terrain.uniforms.uSnow.value = this.weather.snowCover;
    this.terrain.uniforms.uWet.value = this.weather.wetness;
    this.water.update(this.time, this.sky, w, this.season);
    this.vegetation.update(this.time, w.wind);
    if (this.player) this.grass.update(this.player.position, this.time, w.wind, this.weather.snowCover);
    if (this.fx) this.fx.update(dt);
    setNightGlow(smoothstep(0.2, 0.7, res.night) + smoothstep(0.6, 1, this.weather.cur.cloud) * 0.3 * (1 - res.day));
    if (this.bloom) this.bloom.strength = 0.25 + res.night * 0.45 + res.sunset * 0.2;
    // environment map refresh
    this.envT -= dt;
    if (this.envT <= 0) {
      this.envT = 2.5;
      if (this.envRT) this.envRT.dispose();
      this.sky.mesh.visible = false;
      this.envRT = this.pmrem.fromScene(this.sky.envScene, 0, 0.1, 500);
      this.sky.mesh.visible = true;
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.25 + res.day * 0.5;
    }
    // music mood
    if (!this.competitions?.active) this.audio.setMood(res.night > 0.4 || res.sunset > 0.6 ? 'evening' : 'day');
    // ambience
    const p = focus;
    const ri = riverInfo(p.x, p.z);
    const water = clamp(1 - (ri.d - ri.width) / 40, 0, 1);
    const fall = clamp(1 - Math.hypot(p.x - POOL.x, p.z - POOL.z) / 120, 0, 1);
    const fire = this.ranch ? this.ranch.fireNear(p) : 0;
    this.audio.updateAmbience(dt, { rain: w.rain, wind: w.wind, dust: w.dust, water: Math.max(water, fall), waterfall: fall, fire, day: res.day, night: res.night, season: this.season });
    if (this.ranch) this.ranch.setNight(res.night, this.time);
    if (this.town) this.town.setNight(res.night);
    // waterfall mist
    if (fall > 0.1 && Math.random() < 0.6) this.fx.mist(this.water.fallBase);
  }

  newDay() {
    const s = this.state;
    s.day++;
    const prev = this.season;
    this.season = this.computeSeason();
    if (prev !== this.season) this.applySeason();
    this.events.emit('newDay', s.day);
    this.save(true);
  }

  handleGlobalKeys() {
    const inp = this.input;
    if (this.ui.handleKeys(inp)) return;
    if (this.photo.active) { this.photo.handleKeys(inp); return; }
    if (this.ui.modalOpen) return;
    const p = this.player;
    if (inp.wasPressed('KeyE')) this.interact();
    if (inp.wasPressed('KeyH') && p.mode === 'foot') p.whistle();
    if (inp.wasPressed('KeyH') && p.mode === 'ride') this.ui.toast('Pfeifen kannst du, wenn du abgestiegen bist.');
    if (inp.wasPressed('KeyF')) this.lasso.trigger();
    if (inp.wasPressed('KeyG')) this.care.open();
    if (inp.wasPressed('Tab') || inp.wasPressed('KeyI')) this.menus.openMain();
    if (inp.wasPressed('KeyM')) this.menus.openMap();
    if (inp.wasPressed('KeyJ')) this.menus.openMain('quests');
    if (inp.wasPressed('KeyB')) this.ranch.openBuildMenu();
    if (inp.wasPressed('KeyP')) this.photo.enter();
    if (inp.wasPressed('F1') || inp.wasPressed('KeyK')) this.menus.showHelp();
    if (inp.wasPressed('Escape')) this.menus.openPause();
  }

  // gather interactables from all modules
  updateInteraction() {
    if (this.ui.modalOpen || this.photo.active) { this.ui.prompt(null); this.currentInteract = null; return; }
    const p = this.player;
    const pos = p.position;
    let best = null, bd = 1e9;
    const consider = (it) => {
      if (!it) return;
      const d = Math.hypot(it.x - pos.x, it.z - pos.z);
      if (d < (it.r || 3) && d < bd) { bd = d; best = it; }
    };
    if (p.mode === 'ride') {
      consider({ x: pos.x, z: pos.z, r: 100, label: 'Absteigen', action: () => p.dismount(), low: true });
      bd = 50; // anything else nearby wins
    } else {
      for (const h of this.horses) {
        if (h.data.wild) continue;
        consider({ x: h.pos.x, z: h.pos.z, r: 2.6 * h.scale, label: `Aufsteigen auf ${h.data.name}`, action: () => p.mount(h) });
      }
    }
    for (const mod of [this.ranch, this.town, this.places, this.animals, this.wildlife, this.quests, this.competitions, this.care]) {
      if (!mod.interactables) continue;
      for (const it of mod.interactables(p)) consider(it);
    }
    this.currentInteract = best;
    this.ui.prompt(best ? `<b>E</b>${best.label}` : null);
  }

  interact() {
    const it = this.currentInteract;
    if (it) { this.audio.click(); it.action(); }
  }

  updateHudThrottled(dt) {
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    this.ui.updateHUD();
    const markers = [];
    for (const h of this.horses) if (h !== this.player.horse) markers.push({ x: h.pos.x, z: h.pos.z, color: h.data.id === this.state.activeHorse ? '#ffcf4a' : '#f0e0c0', r: 3 });
    for (const mod of [this.ranch, this.town, this.places, this.quests, this.competitions, this.wildlife]) if (mod.markers) markers.push(...mod.markers());
    this.ui.drawMinimap(markers);
  }

  // ------------------------------------------------------------------ money & save
  addMoney(v, reason) {
    this.state.money += v;
    if (v > 0) { this.state.stats.earned += v; this.audio.coin(); }
    if (reason) this.ui.toast(`${v >= 0 ? '+' : ''}$${v} · ${reason}`, v > 0 ? 'gold' : '');
    this.events.emit('money', v);
  }

  spend(v) {
    if (this.state.money < v) { this.ui.toast('Nicht genug Geld! 💸'); this.audio.fail(); return false; }
    this.state.money -= v;
    this.audio.coin();
    return true;
  }

  save(silent = false) {
    const s = this.state;
    const p = this.player.position;
    s.pos = { x: p.x, z: p.z };
    const ok = saveGame(s);
    if (!silent) this.ui.toast(ok ? '💾 Spielstand gespeichert.' : 'Speichern fehlgeschlagen.');
  }
}

const game = new Game();
window.game = game;
export { game, newGameState, loadGame, WEATHER };
