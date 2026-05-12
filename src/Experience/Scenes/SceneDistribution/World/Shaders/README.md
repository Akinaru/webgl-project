# Distribution Shaders

Shaders ou patches visuels specifiques a la scene de distribution.

## Etat actuel

La scene s'appuie surtout sur des patches materials appliques depuis ``.

Autrement dit, une partie importante de l'effet visuel est encore pilotee depuis le controller runtime plutot que depuis une famille GLSL tres decoupee comme dans `Map` ou `SceneRecuperation`.

## Comment lire cette zone

Si tu veux comprendre l'eau de distribution aujourd'hui, commence par:

1. ``,
2. ses fichiers `*.constants.js` et `*.debug.js`,
3. puis seulement les helpers GLSL s'il y en a dans ce dossier.

## Sous-dossier

- `Citerne/`: emplacement reserve pour des effets shaders de citerne ou de liquide plus complexes.
