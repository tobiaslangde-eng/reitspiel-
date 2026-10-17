// Breed + coat database. Stats are 1..10.

export const COATS = {
  rappe: { name: 'Rappe', base: [0.05, 0.045, 0.045], mane: [0.03, 0.03, 0.03], point: [0.03, 0.03, 0.03], pattern: 0 },
  schimmel: { name: 'Schimmel', base: [0.82, 0.82, 0.8], mane: [0.9, 0.9, 0.88], point: [0.45, 0.45, 0.46], pattern: 1, patternColor: [0.55, 0.56, 0.58] },
  fuchs: { name: 'Fuchs', base: [0.55, 0.24, 0.1], mane: [0.48, 0.2, 0.08], point: [0.5, 0.22, 0.09], pattern: 0 },
  brauner: { name: 'Brauner', base: [0.36, 0.19, 0.09], mane: [0.04, 0.03, 0.03], point: [0.04, 0.03, 0.03], pattern: 0, points: true },
  palomino: { name: 'Palomino', base: [0.85, 0.62, 0.3], mane: [0.96, 0.93, 0.85], point: [0.8, 0.58, 0.28], pattern: 0 },
  falbe: { name: 'Falbe', base: [0.74, 0.6, 0.38], mane: [0.08, 0.06, 0.05], point: [0.1, 0.07, 0.05], pattern: 0, points: true, dorsal: true },
  schecke: { name: 'Schecke', base: [0.36, 0.19, 0.09], mane: [0.2, 0.12, 0.08], point: [0.36, 0.19, 0.09], pattern: 2, patternColor: [0.95, 0.94, 0.92] },
  rappschecke: { name: 'Rappschecke', base: [0.06, 0.05, 0.05], mane: [0.85, 0.85, 0.82], point: [0.06, 0.05, 0.05], pattern: 2, patternColor: [0.95, 0.94, 0.92] },
  tigerschecke: { name: 'Tigerschecke', base: [0.93, 0.92, 0.88], mane: [0.3, 0.26, 0.24], point: [0.82, 0.8, 0.76], pattern: 3, patternColor: [0.1, 0.08, 0.07] },
  appaloosa: { name: 'Blanket-Tigerschecke', base: [0.38, 0.2, 0.1], mane: [0.1, 0.07, 0.05], point: [0.08, 0.06, 0.05], pattern: 4, patternColor: [0.94, 0.93, 0.9], points: true },
  isabell: { name: 'Isabell', base: [0.9, 0.74, 0.45], mane: [0.95, 0.9, 0.8], point: [0.88, 0.72, 0.44], pattern: 0, sheen: 1 },
  flachs: { name: 'Fuchs (Flachsmähne)', base: [0.6, 0.32, 0.12], mane: [0.94, 0.86, 0.66], point: [0.58, 0.3, 0.12], pattern: 0 },
};

export const PERSONALITIES = {
  mutig: { name: 'Mutig', icon: '🦁', desc: 'Scheut selten, springt gern.' },
  verspielt: { name: 'Verspielt', icon: '🎈', desc: 'Liebt Leckerlis und tobt gern.' },
  aengstlich: { name: 'Ängstlich', icon: '🐇', desc: 'Erschrickt bei Gewitter, braucht viel Vertrauen.' },
  verschmust: { name: 'Verschmust', icon: '💕', desc: 'Liebt Putzen und Streicheleinheiten.' },
};

const B = (name, o) => ({ name, ...o });

