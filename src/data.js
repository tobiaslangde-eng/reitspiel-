// Rassen, Genetik, Pferde-Datenmodell
import { clamp, lerp, rng, pick, mix, newSeed } from './util.js';

export const STATS = ['speed', 'stamina', 'agility', 'jump', 'obedience'];
export const STAT_NAMES = { speed: 'Tempo', stamina: 'Ausdauer', agility: 'Wendigkeit', jump: 'Springkraft', obedience: 'Rittigkeit' };
export const TYPE_NAMES = { W: 'Westernpferd', E: 'Sportpferd', B: 'Barockpferd', K: 'Kaltblut', P: 'Pony' };

const DEF_CONF = { bulk: 1, leg: 1, neck: 1, head: 1, profile: 0, feather: 0, mane: 0.8, sheen: 0, tailSet: 0 };
const DEF_POOL = { E: 0.5, A: 0.6, Cr: 0, D: 0, G: 0.04, TO: 0, LP: 0, RN: 0, F: 0.2, white: 1 };

// [id, Name, Herkunft, Typ, [min,max] Stockmaß, conf, [Tempo, Ausdauer, Wendigkeit, Springkraft, Rittigkeit], Genpool, Preis, Beschreibung]
const B = [
  ['quarter', 'Quarter Horse', 'USA', 'W', [148, 160], { bulk: 1.12, leg: 0.95, neck: 0.95, mane: 0.7 }, [78, 60, 90, 45, 76], { E: 0.45, Cr: 0.12, D: 0.1, RN: 0.08 }, 4500, 'Das Westernpferd schlechthin: explosiver Antritt, wendig und nervenstark.'],
  ['paint', 'Paint Horse', 'USA', 'W', [148, 160], { bulk: 1.1, leg: 0.95, neck: 0.95, mane: 0.7 }, [74, 60, 86, 45, 74], { TO: 0.6, A: 0.5, white: 2 }, 5000, 'Geschecktes Stock Horse mit dem Körperbau des Quarter Horse.'],
  ['appaloosa', 'Appaloosa', 'USA', 'W', [145, 160], { bulk: 1.05, mane: 0.45 }, [72, 72, 80, 50, 72], { LP: 0.6, RN: 0.1 }, 4800, 'Das gefleckte Pferd der Nez Percé – ausdauernd und trittsicher.'],
  ['mustang', 'Mustang', 'USA', 'W', [138, 152], { bulk: 1.0, leg: 0.95, mane: 1.0 }, [66, 86, 78, 50, 55], { D: 0.25, Cr: 0.1, RN: 0.1, TO: 0.08 }, 1800, 'Wildpferd der Prärie: zäh, hart und eigenwillig.'],
  ['morgan', 'Morgan', 'USA', 'W', [145, 155], { bulk: 1.05, neck: 1.05, mane: 1.0 }, [64, 72, 72, 50, 82], { E: 0.6, A: 0.7, white: 0.5 }, 3500, 'Vielseitiges, williges Pferd mit stolzer Haltung.'],
  ['criollo', 'Criollo', 'Argentinien', 'W', [140, 150], { bulk: 1.1, leg: 0.94 }, [62, 94, 76, 45, 70], { D: 0.4, RN: 0.1, TO: 0.05 }, 2800, 'Das Pferd der Gauchos – nahezu unverwüstliche Ausdauer.'],
  ['araber', 'Vollblutaraber', 'Arabische Halbinsel', 'E', [145, 156], { bulk: 0.88, neck: 1.05, head: 0.9, profile: -1, tailSet: 1 }, [80, 97, 78, 55, 68], { G: 0.4, A: 0.7, white: 1.5 }, 9000, 'Edler Wüstenrenner mit Hechtkopf und hoch getragenem Schweif.'],
  ['vollblut', 'Englisches Vollblut', 'England', 'E', [157, 170], { bulk: 0.9, leg: 1.08, neck: 1.05, head: 0.95, mane: 0.5 }, [100, 78, 66, 70, 55], { E: 0.6, A: 0.8 }, 15000, 'Das schnellste Rennpferd der Welt – heißblütig und sensibel.'],
  ['achal', 'Achal-Tekkiner', 'Turkmenistan', 'E', [152, 165], { bulk: 0.82, leg: 1.08, neck: 1.1, head: 0.92, mane: 0.25, sheen: 1 }, [88, 95, 68, 62, 58], { Cr: 0.35, D: 0.1 }, 14000, 'Windhund unter den Pferden mit metallisch glänzendem Fell.'],
  ['hannoveraner', 'Hannoveraner', 'Deutschland', 'E', [162, 175], { bulk: 1.02, leg: 1.04, neck: 1.05, mane: 0.5 }, [72, 72, 68, 92, 88], { E: 0.55, A: 0.7 }, 12000, 'Weltweit erfolgreiches Sportpferd für Dressur und Springen.'],
  ['holsteiner', 'Holsteiner', 'Deutschland', 'E', [163, 175], { bulk: 1.03, leg: 1.05, neck: 1.05, mane: 0.5 }, [70, 70, 66, 98, 82], { E: 0.7, A: 0.75, G: 0.12 }, 13000, 'Springpferd mit gewaltigem Vermögen am Sprung.'],
  ['oldenburger', 'Oldenburger', 'Deutschland', 'E', [164, 176], { bulk: 1.05, leg: 1.04, neck: 1.06, mane: 0.5 }, [70, 70, 64, 88, 93], { E: 0.7, A: 0.6 }, 12500, 'Elegantes Dressurpferd mit schwungvollen Gängen.'],
  ['trakehner', 'Trakehner', 'Ostpreußen', 'E', [160, 170], { bulk: 0.97, leg: 1.04, neck: 1.05, mane: 0.5 }, [76, 82, 70, 84, 86], {}, 11000, 'Edelstes deutsches Reitpferd – hart, ausdauernd, elegant.'],
  ['kwpn', 'KWPN', 'Niederlande', 'E', [162, 174], { bulk: 1.02, leg: 1.05, neck: 1.05, mane: 0.5 }, [72, 72, 68, 94, 90], { E: 0.5 }, 13500, 'Niederländisches Warmblut, Seriensieger im Parcours.'],
  ['selle', 'Selle Français', 'Frankreich', 'E', [160, 172], { bulk: 1.02, leg: 1.04, mane: 0.5 }, [74, 74, 70, 96, 80], { E: 0.3, A: 0.7 }, 12500, 'Französisches Sportpferd mit Kämpferherz.'],
  ['friese', 'Friese', 'Niederlande', 'B', [158, 168], { bulk: 1.15, neck: 1.1, feather: 0.6, mane: 1.5, profile: 0.2 }, [58, 62, 60, 50, 90], { E: 1, A: 0, F: 0, G: 0, white: 0 }, 11000, 'Die schwarze Perle Frieslands mit üppigem Langhaar.'],
  ['pre', 'Andalusier (P.R.E.)', 'Spanien', 'B', [155, 165], { bulk: 1.05, neck: 1.1, mane: 1.4, profile: 0.3 }, [64, 70, 82, 60, 95], { G: 0.55, E: 0.7, A: 0.8, white: 0.3 }, 12000, 'Pferd der Könige – versammlungsfähig und ausdrucksstark.'],
  ['lusitano', 'Lusitano', 'Portugal', 'B', [155, 165], { bulk: 1.04, neck: 1.1, mane: 1.3, profile: 0.5 }, [64, 72, 86, 62, 92], { G: 0.35, Cr: 0.15, D: 0.1 }, 11500, 'Mutiges, wendiges Pferd der portugiesischen Reitkunst.'],
  ['lipizzaner', 'Lipizzaner', 'Slowenien / Österreich', 'B', [153, 160], { bulk: 1.08, neck: 1.05, mane: 1.0, profile: 0.5 }, [55, 72, 74, 55, 96], { G: 0.95, E: 0.8, white: 0.2 }, 13000, 'Die weißen Hengste der Hohen Schule – dunkel geboren.'],
  ['knabstrupper', 'Knabstrupper', 'Dänemark', 'E', [154, 162], { mane: 0.5 }, [64, 68, 70, 70, 82], { LP: 0.75 }, 8000, 'Dänisches Tigerscheck-Pferd, gelehrig und freundlich.'],
  ['haflinger', 'Haflinger', 'Südtirol', 'P', [138, 150], { bulk: 1.15, leg: 0.92, mane: 1.3 }, [50, 74, 64, 45, 78], { E: 0, F: 1, A: 0.5, G: 0, white: 1.5 }, 3000, 'Goldfuchs mit heller Mähne – trittsicher und gutmütig.'],
  ['islaender', 'Islandpferd', 'Island', 'P', [130, 145], { bulk: 1.12, leg: 0.88, mane: 1.5, head: 1.05 }, [52, 88, 66, 35, 76], { D: 0.2, Cr: 0.15, TO: 0.12, RN: 0.05, G: 0.1, F: 0.3 }, 4500, 'Robust, wetterhart und in allen Farben zu Hause.'],
  ['fjord', 'Fjordpferd', 'Norwegen', 'P', [135, 150], { bulk: 1.18, leg: 0.9, neck: 0.95, mane: 0.3 }, [48, 80, 62, 40, 82], { D: 1, E: 0.9, A: 0.95, G: 0, F: 0, white: 0 }, 4000, 'Urtümlicher Falbe mit Aalstrich und Stehmähne.'],
  ['connemara', 'Connemara-Pony', 'Irland', 'P', [135, 148], {}, [60, 76, 78, 82, 78], { G: 0.5, D: 0.2, Cr: 0.1 }, 5000, 'Springgewaltiges Pony von der irischen Westküste.'],
  ['welsh', 'Welsh Cob', 'Wales', 'P', [137, 150], { bulk: 1.1, feather: 0.25, mane: 1.1 }, [58, 72, 74, 66, 76], { white: 2, Cr: 0.1, RN: 0.05 }, 4200, 'Kraftvolles Pony mit viel Aktion und Charakter.'],
  ['shetland', 'Shetlandpony', 'Schottland', 'P', [95, 107], { bulk: 1.3, leg: 0.78, head: 1.15, mane: 1.6 }, [30, 70, 60, 30, 60], { TO: 0.3, E: 0.6, A: 0.4, F: 0.3, Cr: 0.05 }, 1500, 'Klein, stark und schlau – der Liebling aller Fohlenkoppeln.'],
  ['camargue', 'Camargue-Pferd', 'Frankreich', 'P', [135, 150], { bulk: 1.05, mane: 1.2 }, [58, 88, 80, 50, 70], { G: 1, E: 0.7 }, 4000, 'Das weiße Pferd der Sümpfe, Arbeitspferd der Gardians.'],
  ['shire', 'Shire Horse', 'England', 'K', [170, 185], { bulk: 1.4, feather: 1, head: 1.08, profile: 0.6, mane: 1.0 }, [40, 68, 35, 35, 84], { E: 0.9, white: 3 }, 7000, 'Der sanfte Riese – größte Pferderasse der Welt.'],
  ['clydesdale', 'Clydesdale', 'Schottland', 'K', [165, 180], { bulk: 1.35, feather: 1, head: 1.06, profile: 0.5 }, [42, 68, 38, 36, 82], { E: 0.9, A: 0.9, RN: 0.15, G: 0, white: 3.5 }, 7000, 'Schottisches Kaltblut mit weißen Beinen und viel Behang.'],
  ['percheron', 'Percheron', 'Frankreich', 'K', [162, 178], { bulk: 1.42, feather: 0.15, head: 1.05 }, [44, 70, 40, 38, 84], { G: 0.6, E: 1, A: 0.2, white: 0.2 }, 6500, 'Elegantes Kaltblut mit arabischem Einschlag.'],
  ['noriker', 'Noriker', 'Österreich', 'K', [158, 170], { bulk: 1.35, feather: 0.3, mane: 1.2 }, [42, 72, 40, 36, 82], { LP: 0.2, RN: 0.15, F: 0.5 }, 5500, 'Alpenländisches Gebirgskaltblut, oft als Tiger oder Mohrenkopf.'],
  ['tinker', 'Tinker (Irish Cob)', 'Irland', 'K', [140, 158], { bulk: 1.3, feather: 1, mane: 1.6, head: 1.05 }, [45, 70, 50, 45, 86], { TO: 0.75, E: 0.8, A: 0.3, white: 3 }, 6000, 'Gescheckter Cob mit üppigem Behang und großem Herzen.'],
  ['schwarzwaelder', 'Schwarzwälder Fuchs', 'Deutschland', 'K', [148, 160], { bulk: 1.25, feather: 0.2, mane: 1.4 }, [46, 72, 48, 40, 84], { E: 0, F: 1, G: 0, white: 1.5 }, 5000, 'Dunkelfuchs mit flachsblonder Mähne aus dem Schwarzwald.'],
];
export const BREEDS = B.map((b) => ({ id: b[0], name: b[1], origin: b[2], type: b[3], height: b[4], conf: { ...DEF_CONF, ...b[5] }, stats: b[6], pool: { ...DEF_POOL, ...b[7] }, price: b[8], desc: b[9] }));
export const BREED = Object.fromEntries(BREEDS.map((b) => [b.id, b]));

