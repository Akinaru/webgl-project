# Distribution World

World local du puzzle de distribution.

## Fichiers clefs

- `SceneDistributionWorld.js`: composition generale.
- `SceneDistributionModel.js`: acces au GLTF et extraction des maillages utiles.
- `SceneDistributionValveController.js`: interaction joueur avec les vannes.
- `SceneDistributionTubeWaterController.js`: propagation visuelle de l'eau dans les tubes.
- `SceneDistributionBalanceMonitor.js`: verifie l'etat de resolution du puzzle.
- `SceneDistributionGaugeDisplay.js`: retour visuel de mesure.
- `SceneDistributionDoorController.js`: ouverture/fermeture des portes de sortie.
- `SceneDistributionResultTrigger.js` et `SceneDistributionResultDisplay.js`: declenchement et affichage de la sequence finale.
- `*.constants.js`: parametres et tokens nommes.
- `*.debug.js`: outils Tweakpane du domaine.

## Lecture du systeme

1. Le model expose les meshes des vannes, tubes et collisions.
2. Le joueur FPS se deplace dans la scene.
3. `ValveController` detecte la vanne visee et traduit le geste souris en rotation.
4. `TubeWaterController` lit l'etat des vannes et met a jour le remplissage shader des tubes.
5. `BalanceMonitor` decide si la configuration actuelle est correcte.
6. Les portes et l'affichage de resultat reagissent a cet etat.

## Frontieres

- interaction physique/visuelle des vannes ici,
- pas de gestion globale de scene ou de resources ici,
- les assets restent declares dans `Source/`.

## Point important pour comprendre vite

Le puzzle ne cherche pas a simuler une vraie hydraulique.
Il transforme des gestes du joueur en un etat de systeme suffisamment lisible pour:

- afficher le bon niveau de remplissage,
- contraindre certaines rotations,
- decider si la scene est resolue.
