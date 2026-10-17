// All buyable / collectible items.
export const ITEMS = {};
const add = (id, o) => { ITEMS[id] = { id, ...o }; };

// ---------------------------------------------------------------- Saddles
add('saddle_tessa', { type: 'saddle', name: 'Sattel „Tessa“', price: 0, unique: true, special: true,
  leather: 0x3a2112, seat: 0x2a170c, tooling: 'floral', conchos: 'silver', turquoise: true, text: 'Tessa', trim: 'silver',
  desc: 'Dunkelbraunes Leder mit Blumen-Punzierungen, Silber-Conchos, Türkissteinen und silbernem Schriftzug „Tessa“.' });
add('saddle_gold', { type: 'saddle', name: 'Goldgräber-Sattel', price: 0, unique: true, leather: 0x5a2a12, seat: 0x3a1a0a, tooling: 'floral', conchos: 'gold', trim: 'gold', turquoise: true, desc: 'Ein seltener Fund aus einer Schatztruhe – mit Gold-Conchos.' });
add('saddle_basic', { type: 'saddle', name: 'Einfacher Westernsattel', price: 150, leather: 0x8a5a30, seat: 0x6e4422, tooling: null, conchos: 'brass', desc: 'Robust und bequem für lange Ausritte.' });
add('saddle_ranch', { type: 'saddle', name: 'Ranch-Sattel', price: 450, leather: 0x6b3f1f, seat: 0x4e2c14, tooling: 'basket', conchos: 'brass', desc: 'Korbflecht-Punzierung, gebaut für die Rinderarbeit.' });
add('saddle_suede', { type: 'saddle', name: 'Wildleder-Sattel', price: 600, leather: 0xb08a5a, seat: 0x8a6a44, tooling: null, conchos: 'silver', rough: true, desc: 'Weiches Wildleder in Sandfarbe.' });
add('saddle_red', { type: 'saddle', name: 'Rodeo-Sattel Rot', price: 800, leather: 0x7a2418, seat: 0x3a1410, tooling: 'floral', conchos: 'silver', desc: 'Für den großen Auftritt in der Arena.' });
add('saddle_pink', { type: 'saddle', name: 'Rosé-Sattel', price: 900, leather: 0xc77a8e, seat: 0x8e4a5e, tooling: 'floral', conchos: 'silver', turquoise: false, crystals: true, desc: 'Rosa Leder mit funkelnden Steinchen.' });
add('saddle_turquoise', { type: 'saddle', name: 'Türkis-Traum', price: 1200, leather: 0x9a6a3c, seat: 0x6a4424, tooling: 'floral', conchos: 'silver', turquoise: true, desc: 'Hellbraunes Leder mit vielen Türkissteinen.' });
add('saddle_black', { type: 'saddle', name: 'Schwarzer Show-Sattel', price: 1600, leather: 0x161210, seat: 0x0c0a08, tooling: 'floral', conchos: 'silver', trim: 'silver', desc: 'Glänzendes Schwarz mit reichlich Silberbeschlag.' });
add('saddle_white', { type: 'saddle', name: 'Weißer Paradesattel', price: 2200, leather: 0xe8e0d0, seat: 0xb8ac98, tooling: 'floral', conchos: 'gold', trim: 'gold', desc: 'Ein Sattel wie für eine Königin – mit Gold-Conchos.' });