export const LOCI = ['E', 'A', 'Cr', 'D', 'G', 'TO', 'LP', 'RN', 'F'];
export const FACE_NAMES = ['Kein Abzeichen', 'Stern', 'Strich', 'Blesse', 'Laterne'];
export const LEG_NAMES = ['ohne', 'Krone', 'Fessel', 'Stiefel'];

const MARES = ['Luna', 'Stella', 'Bella', 'Fee', 'Nala', 'Maja', 'Dakota', 'Cheyenne', 'Kira', 'Amira', 'Soraya', 'Wolke', 'Flocke', 'Ronja', 'Lady', 'Shakira', 'Mira', 'Tinka', 'Paloma', 'Savannah', 'Honey', 'Gypsy', 'Aurora', 'Heidi', 'Juna', 'Cara', 'Vroni', 'Daisy', 'Indira', 'Roxy'];
const STALLIONS = ['Sturm', 'Donner', 'Blitz', 'Apollo', 'Maverick', 'Dallas', 'Dusty', 'Ranger', 'Bandit', 'Samurai', 'Odin', 'Fürst', 'Caruso', 'Rubin', 'Sultan', 'Navarro', 'Chico', 'Shadow', 'Tornado', 'Jolly', 'Whiskey', 'Colorado', 'Amigo', 'Diego', 'Baron', 'Lando', 'Quinto', 'Zorro', 'Merlin', 'Wotan'];
export const randomName = (sex, r = Math.random) => pick(r, sex === 'Stute' ? MARES : STALLIONS);

