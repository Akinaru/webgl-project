# Source

Manifest central des ressources runtime.

## Fichiers

- `sources.js`: aggregation generale.
- `sources.audio.js`: buffers audio precharges.
- `sources.models.js`: GLTF de Bloom et des scenes.
- `sources.textures.js`: textures chargees au demarrage.

## Modele mental

Ce dossier ne contient pas les assets eux-memes.
Il contient uniquement leur "table des matieres" pour le runtime.

Quand un systeme a besoin d'une ressource:

1. le fichier physique vit dans `public/`,
2. le manifest l'expose sous un nom stable,
3. `Resources` le charge,
4. le systeme le recupere via `experience.resources.items.<nom>`.

## Role

`Resources` ne devine rien.
Tout asset charge par la couche de ressources doit etre declare ici avec:

- un `name` stable,
- un `type`,
- un `path` public.

## Flux

1. `Experience` instancie `Resources` avec `sources.js`.
2. `Menu` declenche `startLoading()`.
3. Les systems lisent ensuite les items precharges via `resources.items`.

## Bonnes pratiques

- choisir un `name` descriptif et stable,
- garder les paths alignes avec l'arborescence `public/`,
- preferer les noms de ressource metier (`recuperationWaterDistributionTexture`) plutot que des noms vagues (`texture1`),
- centraliser ici toute nouvelle texture ou tout nouveau GLTF utilise au runtime.
