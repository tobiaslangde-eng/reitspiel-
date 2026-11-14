# Fremde Inhalte

## Pferdemodell (`horse.glb`)

This work is based on "HORSE - Realistic 3D Model (DEMO FREE)"
(https://sketchfab.com/3d-models/horse-realistic-3d-model-demo-free-65d6a70a6721495f938c93e80a5998e4)
by WildMesh 3D (https://sketchfab.com/WildMesh_3D), licensed under CC-BY-NC-4.0
(http://creativecommons.org/licenses/by-nc/4.0/).

Lizenzbedingungen: Der Autor muss genannt werden, **keine kommerzielle Nutzung**.

Änderungen gegenüber dem Original: ins GLB-Format umgewandelt, Texturen auf 1024 px verkleinert und als WebP gespeichert,
Geometrie komprimiert, Gelenke ohne Hautgewichte entfernt. Fellfarben und Abzeichen werden im Spiel per Shader erzeugt;
Trab, Galopp, Sprung und Sliding Stop werden im Spiel auf das Skelett gerechnet (das Modell bringt nur Stehen und Schritt mit).

## Bäume und Texturen (`tex/`)

- Baumgeometrie: erzeugt mit **ez-tree** von Daniel Greenheck (https://github.com/dgreenheck/ez-tree), MIT-Lizenz.
- `bark_*.webp`, `leaf_*.webp`, `dirt.webp`: aus dem ez-tree-Paket (MIT), verkleinert. Ursprüngliche Quellen der Rinden laut
  Paket: texturecan.com (Birke, Kiefer) und polyhaven.com (Eiche, CC0).
- `grass.webp`, `waternormal.webp`: aus den Beispielen von three.js (https://github.com/mrdoob/three.js, MIT), verkleinert.
