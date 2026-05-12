# Recuperation World

World local de la scene de recuperation.

## Fichier pivot

- `World.js`: compose tous les sous-systemes et gere la progression de la scene.

## Sous-systemes

- `Model.js`: acces au decor et aux groupes utiles.
- `Water.js`: eau locale.
- `CascadeTubes.js`: rendu/animation des cascades.
- `TubeWaterController.js`: puzzle de rotation et de flux dans les tubes.
- `Materiau.js`: selection de materiaux interactifs.
- `Television.js`: interface 3D pour lancer/valider les tests.
- `Door.js`: verrou de progression.
- `ShowerParticles.js`: retour visuel du test.
- `WindTurbine.js`: element interactif/visuel de scene.
- `Scoring.js`: lecture synthese de l'etat du puzzle de tubes.
- `Room2Trigger.js`: trigger de progression/dialogue local.
- `CollisionDebug.js` et `*.debug.js`: lecture debug.

## Logique de haut niveau

1. Le joueur entre dans la scene.
2. Un dialogue de scene peut se lancer.
3. Le joueur choisit un materiau.
4. La television lance un test.
5. Le resultat peut valider un choix.
6. La porte et le retour a la map s'ouvrent selon l'etat du puzzle.

## Comment les sous-systemes collaborent

- `SceneRecuperationWorld` possede l'etat global de la scene.
- `SceneRecuperationModel` expose les meshes utiles sans imposer de logique de gameplay.
- `Materiau` gere la selection du materiau vise par le joueur.
- `Television` sert d'interface 3D pour lancer ou valider les etapes.
- `SceneRecuperationTubeWaterController` et `SceneRecuperationScoring` traduisent la rotation des tubes en etat lisible.
- les modules d'eau partagent une palette commune et des sous-menus debug separes.

## Particularite technique

Cette scene contient davantage d'UI "dans le monde 3D" que les autres:

- boutons meshes cliquables,
- ecran TV rendu via canvas texture,
- tubes et fenetres d'eau pilotes par shader/runtime.

## Debug a connaitre

Le dossier `Scene recuperation` dans Tweakpane regroupe les reglages utiles pour lire et ajuster la scene.
On y trouve notamment:

- un groupe `Eau`,
- des sous-dossiers `Couleurs`, `Tuyaux`, `Pentes`, `Plan`,
- les reglages du puzzle et des objets interactifs de scene.

Si un rendu d'eau te parait incoherent, commence ici avant de toucher au GLSL.
