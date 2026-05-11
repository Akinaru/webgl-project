# Actions

Ce dossier gere les actions gameplay considerees comme des evenements memorisables.

## Role

- decrire les actions importantes du jeu,
- empecher certains gains de se rejouer plusieurs fois,
- produire une timeline exploitable par le debug,
- appliquer les effets de progression associes.

## Fichiers

- `ActionId.js`: identifiants stables.
- `ActionDefinitions.js`: definition des actions et de leurs effets.
- `ActionTracker.js`: enregistre les actions deja faites et applique leurs gains.

## Flux typique

1. Un dialogue ou un systeme appelle `actionTracker.record(actionId, context)`.
2. `ActionTracker` verifie si l'action existe et si elle n'a pas deja ete faite.
3. Les effets declares sont pousses vers `MetierManager`.
4. Le debug peut exposer le dernier evenement et le compteur total.

## Quand ajouter une action

Ajoute une nouvelle entree ici quand une interaction doit etre:

- unique,
- tracable,
- et reliee a un impact gameplay persistant ou semi-persistant.