// ---------------------------------------------------------------- Saddle pads
add('pad_tessa', { type: 'pad', name: 'Satteldecke „Tessa“', price: 0, unique: true, special: true, colors: ['#3a2112', '#2fa39b', '#d8d8d8', '#6b3f1f'], desc: 'Passend zum Tessa-Sattel: Braun, Türkis und Silber.' });
add('pad_navajo', { type: 'pad', name: 'Navajo-Decke Rot', price: 60, colors: ['#9c2a1e', '#e8d8b0', '#1e1e1e', '#d07a2a'] });
add('pad_blue', { type: 'pad', name: 'Decke Himmelblau', price: 60, colors: ['#2d5c9a', '#e6e6e6', '#1a2a4a', '#7ab0e0'] });
add('pad_green', { type: 'pad', name: 'Decke Salbeigrün', price: 60, colors: ['#5a7a4a', '#e8e0c8', '#2a3a20', '#b0a070'] });
add('pad_pink', { type: 'pad', name: 'Decke Rosa', price: 70, colors: ['#d06a8a', '#f8e8ee', '#7a2a4a', '#f0a0c0'] });
add('pad_black', { type: 'pad', name: 'Decke Schwarz-Silber', price: 90, colors: ['#151515', '#c8c8c8', '#3a3a3a', '#8a8a8a'] });
add('pad_sunset', { type: 'pad', name: 'Decke Sonnenuntergang', price: 80, colors: ['#e0702a', '#f0c040', '#7a2a5a', '#2a1a3a'] });

// ---------------------------------------------------------------- Bridles
add('bridle_tessa', { type: 'bridle', name: 'Zaumzeug „Tessa“', price: 0, unique: true, special: true, color: 0x3a2112, conchos: 'silver', plate: 'Tessa', desc: 'Mit graviertem Namensschild „Tessa“.' });
add('bridle_basic', { type: 'bridle', name: 'Zaumzeug Braun', price: 40, color: 0x6b3f1f });
add('bridle_black', { type: 'bridle', name: 'Zaumzeug Schwarz-Silber', price: 220, color: 0x141010, conchos: 'silver' });
add('bridle_red', { type: 'bridle', name: 'Zaumzeug Rot', price: 90, color: 0x8a2018 });
add('bridle_turq', { type: 'bridle', name: 'Zaumzeug Türkis', price: 120, color: 0x2a8a88, conchos: 'silver' });
add('bridle_pink', { type: 'bridle', name: 'Zaumzeug Rosa', price: 110, color: 0xc77a8e, conchos: 'silver' });

// ---------------------------------------------------------------- Breast collars
add('breast_tessa', { type: 'breast', name: 'Brustgeschirr „Tessa“', price: 0, unique: true, special: true, color: 0x3a2112, conchos: 'silver', turquoise: true });
add('breast_basic', { type: 'breast', name: 'Brustgeschirr Braun', price: 70, color: 0x6b3f1f, conchos: 'brass' });
add('breast_silver', { type: 'breast', name: 'Brustgeschirr Silber', price: 320, color: 0x141010, conchos: 'silver' });
add('breast_turq', { type: 'breast', name: 'Brustgeschirr Türkis', price: 180, color: 0x9a6a3c, conchos: 'silver', turquoise: true });

// ---------------------------------------------------------------- Leg wraps
for (const [k, n, c] of [['blue', 'Blau', 0x2d5c9a], ['red', 'Rot', 0xa02a20], ['black', 'Schwarz', 0x181818], ['pink', 'Rosa', 0xe080a8], ['turq', 'Türkis', 0x2fa39b], ['white', 'Weiß', 0xf0f0f0], ['brown', 'Braun', 0x5a3420], ['purple', 'Lila', 0x6a3a9a]]) {
  add('wraps_' + k, { type: 'wraps', name: `Gamaschen ${n}`, price: 45, color: c });
}
// ---------------------------------------------------------------- Fly masks
for (const [k, n, c] of [['beige', 'Beige', 0xd8c8a0], ['black', 'Schwarz', 0x202020], ['purple', 'Lila', 0x7a4ab0], ['turq', 'Türkis', 0x30b0a8], ['pink', 'Rosa', 0xf090b8]]) {
  add('mask_' + k, { type: 'mask', name: `Fliegenmaske ${n}`, price: 35, color: c });
}
// ---------------------------------------------------------------- Mane ribbons
for (const [k, n, c] of [['red', 'Rot', 0xd02030], ['blue', 'Blau', 0x2050d0], ['pink', 'Rosa', 0xf070b0], ['gold', 'Gold', 0xe8b830], ['turq', 'Türkis', 0x20b0a8], ['white', 'Weiß', 0xffffff], ['purple', 'Lila', 0x8040c0]]) {
  add('ribbon_' + k, { type: 'ribbon', name: `Schleifen ${n}`, price: 15, color: c });
}

