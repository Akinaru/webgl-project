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

## Ordre de lecture recommande

Pour une lecture progressive du projet:

1. lire `src/README.md` pour la carte generale,
2. ouvrir `src/Experience/README.md` pour comprendre qui cree quoi,
3. choisir une scene et lire son `README.md`,
4. seulement ensuite descendre dans les classes `World/*`,
5. consulter les README shaders pour les effets visuels les plus techniques.

Les README de dossier couvrent principalement:

- le role de chaque dossier,
- le vocabulaire metier employe,
- le flux de donnees principal,
- les bons points d'entree pour debugger ou faire evoluer une feature.

## Navigation conseillee

- `src/README.md`: vue d'ensemble du code applicatif.
- `src/Experience/README.md`: lecture du runtime central.
- `src/Experience/Scenes/README.md`: organisation des scenes.
- `public/README.md`: organisation des assets servis par Vite.
- `tools/README.md`: outillage local du projet.

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

## Documentation du depot

Les dossiers importants du runtime disposent d'un `README.md` qui decrit:

- pourquoi le dossier existe,
- quelles classes il heberge,
- comment elles collaborent,
- ou brancher une nouvelle feature sans casser l'architecture.

Les zones plus techniques sont documentees a deux niveaux:

- un `README.md` de dossier pour la vue d'ensemble,
- quelques commentaires directement dans le code ou dans les shaders pour guider la lecture ligne par ligne.
