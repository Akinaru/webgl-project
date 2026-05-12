# Recuperation Shaders

Shaders specifiques a la scene de recuperation.

## Sous-dossiers

- `CascadeSlope/`: pente/cascade.
- `CascadeTubes/`: eau dans les tubes/cascades.
- `Water/`: gradients et visibilite de l'eau.

## Intention

Ces shaders servent surtout a rendre lisible la progression du flux d'eau dans le puzzle.

## Idee generale de la famille visuelle

La scene utilise trois variantes proches d'un meme langage graphique:

- un rendu de cascade pour les pentes,
- un rendu de cascade enroule autour de sections tubulaires,
- un rendu de plan d'eau plus statique, mais avec la meme palette et une mousse coherente.

Le but n'est pas le realisme physique.
Le but est la lisibilite:

- ou passe l'eau,
- ou la mousse ressort,
- comment differencier corps d'eau, mousse profonde et mousse de surface.

## Conseils de lecture

- lire d'abord les README de sous-dossiers,
- regarder les uniforms exposes par le JS,
- puis seulement plonger dans les fonctions de bruit et les masques binaires.