// proportions: size (overall scale), bodyLen, bulk, legLen, legThick, neckLen, headLen, maneLen, tailLen, feather
export const BREEDS = {
  quarter: B('American Quarter Horse', { stats: { speed: 8, stamina: 6, agility: 9 }, price: 2400, size: 1.0, bodyLen: 0.98, bulk: 1.08, legLen: 0.96, legThick: 1.08, neckLen: 0.92, headLen: 0.95, maneLen: 0.7, tailLen: 0.95, feather: 0, coats: ['fuchs', 'brauner', 'rappe', 'palomino', 'falbe', 'schimmel', 'isabell'], desc: 'Explosiver Sprinter mit viel „Cow Sense“ – perfekt für Reining und Rinderarbeit.' }),
  paint: B('Paint Horse', { stats: { speed: 7, stamina: 7, agility: 8 }, price: 2600, size: 1.0, bodyLen: 0.98, bulk: 1.06, legLen: 0.96, legThick: 1.05, neckLen: 0.92, headLen: 0.95, maneLen: 0.75, tailLen: 0.95, feather: 0, coats: ['schecke', 'rappschecke'], desc: 'Kräftiges Westernpferd mit auffälliger Scheckung.' }),
  appaloosa: B('Appaloosa', { stats: { speed: 7, stamina: 8, agility: 7 }, price: 2500, size: 0.98, bodyLen: 1.0, bulk: 1.02, legLen: 0.98, legThick: 1.0, neckLen: 0.95, headLen: 0.97, maneLen: 0.5, tailLen: 0.75, feather: 0, coats: ['appaloosa', 'tigerschecke'], desc: 'Zähes Pferd der Nez Percé mit gepunktetem Fell.' }),
  mustang: B('Mustang', { stats: { speed: 7, stamina: 9, agility: 7 }, price: 1200, size: 0.95, bodyLen: 0.97, bulk: 0.98, legLen: 0.98, legThick: 1.0, neckLen: 0.95, headLen: 1.0, maneLen: 1.1, tailLen: 1.1, feather: 0, coats: ['falbe', 'brauner', 'fuchs', 'rappe', 'schecke', 'schimmel', 'palomino'], desc: 'Wildpferd der Prärie: robust, ausdauernd und frei.' }),
  araber: B('Araber', { stats: { speed: 8, stamina: 10, agility: 8 }, price: 4200, size: 0.95, bodyLen: 0.93, bulk: 0.9, legLen: 1.02, legThick: 0.85, neckLen: 1.05, headLen: 0.85, maneLen: 1.0, tailLen: 1.05, feather: 0, tailHigh: true, coats: ['schimmel', 'fuchs', 'brauner', 'rappe'], desc: 'Edel, feurig und mit legendärer Ausdauer.' }),
  friese: B('Friese', { stats: { speed: 6, stamina: 7, agility: 6 }, price: 4800, size: 1.08, bodyLen: 1.02, bulk: 1.1, legLen: 1.0, legThick: 1.12, neckLen: 1.1, headLen: 1.02, maneLen: 1.6, tailLen: 1.35, feather: 0.75, coats: ['rappe'], desc: 'Majestätischer Rappe mit wallender Mähne und Fesselbehang.' }),
  andalusier: B('Andalusier', { stats: { speed: 7, stamina: 7, agility: 8 }, price: 4500, size: 1.02, bodyLen: 0.98, bulk: 1.05, legLen: 1.0, legThick: 1.0, neckLen: 1.08, headLen: 0.98, maneLen: 1.5, tailLen: 1.3, feather: 0, coats: ['schimmel', 'rappe', 'brauner'], desc: 'Stolzes Barockpferd aus Spanien.' }),
  lusitano: B('Lusitano', { stats: { speed: 7, stamina: 7, agility: 9 }, price: 4600, size: 1.02, bodyLen: 0.97, bulk: 1.04, legLen: 1.0, legThick: 1.0, neckLen: 1.08, headLen: 1.0, maneLen: 1.4, tailLen: 1.25, feather: 0, coats: ['schimmel', 'brauner', 'falbe', 'isabell'], desc: 'Wendiges Barockpferd aus Portugal.' }),
  haflinger: B('Haflinger', { stats: { speed: 5, stamina: 8, agility: 6 }, price: 1800, size: 0.9, bodyLen: 0.98, bulk: 1.15, legLen: 0.9, legThick: 1.15, neckLen: 0.92, headLen: 0.95, maneLen: 0.95, tailLen: 1.0, feather: 0, coats: ['flachs'], desc: 'Fröhlicher Fuchs mit heller Mähne aus den Alpen.' }),
  tinker: B('Tinker', { stats: { speed: 5, stamina: 8, agility: 5 }, price: 3000, size: 0.98, bodyLen: 1.0, bulk: 1.22, legLen: 0.9, legThick: 1.3, neckLen: 0.95, headLen: 1.02, maneLen: 1.5, tailLen: 1.3, feather: 1.0, coats: ['rappschecke', 'schecke'], desc: 'Kuschelig, kräftig, mit üppigem Behang.' }),
  islaender: B('Isländer', { stats: { speed: 6, stamina: 9, agility: 7 }, price: 2200, size: 0.82, bodyLen: 1.0, bulk: 1.12, legLen: 0.88, legThick: 1.1, neckLen: 0.92, headLen: 1.0, maneLen: 1.5, tailLen: 1.2, feather: 0, coats: ['falbe', 'fuchs', 'rappe', 'schecke', 'brauner', 'flachs'], desc: 'Kleines, trittsicheres Pferd mit dichter Mähne.' }),
  fjord: B('Fjordpferd', { stats: { speed: 5, stamina: 8, agility: 6 }, price: 2000, size: 0.88, bodyLen: 0.98, bulk: 1.18, legLen: 0.9, legThick: 1.15, neckLen: 0.9, headLen: 0.98, maneLen: 0.35, tailLen: 0.95, feather: 0.1, maneStyle: 'fjord', coats: ['falbe'], desc: 'Falbe mit Stehmähne – ruhig und zuverlässig.' }),
  knabstrupper: B('Knabstrupper', { stats: { speed: 7, stamina: 7, agility: 7 }, price: 3800, size: 1.0, bodyLen: 0.98, bulk: 1.0, legLen: 1.0, legThick: 1.0, neckLen: 1.0, headLen: 1.0, maneLen: 0.8, tailLen: 1.0, feather: 0, coats: ['tigerschecke'], desc: 'Dänisches Pferd mit Leopardentupfen.' }),
  akhal: B('Akhal-Teke', { stats: { speed: 9, stamina: 9, agility: 7 }, price: 6000, size: 1.0, bodyLen: 1.02, bulk: 0.82, legLen: 1.08, legThick: 0.8, neckLen: 1.15, headLen: 1.0, maneLen: 0.45, tailLen: 0.85, feather: 0, coats: ['isabell', 'falbe', 'brauner', 'rappe'], sheen: 1, desc: 'Das „Goldene Pferd“ mit metallisch glänzendem Fell.' }),
  vollblut: B('Englisches Vollblut', { stats: { speed: 10, stamina: 7, agility: 7 }, price: 5500, size: 1.06, bodyLen: 1.02, bulk: 0.88, legLen: 1.1, legThick: 0.85, neckLen: 1.08, headLen: 1.0, maneLen: 0.55, tailLen: 0.9, feather: 0, coats: ['brauner', 'fuchs', 'rappe', 'schimmel'], desc: 'Das schnellste Rennpferd der Welt.' }),
  trakehner: B('Trakehner', { stats: { speed: 8, stamina: 8, agility: 8 }, price: 4400, size: 1.06, bodyLen: 1.0, bulk: 0.95, legLen: 1.06, legThick: 0.95, neckLen: 1.08, headLen: 0.98, maneLen: 0.55, tailLen: 0.95, feather: 0, coats: ['brauner', 'fuchs', 'rappe', 'schimmel'], desc: 'Elegantes Sportpferd mit großem Herz.' }),
  hannoveraner: B('Hannoveraner', { stats: { speed: 7, stamina: 8, agility: 8 }, price: 4000, size: 1.1, bodyLen: 1.02, bulk: 1.0, legLen: 1.06, legThick: 1.0, neckLen: 1.08, headLen: 1.02, maneLen: 0.5, tailLen: 0.95, feather: 0, coats: ['brauner', 'fuchs', 'rappe', 'schimmel'], desc: 'Vielseitiges Warmblut für Springen und Dressur.' }),
  morgan: B('Morgan', { stats: { speed: 7, stamina: 8, agility: 8 }, price: 2800, size: 0.96, bodyLen: 0.96, bulk: 1.05, legLen: 0.96, legThick: 1.0, neckLen: 1.05, headLen: 0.92, maneLen: 1.15, tailLen: 1.15, feather: 0, tailHigh: true, coats: ['brauner', 'rappe', 'fuchs', 'palomino'], desc: 'Kompaktes amerikanisches Allroundpferd.' }),
  shire: B('Shire Horse', { stats: { speed: 4, stamina: 9, agility: 4 }, price: 3600, size: 1.2, bodyLen: 1.05, bulk: 1.3, legLen: 1.0, legThick: 1.4, neckLen: 1.0, headLen: 1.1, maneLen: 0.9, tailLen: 1.0, feather: 1.0, coats: ['rappe', 'brauner', 'schimmel'], desc: 'Sanfter Riese – eines der größten Pferde der Welt.' }),
  noriker: B('Noriker', { stats: { speed: 4, stamina: 9, agility: 5 }, price: 3000, size: 1.06, bodyLen: 1.02, bulk: 1.3, legLen: 0.92, legThick: 1.3, neckLen: 0.95, headLen: 1.05, maneLen: 0.95, tailLen: 1.0, feather: 0.4, coats: ['tigerschecke', 'fuchs', 'brauner', 'rappe'], desc: 'Kraftvolles Kaltblut aus den Alpen.' }),
  shetty: B('Shetlandpony', { stats: { speed: 3, stamina: 7, agility: 6 }, price: 900, size: 0.55, bodyLen: 1.02, bulk: 1.3, legLen: 0.8, legThick: 1.3, neckLen: 0.88, headLen: 1.05, maneLen: 1.4, tailLen: 1.2, feather: 0.2, coats: ['rappe', 'fuchs', 'brauner', 'schecke', 'schimmel', 'flachs', 'palomino'], desc: 'Klein, frech und unglaublich niedlich.' }),
};