// ---------------------------------------------------------------- Rider outfits
const outfit = (slot, id, name, price, color, extra = {}) => add(id, { type: 'outfit', slot, name, price, color, ...extra });
outfit('hat', 'hat_brown', 'Cowboyhut Braun', 0, 0x6b4428);
outfit('hat', 'hat_black', 'Cowboyhut Schwarz', 120, 0x161414, { band: 0xc0c0c0 });
outfit('hat', 'hat_white', 'Cowboyhut Weiß', 150, 0xeee8dc, { band: 0x2fa39b });
outfit('hat', 'hat_tan', 'Strohhut', 60, 0xd8b878, { band: 0x8a2020 });
outfit('hat', 'hat_pink', 'Cowgirlhut Rosa', 140, 0xe48aa8, { band: 0xffffff });
outfit('hat', 'hat_none', 'Kein Hut', 0, 0);
outfit('shirt', 'shirt_plaid_red', 'Karohemd Rot', 0, 0xa83228, { plaid: 0x401010 });
outfit('shirt', 'shirt_plaid_blue', 'Karohemd Blau', 50, 0x3a5a9a, { plaid: 0x10203a });
outfit('shirt', 'shirt_white', 'Westernbluse Weiß', 70, 0xf0ece4);
outfit('shirt', 'shirt_turq', 'Bluse Türkis', 80, 0x2fa39b);
outfit('shirt', 'shirt_pink', 'Bluse Rosa', 80, 0xe890b0);
outfit('shirt', 'shirt_denim', 'Jeanshemd', 90, 0x4a6a9a);
outfit('vest', 'vest_none', 'Keine Weste', 0, 0);
outfit('vest', 'vest_leather', 'Lederweste mit Fransen', 160, 0x7a4a26, { fringe: true });
outfit('vest', 'vest_black', 'Weste Schwarz', 120, 0x1a1616);
outfit('vest', 'vest_suede', 'Wildlederweste', 140, 0xb08a5a, { fringe: true });
outfit('vest', 'vest_denim', 'Jeansweste', 100, 0x3a5a8a);
outfit('pants', 'pants_jeans', 'Jeans', 0, 0x2e4468);
outfit('pants', 'pants_black', 'Reithose Schwarz', 60, 0x1a1a1e);
outfit('pants', 'pants_beige', 'Reithose Beige', 60, 0xc8b898);
outfit('chaps', 'chaps_none', 'Keine Chaps', 0, 0);
outfit('chaps', 'chaps_brown', 'Chaps Braun', 180, 0x6b3f1f, { fringe: true });
outfit('chaps', 'chaps_black', 'Chaps Schwarz', 200, 0x141212, { fringe: true, conchos: true });
outfit('chaps', 'chaps_suede', 'Chaps Wildleder', 220, 0xb08a5a, { fringe: true });
outfit('boots', 'boots_brown', 'Stiefel Braun mit Sporen', 0, 0x4a2c18, { spurs: true });
outfit('boots', 'boots_black', 'Stiefel Schwarz mit Sporen', 140, 0x121010, { spurs: true });
outfit('boots', 'boots_red', 'Stiefel Rot verziert', 190, 0x8a2018, { spurs: true });
outfit('boots', 'boots_turq', 'Stiefel Türkis', 190, 0x2a8a88, { spurs: true });
outfit('scarf', 'scarf_red', 'Halstuch Rot', 0, 0xc0282a);
outfit('scarf', 'scarf_blue', 'Halstuch Blau', 20, 0x2a4ab0);
outfit('scarf', 'scarf_turq', 'Halstuch Türkis', 25, 0x20a8a0);
outfit('scarf', 'scarf_pink', 'Halstuch Rosa', 25, 0xe070a0);
outfit('scarf', 'scarf_yellow', 'Halstuch Gelb', 20, 0xe0b020);
outfit('scarf', 'scarf_none', 'Kein Halstuch', 0, 0);
outfit('hair', 'hair_brown', 'Haare Braun', 0, 0x4a2c18);
outfit('hair', 'hair_blonde', 'Haare Blond', 0, 0xd8b060);
outfit('hair', 'hair_black', 'Haare Schwarz', 0, 0x141010);
outfit('hair', 'hair_red', 'Haare Rot', 0, 0x9a3a18);

