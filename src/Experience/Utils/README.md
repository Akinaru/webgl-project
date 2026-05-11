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

## Role architectural

Ce dossier heberge les briques generiques reutilisables par plusieurs domaines.
Si une classe depend surtout d'un gameplay ou d'une scene concrete, elle ne doit pas etre placee ici.
