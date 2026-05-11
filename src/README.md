# src

Ce dossier contient tout le code charge par Vite.

## Structure

- `script.js`: bootstrap minimal du navigateur.
- `style.css`: styles globaux de l'experience et des overlays HTML.
- `Experience/`: coeur applicatif, organise par domaines.

## Flux de demarrage

1. `script.js` verifie l'environnement desktop.
2. Il recupere `canvas.webgl`.
3. Il cree `new Experience(canvas)`.
4. Toute la suite du runtime se passe dans `Experience/`.

## Regle importante

La logique metier ne doit pas revenir ici.
Si une fonctionnalite devient plus riche qu'un simple bootstrap ou du style global, elle doit vivre dans `Experience/`.
