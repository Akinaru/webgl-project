# Shaders Map

Shaders specifiques a la map.

## Sous-dossiers

- `Common/`: helpers de patch Three.js et parsing de sections GLSL.
- `Terrain/`: teinte/lecture du relief autour de la ligne d'eau.
- `Water/`: masque du plan d'eau.
- `Clouds/`: nuages proceduraux.
- `Foliage/`: animation de vegetation.
- `Grass/`: reserve pour extensions futures.

## Convention locale

Un effet metier doit rester decoupe ainsi:

- un `*.vertex.glsl`,
- un `*.fragment.glsl`,
- un petit fichier JS qui mappe les chunks si l'injection est necessaire.

## Sections GLSL attendues

- `// @header`
- `// @project` cote vertex
- `// @diffuse` cote fragment

## Frontiere de responsabilite

Le gros du code metier doit rester hors des strings GLSL.
Le JS prepare le contexte, et les GLSL se concentrent sur la transformation/presentation graphique.
