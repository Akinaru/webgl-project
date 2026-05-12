# Scene Recuperation

Scene de puzzle centree sur l'eau, les materiaux et un circuit de tubes rotatifs.

## Composition

- `SceneRecuperationScene.js`: enveloppe de scene.
- `World/`: logique locale complete.

## Idee de gameplay

Le joueur choisit un materiau, lance un test via la television, manipule la circulation d'eau, puis debloque la progression de la scene.

## Ce qui rend cette scene particuliere

Par rapport aux autres scenes, celle-ci melange plusieurs couches en meme temps:

- un mini puzzle de selection/validation de materiau,
- une interface integree directement dans le decor 3D,
- plusieurs rendus d'eau stylises,
- un circuit de tubes rotatifs qui sert a la lisibilite du puzzle.

## Questions auxquelles cette scene repond

- comment l'etat d'un puzzle ouvre une porte,
- comment piloter des boutons 3D cliquables,
- comment partager une palette d'eau entre plusieurs shaders,
- comment garder un debug tres riche sans tout melanger dans un seul fichier.
