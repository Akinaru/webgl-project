# Bloom

Projet Vite + Three.js construit autour d'une architecture `Experience`.

## Demarrage

```bash
npm install
npm run dev
```

Build de production:

```bash
npm run build
```

## Philosophie d'architecture

- `src/script.js` reste un bootstrap tres fin.
- `src/Experience/Experience.js` orchestre tout le runtime.
- `SceneManager` commute les scenes.
- Chaque scene compose un `World` local.
- Les systemes transverses vivent dans des domaines dedies: `Inputs`, `Dialogues`, `Audio`, `Utils`, `Common`, `Metiers`.
- Les assets sont declares dans un manifest central dans `src/Experience/Source`.

## Points d'entree a lire en premier

1. `src/script.js`: gate device + creation du canvas runtime.
2. `src/Experience/Experience.js`: composition root du projet.
3. `src/Experience/Scenes/SceneManager.js`: choix et cycle de vie des scenes.
4. `src/Experience/Scenes/*/World/*.js`: logique locale de chaque scene.

## Runtime en resume

1. Le navigateur charge `index.html` puis `src/script.js`.
2. Le bootstrap bloque mobile/touch et cree `new Experience(canvas)`.
3. `Experience` instancie inputs, debug, ressources, son, camera, renderer, scenes, UI et dialogues.
4. `Menu` lance le chargement et libere l'entree dans l'experience.
5. `SceneManager` active une scene (`map`, `recuperation`, `distribution`).
6. Le `World` courant met a jour ses systemes a chaque tick.

## Scenes actuelles

- `Map`: hub principal, vegetation, eau, teleports et rails de Bloom.
- `SceneRecuperation`: puzzle de materiaux, television 3D, eau stylisee et tubes rotatifs.
- `SceneDistribution`: puzzle de vannes, remplissage de tubes et sequence de resultat.

Chaque scene suit le meme schema:

- une classe de scene tres fine,
- un `World` qui compose les sous-systemes,
- des modules specialises pour la logique 3D, le gameplay local et le debug.

## Debug utile

- `#debug`: panneau Tweakpane complet.
- `#stats`: statistiques runtime/rendu.
- `#inspector`: contexte pour l'inspecteur Three.js quand disponible.

Exemple:

`http://localhost:5173/#debug`

## Ce que contient le depot

- `src/`: code applicatif.
- `public/`: assets bruts servis tels quels.
- `tools/`: plugins et scripts de dev.
- `folio-2025/`: reference locale d'architecture/inspiration, hors runtime principal.
- `dist/`: sortie de build.
