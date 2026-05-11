# Source

Manifest central des ressources runtime.

## Fichiers

- `sources.js`: aggregation generale.
- `sources.audio.js`: buffers audio precharges.
- `sources.models.js`: GLTF de Bloom et des scenes.
- `sources.textures.js`: textures chargees au demarrage.

## Pourquoi ce dossier est important

`Resources` ne devine rien.
Tout asset charge par la couche de ressources doit etre declare ici avec:

- un `name` stable,
- un `type`,
- un `path` public.

## Flux

1. `Experience` instancie `Resources` avec `sources.js`.
2. `Menu` declenche `startLoading()`.
3. Les systems lisent ensuite les items precharges via `resources.items`.
