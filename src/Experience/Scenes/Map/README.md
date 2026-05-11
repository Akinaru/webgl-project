# Map

La map joue le role de scene hub.

## Composition

- `MapScene.js`: enveloppe de scene.
- `World/`: logique locale reelle de la map.

## Ce qui se passe ici

- chargement du decor principal,
- instanciation du joueur FPS,
- environnement lumineux,
- eau, vegetation, nuages,
- teleport vers les autres scenes,
- interactions de surface (eau, buissons, pas).

## Pourquoi lire cette scene

Si tu veux comprendre l'architecture de reference du projet, c'est le meilleur exemple complet:

- elle compose beaucoup de systemes,
- elle consomme le manifest global,
- elle montre comment brancher Bloom, le joueur, le son et le debug.