const has = (g, k) => g[k][0] + g[k][1];

// Phänotyp aus Genotyp (und Alter – Schimmel werden mit den Jahren weiß)
export function coatOf(g, age = 6) {
  const E = has(g, 'E') > 0, A = has(g, 'A') > 0, cr = has(g, 'Cr'), dun = has(g, 'D') > 0, gr = has(g, 'G');
  const flax = has(g, 'F') === 2;
  const base = !E ? 'ch' : A ? 'bay' : 'bl';
  let body, mane, points = null, name, skin = '#2b2523';
  const BLK = '#16120f';
  if (base === 'ch') { body = '#8c4a24'; mane = flax ? '#dcc391' : '#7a3e1c'; name = flax ? 'Lichtfuchs' : 'Fuchs'; }
  else if (base === 'bay') { body = '#6f381b'; mane = BLK; points = BLK; name = 'Brauner'; }
  else { body = '#1f1b19'; mane = '#0e0c0b'; points = '#131010'; name = 'Rappe'; }
  if (cr === 1) {
    if (base === 'ch') { body = '#d8a84e'; mane = '#f3e9cf'; name = 'Palomino'; }
    else if (base === 'bay') { body = '#c9a15e'; name = 'Buckskin'; }
    else { body = '#2e2520'; name = 'Smoky Black'; }
  } else if (cr === 2) {
    skin = '#d8a99c';
    if (base === 'ch') { body = '#f0e3c8'; mane = '#f6efdc'; name = 'Cremello'; }
    else if (base === 'bay') { body = '#ecdcba'; mane = '#d6b88c'; points = '#d9bd94'; name = 'Perlino'; }
    else { body = '#e6d6b6'; mane = '#d9c9a8'; points = '#dccba9'; name = 'Smoky Cream'; }
  }
  if (dun && cr < 2) {
    if (base === 'ch') { body = cr ? '#dcb878' : '#c98f5c'; if (!cr && !flax) mane = '#8c4a24'; points = '#8c4a24'; name = cr ? 'Palomino-Falbe' : 'Rotfalbe'; }
    else if (base === 'bay') { body = cr ? '#d6bd8a' : '#c4a36c'; name = cr ? 'Buckskin-Falbe' : 'Falbe'; }
    else { body = '#8d8679'; name = 'Mausfalbe'; }
  }
  const rn = has(g, 'RN') > 0, to = has(g, 'TO') > 0, lp = has(g, 'LP');
  if (rn) name = name === 'Fuchs' ? 'Rotschimmel' : name === 'Brauner' ? 'Braunschimmel' : name === 'Rappe' ? 'Blauschimmel' : name + '-Roan';
  if (to) name += '-Schecke';
  if (lp) name += lp === 2 ? '-Volltiger' : '-Tigerschecke';
  let greyT = 0;
  if (gr) {
    greyT = gr === 2 ? clamp((age - 0.3) / 5, 0, 1) : clamp((age - 0.5) / 8, 0, 1);
    name = greyT > 0.85 ? 'Schimmel' : greyT > 0.4 ? 'Apfelschimmel' : greyT > 0.12 ? name + ' (ergrauend)' : name + ' (wird Schimmel)';
    const W = '#e9e7e2';
    body = mix(body, W, greyT); mane = mix(mane, '#dddad4', greyT * 0.9);
    if (points) points = mix(points, '#b9b6b1', greyT * 0.85);
  }
  return { name, base, body, mane, points, skin, greyT, dapple: gr && greyT > 0.25 && greyT < 0.85, tobiano: to, leopard: lp, roan: rn, dun: dun && cr < 2, pink: cr === 2 };
}