export const BREED_LIST = Object.keys(BREEDS);

export const MALE_NAMES = ['Blizzard', 'Comanche', 'Diablo', 'Thunder', 'Spirit', 'Apache', 'Bandit', 'Cody', 'Dakota', 'Maverick', 'Ranger', 'Rusty', 'Scout', 'Shadow', 'Smokey', 'Tex', 'Wildfire', 'Zorro', 'Buck', 'Cash'];
export const FEMALE_NAMES = ['Bella', 'Cheyenne', 'Daisy', 'Luna', 'Misty', 'Ginger', 'Honey', 'Lady', 'Nala', 'Pepper', 'Rosie', 'Sierra', 'Sunny', 'Willow', 'Ivy', 'Maple', 'Lucky Star', 'Penny', 'Juniper', 'Calla'];

export function bondLevel(bond) {
  if (bond >= 80) return { lvl: 5, name: 'Seelenverwandt' };
  if (bond >= 60) return { lvl: 4, name: 'Vertraut' };
  if (bond >= 40) return { lvl: 3, name: 'Freunde' };
  if (bond >= 20) return { lvl: 2, name: 'Bekannt' };
  return { lvl: 1, name: 'Fremd' };
}

export function randomHorse(breedKey, opts = {}) {
  const br = BREEDS[breedKey];
  const gender = opts.gender || (Math.random() < 0.5 ? 'Stute' : Math.random() < 0.5 ? 'Hengst' : 'Wallach');
  const names = gender === 'Stute' ? FEMALE_NAMES : MALE_NAMES;
  const v = () => Math.round((Math.random() - 0.5) * 2);
  const clamp10 = (x) => Math.max(1, Math.min(10, x));
  const pers = Object.keys(PERSONALITIES);
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: opts.name || names[Math.floor(Math.random() * names.length)],
    breed: breedKey,
    coat: opts.coat || br.coats[Math.floor(Math.random() * br.coats.length)],
    gender,
    age: opts.age ?? 3 + Math.floor(Math.random() * 10),
    personality: opts.personality || pers[Math.floor(Math.random() * pers.length)],
    stats: {
      speed: clamp10(br.stats.speed + v()),
      stamina: clamp10(br.stats.stamina + v()),
      agility: clamp10(br.stats.agility + v()),
    },
    bond: opts.bond ?? 10,
    needs: { hunger: 80, thirst: 80, clean: 70, happy: 70 },
    xp: 0,
    maneStyle: 'offen',
    ribbon: null,
    markings: opts.markings || {
      socks: [0, 1, 2, 3].map(() => (Math.random() < 0.3 ? 0.15 + Math.random() * 0.35 : 0)),
      blaze: Math.random() < 0.45 ? 1 + Math.floor(Math.random() * 2) : 0,
    },
    tack: { saddle: null, bridle: null, pad: null, breast: null, wraps: null, mask: null },
    growth: opts.growth ?? 1,
    shoes: false,
    wild: false,
    mix: opts.mix || null,
  };
}

// Proportions for a horse (handles mixes from breeding)
export function proportions(h) {
  const a = BREEDS[h.breed];
  if (!h.mix) return a;
  const b = BREEDS[h.mix];
  const out = { ...a };
  for (const k of ['size', 'bodyLen', 'bulk', 'legLen', 'legThick', 'neckLen', 'headLen', 'maneLen', 'tailLen', 'feather']) out[k] = (a[k] + b[k]) / 2;
  return out;
}

export function breedName(h) {
  if (h.mix) return `${BREEDS[h.breed].name} × ${BREEDS[h.mix].name}`;
  return BREEDS[h.breed].name;
}
