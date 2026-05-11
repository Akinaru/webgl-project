# Inputs

Source unique de verite des controles runtime.

## Role

- ecouter clavier, souris et pointer lock,
- maintenir un etat d'input normalise,
- fournir des bindings remappables,
- emettre des evenements propres aux autres systemes.

## Fichiers

- `InputManager.js`: service runtime d'input.
- `InputBindings.constants.js`: catalogue des actions et bindings par defaut.

## Contrat du projet

Les autres modules n'ajoutent pas leurs propres `addEventListener` clavier/souris.
Ils consomment `InputManager` via:

- des requetes d'etat (`isActionPressed`, `getActionAxis`),
- ou des events namespacés (`mousemove.player`, `pointerlockchange.player`, etc.).

## Persistance

Les remaps clavier sont sauvegardes dans `localStorage`.