export function randomGenes(pool, r) {
  const g = {};
  for (const k of LOCI) g[k] = [r() < (pool[k] ?? 0) ? 1 : 0, r() < (pool[k] ?? 0) ? 1 : 0];
  return g;
}
function randomMarks(pool, r) {
  const w = pool.white;
  const face = clamp(Math.round(w * (0.3 + r() * 1.5) - 0.3), 0, 4);
  const legs = [0, 0, 0, 0].map(() => clamp(Math.round(w * r() * 1.3 - 0.35), 0, 3));
  return { face, legs };
}

// Farb-Vorlagen für den Pferde-Editor
export const COLOR_PRESETS = {
  Fuchs: { E: [0, 0], F: [0, 0] }, Lichtfuchs: { E: [0, 0], F: [1, 1] }, Brauner: { E: [1, 0], A: [1, 0] }, Rappe: { E: [1, 0], A: [0, 0] },
  Palomino: { E: [0, 0], Cr: [1, 0] }, Buckskin: { E: [1, 0], A: [1, 0], Cr: [1, 0] }, 'Smoky Black': { E: [1, 0], A: [0, 0], Cr: [1, 0] },
  Cremello: { E: [0, 0], Cr: [1, 1] }, Perlino: { E: [1, 0], A: [1, 0], Cr: [1, 1] },
  Falbe: { E: [1, 0], A: [1, 0], D: [1, 0] }, Rotfalbe: { E: [0, 0], D: [1, 0] }, Mausfalbe: { E: [1, 0], A: [0, 0], D: [1, 0] },
};
export function genesFromPreset(preset, flags = {}) {
  const g = {};
  for (const k of LOCI) g[k] = [0, 0];
  g.A = [Math.random() < 0.5 ? 1 : 0, 0]; g.F = [Math.random() < 0.3 ? 1 : 0, 0];
  Object.assign(g, JSON.parse(JSON.stringify(COLOR_PRESETS[preset] || COLOR_PRESETS.Brauner)));
  if (flags.grey) g.G = [1, 1];
  if (flags.roan) g.RN = [1, 0];
  if (flags.tobiano) g.TO = [1, 0];
  if (flags.leopard) g.LP = [1, 0];
  return g;
}

