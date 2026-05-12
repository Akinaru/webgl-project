# Utils

Primitives transverses du runtime.

## Fichiers clefs

- `EventEmitter.js`: bus d'evenements simple.
- `Time.js`: ticker et delta/elapsed.
- `Sizes.js`: dimensions et pixel ratio.
- `Resources.js`: chargeur central d'assets.
- `Debug.js`: panneau debug Tweakpane et stats.
- `Tutoriel.js`: sequence tutoriel runtime.
- `CenterScreenRaycaster.js`: raycast centre ecran pour interactions FPS.
- `SpatialBoxOctree.js`: acceleration structure pour collisions.

## Comment lire ce dossier

Les classes de `Utils/` ont en general 2 proprietes:

- elles ne portent pas de logique metier de scene,
- elles sont reutilisables sans connaitre le puzzle ou le decor courant.

Si un module commence a connaitre des noms de meshes, des objectifs de puzzle ou des dialogues, c'est en general le signe qu'il doit sortir de `Utils/`.

## Role architectural

Ce dossier heberge les briques generiques reutilisables par plusieurs domaines.
Si une classe depend surtout d'un gameplay ou d'une scene concrete, elle ne doit pas etre placee ici.

## Fichiers a lire en priorite

- `Resources.js`: chargement et disponibilite des assets.
- `Debug.js`: panneau debug, bindings et export de presets.
- `Time.js`: ticker, delta et temps ecoule.
- `EventEmitter.js`: souscription et emission d'evenements.