// ---------------------------------------------------------------- Feed & consumables
add('hay', { type: 'feed', name: 'Heu', price: 4, food: 30, bond: 1, icon: '🌾' });
add('apple', { type: 'feed', name: 'Apfel', price: 2, food: 10, bond: 3, happy: 8, icon: '🍎' });
add('carrot', { type: 'feed', name: 'Karotte', price: 2, food: 10, bond: 3, happy: 8, icon: '🥕' });
add('treat', { type: 'feed', name: 'Leckerli', price: 5, food: 4, bond: 5, happy: 14, icon: '🍬' });
add('treasure_map', { type: 'map', name: 'Schatzkarte', price: 150, icon: '🗺️', desc: 'Zeigt ein Gebiet, in dem ein Schatz vergraben ist.' });

// ---------------------------------------------------------------- Decorations (placeable)
const deco = (id, name, price, builder, icon) => add(id, { type: 'decor', name, price, builder, icon });
deco('deco_lantern', 'Laterne', 40, 'lantern', '🏮');
deco('deco_flowerpot_red', 'Blumentopf Rot', 25, 'flowerPot:0xe04050', '🌺');
deco('deco_flowerpot_yellow', 'Blumentopf Gelb', 25, 'flowerPot:0xf0c020', '🌼');
deco('deco_flowerpot_purple', 'Blumentopf Lila', 25, 'flowerPot:0x9060e0', '💐');
deco('deco_flowerbed', 'Blumenbeet', 60, 'flowerBed', '🌷');
deco('deco_barrel', 'Fass', 20, 'barrel', '🛢️');
deco('deco_haybale', 'Heuballen', 15, 'hayBale', '🌾');
deco('deco_wheel', 'Wagenrad', 30, 'wheel', '☸️');
deco('deco_chair', 'Schaukelstuhl', 90, 'rockingChair', '🪑');
deco('deco_crate', 'Holzkiste', 15, 'crate', '📦');
deco('deco_bench', 'Holzbank', 50, 'bench', '🪵');
deco('deco_cactus', 'Kaktus im Topf', 30, 'cactusPot', '🌵');
deco('deco_scarecrow', 'Vogelscheuche', 70, 'scarecrow', '🧑‍🌾');
deco('deco_signpost', 'Wegweiser', 45, 'signpost', '🪧');
deco('deco_horseshoe', 'Glücks-Hufeisen', 35, 'horseshoe', '🧲');
deco('deco_fence', 'Zaunstück (4 m)', 30, 'fence', '🚧');
deco('deco_jump', 'Sprung-Hindernis', 80, 'jumpPole', '🏇');

export const SHOP_SECTIONS = {
  store: { title: 'Gemischtwarenladen', types: ['feed', 'decor'] },
  tack: { title: 'Sattlerei', types: ['saddle', 'pad', 'bridle', 'breast', 'wraps', 'mask', 'ribbon'] },
  outfit: { title: 'Westernmode', types: ['outfit'] },
};

export const TYPE_NAMES = {
  saddle: 'Sättel', pad: 'Satteldecken', bridle: 'Zaumzeug', breast: 'Brustgeschirre', wraps: 'Gamaschen', mask: 'Fliegenmasken', ribbon: 'Mähnenschleifen',
  outfit: 'Kleidung', feed: 'Futter', decor: 'Dekoration', map: 'Karten',
};
export const SLOT_NAMES = { hat: 'Hut', shirt: 'Hemd', vest: 'Weste', pants: 'Hose', chaps: 'Chaps', boots: 'Stiefel', scarf: 'Halstuch', hair: 'Haare' };