let idc = 1;
export const newId = () => 'h' + Date.now().toString(36) + (idc++).toString(36) + Math.floor(Math.random() * 1e4).toString(36);

export function makeHorse(o = {}) {
  const r = o.rand || Math.random;
  const breed = BREED[o.breed] || pick(r, BREEDS);
  const sex = o.sex || (r() < 0.5 ? 'Stute' : r() < 0.6 ? 'Hengst' : 'Wallach');
  const marks = randomMarks(breed.pool, r);
  const q = o.quality ?? 0;
  const pot = {};
  STATS.forEach((k, i) => { pot[k] = clamp(Math.round(breed.stats[i] + (r() - 0.5) * 14 + q), 15, 100); });
  const tr = o.train ?? 0.35;
  const sexH = sex === 'Stute' ? -1.5 : 1;
  return {
    id: newId(), name: o.name || randomName(sex, r), breed: breed.id, breedName: breed.name, type: breed.type, sex,
    age: o.age ?? 4 + Math.floor(r() * 8), genes: o.genes || randomGenes(breed.pool, r),
    face: o.face ?? marks.face, legs: o.legs || marks.legs, seed: Math.floor(r() * 1e9),
    conf: { ...breed.conf, height: o.height || Math.round(lerp(breed.height[0], breed.height[1], r()) + sexH), bulk: breed.conf.bulk * (o.bulkMul || 0.97 + r() * 0.06), mane: o.mane ?? breed.conf.mane },
    pot, train: Object.fromEntries(STATS.map((k) => [k, clamp(tr + (r() - 0.5) * 0.2, 0, 1)])),
    food: 80, clean: 80, bond: o.bond ?? 20, energy: 3, style: breed.type === 'W' ? 'western' : 'english',
    pregnant: null, parents: null, wins: 0, starts: 0,
  };
}

