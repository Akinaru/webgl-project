# tools/vite

Extensions Vite locales au projet.

## Fichier present

- `railsEditorPlugin.js`

## Role du plugin

Ce plugin ajoute une couche d'edition/sanitation autour de `src/Experience/Scenes/Map/World/bloomRails.json`.
Il aide a convertir/sauvegarder les rails de Bloom dans un format de graphe stable.

## Pourquoi ce dossier est hors `src/`

Parce qu'il concerne l'outillage du serveur de dev et du build, pas le runtime de l'experience elle-meme.
