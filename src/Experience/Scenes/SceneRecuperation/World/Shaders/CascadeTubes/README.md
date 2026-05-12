# Shaders CascadeTubes

Shaders des tubes de cascade de la scene Recuperation.

## Contenu

- `cascadeTube.vertex.glsl`
- `cascadeTube.fragment.glsl`
- `cascadeTubeShaderChunks.js`

## Role

Supporter les effets de progression et de lecture visuelle du flux dans les sections tubulaires.

## Difference avec `CascadeSlope`

Le coeur du motif est tres proche de la pente, mais la projection change:

- sur une pente, on projette dans le plan local de la surface,
- sur un tube, on reconstruit un angle autour de l'axe pour faire tourner le pattern sans couture visible.

## Lecture mentale

Si tu modifies ce shader, pense-le comme:

- "la meme mousse que la pente",
- appliquee a une geometrie cylindrique,
- avec une gestion particuliere de la couture UV.
