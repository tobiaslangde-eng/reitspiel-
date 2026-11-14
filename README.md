# Silbertal Ranch – Open-World-Reitspiel

Ein 3D-Reitspiel im Browser (Three.js): offene Welt mit Ranch, Kleinstadt, Turnierplatz, Rennbahn, See und Geländestrecke –
Third-Person-Kamera, Radar-Minimap, Tag-/Nacht-Wechsel.

**Spielen:** `index.html` im Browser öffnen (alles ist in dieser einen Datei enthalten, auch das Pferdemodell).

**Pferdemodell:** „HORSE – Realistic 3D Model (Demo Free)“ von WildMesh 3D, CC BY-NC 4.0 – Namensnennung nötig,
keine kommerzielle Nutzung. Details in `assets/CREDITS.md`.

## Inhalt

- **Pferde mit realistischer Bewegung** – Schritt (Viertakt), Trab (Zweitakt), Galopp (Dreitakt) und Renngalopp mit passender
  Fußfolge, Trägheit, tempoabhängigem Wendekreis, Ausdauer, Sprungflugbahn, Sliding Stop, Spins und Rückwärtsrichten.
- **33 Rassen** – vom Quarter Horse über Araber, Vollblüter, Warmblüter, Barockpferde und Ponys bis zum Shire Horse,
  jeweils mit eigenem Körperbau und eigenen Stärken.
- **Zucht mit Farbgenetik** – Extension, Agouti, Cream, Dun, Schimmel, Roan, Tobiano, Tigerscheckung, Flaxen;
  Leistungsanlagen und Exterieur werden vererbt. Deckhengste gegen Decktaxe oder eigene Hengste.
- **Fohlen wachsen auf** – vom langbeinigen Fohlen über das Jungpferd zum reitbaren Pferd (mit 3 Jahren).
  Schimmel werden dunkel geboren und mit den Jahren weiß.
- **Editoren** – eigenes Pferd (Rasse, Farbe, Zeichnung, Abzeichen, Mähne, Größe, Kaliber) und eigene Spielfigur
  (Statur, Haut, Frisur, Kleidung für Western und Englisch).
- **Western und Englisch** – Westernsattel mit Horn und Cowboyhut oder englischer Sattel mit Helm und Turnierjacket.
- **Sieben Turnierdisziplinen in fünf Klassen (E–S)** – Barrel Race, Pole Bending, Reining, Springreiten, Dressur,
  Galopprennen und Geländeritt.
- **Ranch-Alltag** – füttern, striegeln, trainieren, Pferdemarkt, Preisgelder, automatisches Speichern im Browser.

## Steuerung

| Im Sattel | |
|---|---|
| `W` / `S` | Gangart höher / niedriger |
| `A` `D` | Lenken, im Stand wenden (Spins) |
| `Shift` | Treiben (Sprint im Renngalopp) |
| `Leertaste` | Springen |
| `X` | Durchparieren zum Halt (Western: Sliding Stop) |
| `S` halten (im Stand) | Rückwärtsrichten |
| `E` | Absteigen / Aktion |

| Zu Fuß & allgemein | |
|---|---|
| `W A S D`, `Shift` | Laufen, rennen |
| `E` | Aufsteigen / Aktion |
| `H` | Pferd herbeipfeifen |
| Maus, Mausrad | Kamera, Zoom |
| `Tab` / `M` | Handy: Karte, Schnellreise, Einstellungen |

Auf Touch-Geräten: links Joystick, rechts wischen für die Kamera, Tasten am rechten Rand.

## Entwicklung

```
npm install
npm run build   # bündelt src/ zu index.html
```

Der Quellcode liegt in `src/` (Welt, Pferdemodell, Genetik, Turniere, Menüs).
Zum Testen lässt sich die Grafikqualität per `index.html?q=0` (niedrig) oder `?q=1` (hoch) erzwingen.
