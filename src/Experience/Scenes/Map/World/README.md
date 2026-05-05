# Map World

Le monde de la map compose la plupart des systemes visuels et interactifs du hub principal.

## Fichier pivot

- `MapWorld.js`: compose les sous-systemes, gere l'update et les triggers de scene.

## Sous-systemes

- `MapModel.js`: charge le GLTF, prepare collisions, instancing et patches shaders.
- `MapEnvironment.js`: environnement global.
- `MapLight.js`: lumiere liee au focus joueur.
- `Water.js`: logique d'eau locale.
- `Bushes.js` et `Foliage.js`: vegetation et interactions associees.
- `CloudLayer.js`: nuages proceduraux.
- `MapCollisionDebug.js` et `MapVisibilityDebug.js`: outils de lecture runtime.
- `MapWorld.constants.js`: constantes de gameplay/audio/teleport.

## Responsabilites runtime

- creer le joueur avec les collisions de la map,
- synchroniser Bloom avec les rails de `bloomRails.json`,
- jouer les sons de pas, d'eau et de buisson,
- detecter les zones de teleport vers les scenes secondaires.

## Point technique important

`MapModel.js` fait plus qu'un simple "load model":

- il clone la scene GLTF,
- identifie les maillages utiles,
- applique les patches shaders,
- transforme certains objets repetes en `InstancedMesh`,
- reconstruit les volumes de collision.
