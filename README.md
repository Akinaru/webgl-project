# bloom

Exemple concret d'architecture modulaire:

- `Experience` (classe centrale + singleton)
- `Utils` (`Sizes`, `Time`, `EventEmitter`, `Resources`, `Debug`)
- `Camera`
- `Renderer`
- `World` (`Floor`, `Fox`, `Environment`)

## Lancer le projet

```bash
npm install
npm run dev
```

## Debug UI

Ajoute `#debug` a l'URL pour afficher `lil-gui`.

Exemple:

`http://localhost:5173/#debug`

## Ajouter les assets du tuto

Le projet fonctionne deja sans assets, mais tu peux brancher les assets du tuto en:

1. Ajoutant les fichiers dans `public/textures` et `public/models`.
2. Decommentant les sources dans `src/Experience/sources.js`.

La logique de chargement centralise (`Resources`) et de demarrage conditionnel (`World` apres `ready`) est deja en place.