export function breedFoal(mare, sire, r = Math.random) {
  const genes = {};
  for (const k of LOCI) genes[k] = [mare.genes[k][r() < 0.5 ? 0 : 1], sire.genes[k][r() < 0.5 ? 0 : 1]];
  const jit = (a, b, s) => (a + b) / 2 + (r() + r() - 1) * s;
  const conf = {};
  for (const k of Object.keys(mare.conf)) conf[k] = jit(mare.conf[k], sire.conf[k] ?? mare.conf[k], k === 'height' ? 3 : 0.03);
  conf.height = Math.round(conf.height); conf.feather = clamp(conf.feather, 0, 1); conf.sheen = clamp(conf.sheen, 0, 1);
  const pot = {};
  for (const k of STATS) pot[k] = clamp(Math.round(jit(mare.pot[k], sire.pot[k], 6) + (r() < 0.12 ? 6 : 0)), 15, 100);
  const sex = r() < 0.5 ? 'Stute' : 'Hengst';
  const pure = mare.breed === sire.breed && mare.breed !== 'mix';
  let breedName = mare.breedName;
  if (!pure) breedName = mare.breed !== 'mix' && sire.breed !== 'mix' ? `${BREED[mare.breed].name} × ${BREED[sire.breed].name}` : 'Mischling';
  const typ = mare.type === sire.type ? mare.type : (r() < 0.5 ? mare.type : sire.type);
  return {
    id: newId(), name: randomName(sex, r), breed: pure ? mare.breed : 'mix', breedName, type: typ, sex, age: 0, genes,
    face: clamp(Math.round(jit(mare.face, sire.face, 0.9)), 0, 4), legs: mare.legs.map((v, i) => clamp(Math.round(jit(v, sire.legs[i], 0.9)), 0, 3)),
    seed: Math.floor(r() * 1e9), conf, pot, train: Object.fromEntries(STATS.map((k) => [k, 0.1])),
    food: 90, clean: 90, bond: 35, energy: 3, style: mare.style, pregnant: null, parents: [mare.name, sire.name], wins: 0, starts: 0,
  };
}

