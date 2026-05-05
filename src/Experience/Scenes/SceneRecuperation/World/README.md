# Recuperation World

World local de la scene de recuperation.

## Fichier pivot

- `SceneRecuperationWorld.js`: compose tous les sous-systemes et gere la progression de la scene.

## Sous-systemes

- `SceneRecuperationModel.js`: acces au decor et aux groupes utiles.
- `SceneRecuperationWater.js`: eau locale.
- `SceneRecuperationCascadeTubes.js`: rendu/animation des cascades.
- `SceneRecuperationTubeWaterController.js`: puzzle de rotation et de flux dans les tubes.
- `Materiau.js`: selection de materiaux interactifs.
- `Television.js`: interface 3D pour lancer/valider les tests.
- `Door.js`: verrou de progression.
- `ShowerParticles.js`: retour visuel du test.
- `SceneRecuperationWindTurbine.js`: element interactif/visuel de scene.
- `SceneRecuperationCollisionDebug.js` et `*.debug.js`: lecture debug.

## Logique de haut niveau

1. Le joueur entre dans la scene.
2. Un dialogue de scene peut se lancer.
3. Le joueur choisit un materiau.
4. La television lance un test.
5. Le resultat peut valider un choix.
6. La porte et le retour a la map s'ouvrent selon l'etat du puzzle.

## Particularite technique

Cette scene contient davantage d'UI "dans le monde 3D" que les autres:

- boutons meshes cliquables,
- ecran TV rendu via canvas texture,
- tubes et fenetres d'eau pilotes par shader/runtime.
