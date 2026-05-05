# Menu

Ce dossier porte les couches UI de demarrage et de pause.

## Ce que gere ce domaine

- l'ecran de boot,
- le bouton de lancement,
- la preference audio,
- le chargement utilisateur,
- la prise de focus et le pointer lock,
- le menu pause en cours de jeu.

## Fichiers

- `Menu.js`: flow d'entree dans l'experience.
- `PauseMenu.js`: overlay de pause et d'options runtime.

## Place dans le cycle de vie

`Experience` cree `Menu`, puis appelle `menu.start()`.
Le menu peut lancer le chargement des ressources, debloquer l'audio, et autoriser l'entree joueur dans la scene.

## Frontiere de responsabilite

Le menu pilote l'UX de boot, pas la logique metier des scenes.
Quand une action doit modifier le jeu, il delegue aux services de `Experience`.
