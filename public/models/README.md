# public/models

Modeles 3D bruts du projet.

## Organisation

- `UI/`: modeles lies a l'interface 3D.
- `bloom/`: personnage/compagnon.
- `scenes/`: decors des scenes jouables.

## Regle de branchement

Un nouveau GLTF ajoute ici doit ensuite etre reference dans `src/Experience/Source/sources.models.js` s'il doit etre precharge par `Resources`.
