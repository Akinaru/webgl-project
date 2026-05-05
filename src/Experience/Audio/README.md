# Audio

Ce dossier centralise la couche sonore du projet.

## Ce que fait ce domaine

- active ou coupe le son global,
- gere les volumes musique/SFX,
- lit les buffers precharges depuis `Resources`,
- retombe sur des chemins de fichiers quand un buffer n'est pas precharge,
- expose des helpers metier comme les bruits de buisson ou les dialogues.

## Fichiers

- `SoundManager.js`: service principal audio.
- `soundDefinitions.json`: catalogue declaratif des sons.
- `bushSoundBank.js`: banque utilitaire pour les variations de buissons.

## Architecture

`SoundManager` est instancie tres tot par `Experience`.
Il ne porte pas la logique du jeu: il fournit une API stable aux autres systemes (`play`, `playDialogue`, `stopChannel`, `setEnabled`).

## Convention

- Les nouveaux sons doivent etre declares dans `soundDefinitions.json` si on veut un acces nomme.
- Les assets physiques restent dans `public/sounds/`.
- Les volumes utilisateur sont persistes dans `localStorage`.
