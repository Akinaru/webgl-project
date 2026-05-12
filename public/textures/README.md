# public/textures

Textures brutes du runtime 3D.

## Sous-dossiers

- `foliage/`: textures de vegetation.
- `water/`: textures et variations liees a l'eau.
- `wall/`: textures de matiere ou de detail pour les murs et surfaces du decor.

## Regle

Comme pour les modeles et sons, toute texture qui doit etre chargee via la couche `Resources` doit aussi etre declaree dans `src/Experience/Source/sources.textures.js`.

## Exemple de lecture

Une texture dans `public/textures/` peut avoir plusieurs usages differents:

- texture visible directement dans un shader,
- masque ou data texture,
- simple detail map appliquee a un material standard,
- support de bump/noise pour enrichir une surface.

Autrement dit, le nom du dossier t'indique souvent le domaine visuel, pas uniquement la technique exacte.
