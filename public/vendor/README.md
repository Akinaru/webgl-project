# public/vendor

Copies statiques de bibliotheques tierces.

## Contenu actuel

- `three/` et quelques modules `examples/jsm`.

## A savoir

Le projet utilise deja `three` via `node_modules`.
Ce dossier existe surtout pour des usages annexes, pages expertes, essais ou compatibilites locales.

## Regle de prudence

Avant d'ajouter une dependance vendor ici, verifier si le besoin ne doit pas plutot passer par le bundling Vite standard.