// Wahrscheinliche Fohlenfarben (Stichprobe)
export function foalColorOdds(mare, sire) {
  const r = rng(12345), c = {};
  for (let i = 0; i < 300; i++) {
    const g = {};
    for (const k of LOCI) g[k] = [mare.genes[k][r() < 0.5 ? 0 : 1], sire.genes[k][r() < 0.5 ? 0 : 1]];
    const n = coatOf(g, g.G[0] + g.G[1] ? 12 : 5).name;
    c[n] = (c[n] || 0) + 1;
  }
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, v]) => [n, Math.round(v / 3)]);
}

export const RIDE_AGE = 3;
export function ageFactor(a) { return a < 3 ? 0.55 + a * 0.1 : a < 5 ? 0.9 + (a - 3) * 0.05 : a <= 16 ? 1 : Math.max(0.7, 1 - (a - 16) * 0.025); }
export function formOf(h) { return 0.9 + 0.1 * (h.food + h.clean) / 200 + (h.bond / 100) * 0.03; }
export function statOf(h, k) {
  let v = h.pot[k] * (0.6 + 0.4 * h.train[k]) * ageFactor(h.age) * formOf(h);
  if (k === 'obedience') v += h.bond * 0.08;
  return clamp(v, 5, 105);
}
export function ageText(h) {
  const a = h.age;
  if (a < 1) return `Fohlen · ${Math.max(1, Math.round(a * 12))} Mon.`;
  if (a < 3) return `Jungpferd · ${a.toFixed(1).replace('.', ',')} J.`;
  return `${Math.floor(a)} Jahre`;
}
export function horseValue(h) {
  const base = h.breed !== 'mix' ? BREED[h.breed].price : 3500;
  const avg = STATS.reduce((s, k) => s + h.pot[k], 0) / 5, tr = STATS.reduce((s, k) => s + h.train[k], 0) / 5;
  const am = h.age < 3 ? 0.45 + h.age * 0.15 : h.age > 16 ? Math.max(0.3, 1 - (h.age - 16) * 0.08) : 1;
  return Math.round(base * (0.4 + avg / 100) * (0.8 + tr * 0.6) * am * (1 + h.wins * 0.04) / 50) * 50;
}
export function growth(age) { return smoothT(clamp(age / 4, 0, 1)); }
function smoothT(t) { return 1 - (1 - t) * (1 - t); }

export function makeMarket(day) {
  const r = rng(day * 7919 + 13);
  const out = [];
  for (let i = 0; i < 6; i++) {
    const h = makeHorse({ rand: r, age: i === 5 ? 1 + Math.floor(r() * 2) : 3 + Math.floor(r() * 9), train: 0.25 + r() * 0.4 });
    h.id = 'm' + day + '_' + i; h.price = Math.round(horseValue(h) * 1.25 / 50) * 50;
    out.push(h);
  }
  return out;
}
export function makeStuds(day) {
  const r = rng(Math.floor(day / 5) * 104729 + 7);
  const ids = ['vollblut', 'hannoveraner', 'quarter', 'araber', 'pre', 'holsteiner', 'friese', 'paint', 'appaloosa', 'achal', 'oldenburger', 'lusitano', 'knabstrupper', 'tinker'];
  const out = [];
  for (let i = 0; i < 6; i++) {
    const h = makeHorse({ rand: r, breed: ids[Math.floor(r() * ids.length)], sex: 'Hengst', age: 6 + Math.floor(r() * 8), quality: 6, train: 0.9 });
    h.id = 's' + i; h.fee = Math.round(horseValue(h) * 0.12 / 50) * 50;
    out.push(h);
  }
  return out;
}
export { newSeed };
