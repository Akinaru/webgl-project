# Shaders Common

Helpers partages pour les shaders de la map.

## Fichiers

- `applyStandardMaterialPatch.js`: injecte des chunks dans des materials standards Three.js.
- `parseShaderSections.js`: extrait les sections balisees d'un fichier GLSL.

## Role

La map n'utilise pas uniquement des `ShaderMaterial` faits maison.
Une grande partie des effets est appliquee en patchant des materials GLTF standards deja produits par Blender.

Ce dossier est donc la "boite a outils" qui permet de:

- garder les avantages des `MeshStandardMaterial`,
- injecter juste ce qu'il faut de GLSL metier,
- eviter de reecrire a la main tout le pipeline d'eclairage Three.js.

## Quand l'utiliser

Avant d'ajouter un nouveau helper shader, verifier d'abord si le besoin peut etre absorbe ici pour garder une API de patch unique.

## A retenir en lecture

Quand un shader de la map semble "sortir de nulle part", il faut souvent regarder:

1. le fichier GLSL,
2. le fichier `*ShaderChunks.js`,
3. puis `applyStandardMaterialPatch.js` qui montre a quel endroit du shader Three.js l'injection se fait.
