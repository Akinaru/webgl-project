# Common

Ce dossier regroupe les systemes 3D reutilisables entre plusieurs scenes.

## Contenu

- `Player.js`: controle FPS, gravite, collisions et camera.
- `Bloom.js`: personnage/compagnon runtime.
- `BloomRailSystem.js`: deplacement de Bloom sur un graphe de rails.
- `CollisionDebug.js`: visualisation des collisions.
- `Bloom.constants.js`: constantes de configuration partagees.

## Role

On place ici ce qui n'appartient pas a une scene unique mais reste lie au runtime 3D.
Cela evite de dupliquer la meme logique dans `Map`, `Recuperation` et `Distribution`.

## Exemple

Le joueur FPS est consomme par plusieurs worlds.
Chaque world lui fournit ses propres maillages de collision, son point de spawn et ses limites, mais la logique de mouvement reste unique ici.
