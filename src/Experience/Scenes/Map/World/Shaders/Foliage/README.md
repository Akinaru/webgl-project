# Shaders Foliage

Animation de vegetation pour la map.

## Contenu

- `wind.vertex.glsl`: deformation animee.
- `windShaderChunks.js`: chunks injectes dans les materials concernes.

## Role

L'effet reste centre sur le mouvement visuel des feuillages, sans melanger collision ou logique gameplay.

## Comment raisonner sur cet effet

Le feuillage ne change pas de gameplay.
Il change seulement sa silhouette dans le vertex shader pour donner une sensation de vent.

Le bon schema mental est donc:

- le JS choisit quels meshes recoivent l'effet,
- le vertex shader deplace legerement les sommets,
- le reste du material Three.js continue a gerer la lumiere normalement.
