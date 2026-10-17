const A = (id, icon, name, desc, check) => ({ id, icon, name, desc, check });

export const ACHIEVEMENTS = [
  A('first_ride', '🐴', 'In den Sattel!', 'Steige zum ersten Mal auf dein Pferd.', (g, ev) => ev === 'mount'),
  A('gallop', '💨', 'Wind in der Mähne', 'Reite im Renngalopp.', (g) => g.state.stats.maxSpeed > 10),
  A('dist10', '🗺️', 'Langer Ritt', 'Reite insgesamt 10 Kilometer.', (g) => g.state.stats.distance > 10000),
  A('dist50', '🌎', 'Pony Express', 'Reite insgesamt 50 Kilometer.', (g) => g.state.stats.distance > 50000),
  A('jump1', '🦘', 'Abgehoben', 'Springe über ein Hindernis.', (g) => g.state.stats.jumps >= 1),
  A('jump50', '🏇', 'Springreiterin', 'Springe 50 Mal.', (g) => g.state.stats.jumps >= 50),
  A('slide', '🛑', 'Sliding Stop', 'Zeige einen Sliding Stop über 5 Meter.', (g, ev, d) => ev === 'slide' && d > 5),
  A('spin', '🌀', 'Wirbelwind', 'Drehe 4 Spins am Stück.', (g, ev, d) => ev === 'spin' && d >= 4),
  A('whistle', '🎶', 'Komm her!', 'Rufe dein Pferd mit einem Pfiff.', (g) => g.state.stats.whistles >= 1),
  A('bond3', '💞', 'Beste Freunde', 'Erreiche Bindungsstufe „Freunde“.', (g) => g.horses.some((h) => h.data.bond >= 40)),
  A('bond5', '💖', 'Seelenverwandt', 'Erreiche die höchste Bindungsstufe.', (g) => g.horses.some((h) => h.data.bond >= 80)),
  A('groom', '🪮', 'Blitzblank', 'Putze dein Pferd vollständig.', (g, ev, d) => ev === 'care' && d === 'brush'),
  A('braid', '🎀', 'Flechtkünstlerin', 'Flechte die Mähne deines Pferdes.', (g, ev, d) => ev === 'care' && d === 'braid'),
  A('horses3', '🐎', 'Kleine Herde', 'Besitze 3 Pferde.', (g) => g.state.horses.length >= 3),
  A('horses6', '🏇', 'Pferdeparadies', 'Besitze 6 Pferde.', (g) => g.state.horses.length >= 6),
  A('breeds5', '📚', 'Rassenkennerin', 'Besitze Pferde von 5 verschiedenen Rassen.', (g) => new Set(g.state.horses.map((h) => h.breed)).size >= 5),
  A('tame', '🌵', 'Mustang-Flüsterin', 'Zähme ein Wildpferd.', (g) => g.state.stats.tamed >= 1),
  A('foal', '🍼', 'Familienzuwachs', 'Züchte ein Fohlen.', (g) => g.state.stats.foals >= 1),
  A('build1', '🔨', 'Bauherrin', 'Baue dein erstes Ranch-Gebäude.', (g) => Object.keys(g.state.ranch.buildings).length > 2),
  A('buildall', '🏰', 'Traumranch', 'Baue alle Ranch-Gebäude.', (g) => Object.keys(g.state.ranch.buildings).length >= 13),
  A('decor5', '🌼', 'Innenarchitektin', 'Platziere 5 Dekorationen.', (g) => g.state.ranch.decor.length >= 5),
  A('quest1', '📜', 'Hilfsbereit', 'Erledige einen Auftrag.', (g) => g.state.quests.done >= 1),
  A('quest10', '⭐', 'Heldin von Dusty Creek', 'Erledige 10 Aufträge.', (g) => g.state.quests.done >= 10),
  A('cattle', '🐄', 'Cowgirl', 'Treibe 5 Rinder in den Pferch.', (g) => g.state.stats.cattle >= 5),
  A('lasso', '🪢', 'Lassowerferin', 'Fange ein Rind mit dem Lasso.', (g, ev) => ev === 'lasso'),
  A('rodeo1', '🎗️', 'Turnierdebüt', 'Nimm an einem Rodeo teil.', (g) => g.state.stats.events >= 1),
  A('win1', '🥇', 'Siegerin', 'Gewinne ein Rodeo-Turnier.', (g) => g.state.stats.wins >= 1),
  A('winpro', '🏆', 'Rodeo-Königin', 'Gewinne ein Profi-Turnier.', (g, ev, d) => ev === 'rodeo' && d && d.place === 1 && d.tier === 2),
  A('alldisc', '🎪', 'Allrounderin', 'Belege in allen vier Disziplinen einen Podestplatz.', (g) => ['Barrel Racing', 'Pole Bending', 'Reining', 'Trail'].every((e) => g.state.trophies.some((t) => t.event === e))),
  A('treasure', '💰', 'Schatzsucherin', 'Finde einen vergrabenen Schatz.', (g) => g.state.stats.treasures >= 1),
  A('treasure5', '👑', 'Goldrausch', 'Finde 5 Schätze.', (g) => g.state.stats.treasures >= 5),
  A('discover3', '🧭', 'Entdeckerin', 'Entdecke 3 versteckte Orte.', (g) => g.state.discovered.length >= 3),
  A('discoverall', '🗺️', 'Kartografin', 'Entdecke alle versteckten Orte.', (g) => g.state.discovered.length >= 10),
  A('photo', '📷', 'Fotografin', 'Mach ein Foto im Fotomodus.', (g) => g.state.stats.photos >= 1),
  A('night', '🌙', 'Mondscheinritt', 'Reite eine Minute lang bei Nacht.', (g) => g.state.stats.nightRides > 60),
  A('storm', '⛈️', 'Sturmreiterin', 'Reite während eines Gewitters.', (g) => g.player.mode === 'ride' && g.weather.type === 'storm'),
  A('snow', '❄️', 'Winterwunderland', 'Reite durch den Schnee.', (g) => g.player.mode === 'ride' && g.weather.snowCover > 0.6 && Math.abs(g.player.horse.speed) > 2),
  A('river', '💦', 'Platsch!', 'Reite durch einen Fluss.', (g) => g.player.mode === 'ride' && g.player.horse.waterDepth > 0.5),
  A('rich', '💵', 'Reiche Rancherin', 'Besitze $10.000.', (g) => g.state.money >= 10000),
  A('shoes', '🧲', 'Gut beschlagen', 'Lass dein Pferd beim Hufschmied beschlagen.', (g, ev) => ev === 'shoes'),
  A('tessa', '✨', 'Tessas Glanzstück', 'Reite mit dem kompletten Tessa-Set (Sattel, Zaumzeug, Decke, Brustgeschirr).', (g) => {
    const h = g.player.horse; if (!h) return false; const t = h.data.tack;
    return t.saddle === 'saddle_tessa' && t.bridle === 'bridle_tessa' && t.pad === 'pad_tessa' && t.breast === 'breast_tessa';
  }),
  A('dog', '🐕', 'Treuer Begleiter', 'Streichle Buddy, den Ranch-Hund.', (g, ev) => ev === 'petDog'),
];

export class Achievements {
  constructor(game) {
    this.game = game;
    this.t = 0;
    const map = { 'horse:slidingStop': 'slide', 'horse:spin': 'spin', care: 'care', lasso: 'lasso', rodeo: 'rodeo', shoes: 'shoes', petDog: 'petDog', mount: 'mount' };
    for (const [evName, key] of Object.entries(map)) {
      game.events.on(evName, (d) => {
        let data = d;
        if (key === 'slide') data = d.ridden ? d.data.distance : 0;
        if (key === 'spin') data = d.ridden ? d.data.turns : 0;
        if (key === 'care') data = d.type;
        this.check(key, data);
      });
    }
  }

  check(ev, data) {
    const g = this.game, s = g.state;
    for (const a of ACHIEVEMENTS) {
      if (s.achievements[a.id]) continue;
      let ok = false;
      try { ok = a.check(g, ev, data); } catch { ok = false; }
      if (ok) {
        s.achievements[a.id] = s.day;
        g.ui.toast(`🏅 <b>Errungenschaft:</b> ${a.icon} ${a.name}`, 'gold');
        g.audio.fanfare();
        g.addMoney(50);
        g.events.emit('achievement', a);
      }
    }
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    this.check(null);
  }
}

