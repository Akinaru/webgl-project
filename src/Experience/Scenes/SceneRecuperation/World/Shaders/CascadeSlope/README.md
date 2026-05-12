# Shaders CascadeSlope

Shaders du plan incline/cascade de la scene Recuperation.

## Contenu

- `cascadeSlope.vertex.glsl`
- `cascadeSlope.fragment.glsl`
- `cascadeSlopeShaderChunks.js`

## Role visuel

Ce shader habille les pentes d'eau qui relient les differents points du puzzle.
Il donne l'impression d'un flux qui "descend" avec:

- une couleur de corps d'eau,
- une mousse nette,
- un pattern anime aligne sur la pente.

## Comment il fonctionne

1. le JS envoie l'orientation du flux et les reglages de mousse,
2. le shader projette la pente dans un repere 2D local,
3. un bruit anime cree des ruptures de mousse,
4. un masque binaire decide si on affiche l'eau seule ou la mousse.

## A retenir

Le rendu est volontairement tranche.
La mousse n'est pas peinte comme un flou doux, mais comme un motif lisible, proche d'une stylisation "waterfall".
