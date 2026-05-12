# Shaders Water

Shaders d'eau utilises dans la scene Recuperation.

## Contenu

- `visibleGradient.vertex.glsl`
- `visibleGradient.fragment.glsl`
- `visibleGradientShaderChunks.js`

## Role

Appliquer un gradient de visibilite/couleur pour aider a lire l'etat du flux.

## Ce que fait vraiment ce shader aujourd'hui

Le nom historique `visibleGradient` est un peu reducteur.
Le shader sert maintenant de plan d'eau stylise pour la scene Recuperation.

Il porte:

- la couleur principale de l'eau,
- une mousse profonde,
- une mousse de surface,
- un motif anime par le bruit mais sans mouvement de flux directionnel fort.

## Difference avec les pentes et les tubes

- les pentes et les tubes donnent l'impression d'un ecoulement,
- le plan d'eau reste globalement statique,
- mais le motif de mousse reste de la meme famille visuelle pour garder l'unite de scene.

## Point technique important

Le shader utilise la position monde pour aider plusieurs plans d'eau a partager un repere de motif coherent.
Cela evite que chaque mesh reparte d'un motif totalement different.
