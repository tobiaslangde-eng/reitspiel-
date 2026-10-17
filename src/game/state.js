import { randomHorse } from '../horse/breeds.js';

const KEY = 'silverSpurRanch.save.v1';

export const STARTER_HORSES = [
  { breed: 'quarter', coat: 'brauner', name: 'Cody', gender: 'Wallach', personality: 'mutig' },
  { breed: 'paint', coat: 'schecke', name: 'Sunny', gender: 'Stute', personality: 'verschmust' },
  { breed: 'appaloosa', coat: 'appaloosa', name: 'Pepper', gender: 'Stute', personality: 'verspielt' },
  { breed: 'mustang', coat: 'falbe', name: 'Spirit', gender: 'Hengst', personality: 'aengstlich' },
];

export function newGameState(playerName, starterIdx = 0, horseName) {
  const st = STARTER_HORSES[starterIdx] || STARTER_HORSES[0];
  const h = randomHorse(st.breed, { coat: st.coat, gender: st.gender, personality: st.personality, name: horseName || st.name, bond: 25, age: 6 });
  h.tack = { saddle: 'saddle_tessa', bridle: 'bridle_tessa', pad: 'pad_tessa', breast: 'breast_tessa', wraps: null, mask: null };
  return {
    version: 1,
    playerName: playerName || 'Tessa',
    money: 600,
    day: 1,
    hour: 7.5,
    horses: [h],
    activeHorse: h.id,
    owned: ['saddle_tessa', 'bridle_tessa', 'pad_tessa', 'breast_tessa', 'saddle_basic', 'pad_navajo', 'bridle_basic',
      'hat_brown', 'hat_none', 'shirt_plaid_red', 'vest_none', 'pants_jeans', 'chaps_none', 'boots_brown', 'scarf_red', 'scarf_none',
      'hair_brown', 'hair_blonde', 'hair_black', 'hair_red'],
    items: { hay: 10, apple: 5, carrot: 5, treat: 2 },
    outfit: { hat: 'hat_brown', shirt: 'shirt_plaid_red', vest: 'vest_none', pants: 'pants_jeans', chaps: 'chaps_none', boots: 'boots_brown', scarf: 'scarf_red', hair: 'hair_brown' },
    ranch: { buildings: { stable: 1, paddock: 1 }, decor: [] },
    trophies: [],
    quests: { active: [], done: 0, board: [] },
    achievements: {},
    stats: { distance: 0, jumps: 0, slides: 0, spins: 0, treasures: 0, tamed: 0, foals: 0, cattle: 0, events: 0, wins: 0, photos: 0, whistles: 0, carePoints: 0, earned: 0, maxSpeed: 0, nightRides: 0 },
    discovered: [],
    treasure: null,
    pregnancies: [],
    settings: { quality: 'auto', music: 0.6, sfx: 0.8, seasonOverride: null, weatherOverride: null, sensitivity: 1 },
    tutorialDone: false,
    pos: null,
  };
}

export function saveGame(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // forward-compat defaults
    const def = newGameState(s.playerName);
    for (const k of Object.keys(def)) if (s[k] === undefined) s[k] = def[k];
    for (const k of Object.keys(def.stats)) if (s.stats[k] === undefined) s.stats[k] = 0;
    for (const k of Object.keys(def.settings)) if (s.settings[k] === undefined) s.settings[k] = def.settings[k];
    return s;
  } catch (e) {
    console.warn('load failed', e);
    return null;
  }
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function deleteSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
