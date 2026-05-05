# Shaders Common

Helpers partages pour les shaders de la map.

## Fichiers

- `applyStandardMaterialPatch.js`: injecte des chunks dans des materials standards Three.js.
- `parseShaderSections.js`: extrait les sections balisees d'un fichier GLSL.

## Quand l'utiliser

Avant d'ajouter un nouveau helper shader, verifier d'abord si le besoin peut etre absorbe ici pour garder une API de patch unique.
