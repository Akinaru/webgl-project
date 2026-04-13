# bloom

Exemple concret d'architecture modulaire:

- `Experience` (classe centrale + singleton)
- `Utils` (`Sizes`, `Time`, `EventEmitter`, `Resources`, `Debug`)
- `Camera` (camera pure, pilotee par le joueur)
- `Renderer`
- `World` (`Player`, `Floor`, `Fox`, `Environment`)
- `InputController` (gestion clavier centralisee)

## Lancer le projet

```bash
npm install
npm run dev
```

## Debug UI

Ajoute `#debug` a l'URL pour afficher `lil-gui`.

Exemple:

`http://localhost:5173/#debug`

## Controles FPS

- Clique dans le canvas pour entrer en mode premiere personne (pointer lock).
- `ZQSD` ou `WASD` pour se deplacer.
- `Shift` pour sprinter.
- `Space` pour sauter.
- `Esc` pour sortir du mode FPS.

## Ajouter les assets du tuto

Le projet fonctionne deja sans assets, mais tu peux brancher les assets du tuto en:

1. Ajoutant les fichiers dans `public/textures` et `public/models`.
2. Decommentant les sources dans `src/Experience/sources.js`.

La logique de chargement centralise (`Resources`) et de demarrage conditionnel (`World` apres `ready`) est deja en place.
