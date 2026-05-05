# Metiers

Ce dossier stocke les scores/affinites des roles du jeu.

## Concepts

Un "metier" est une jauge de progression associee a un role:

- inventeur,
- meneur,
- travailleur,
- botaniste.

## Fichiers

- `Metier.js`: entite simple avec valeur et operations de base.
- `MetierManager.js`: registre, acces, debug et emission des changements.

## Relations avec le reste du projet

- `ActionTracker` peut ajouter des points de metier.
- `DialogueActionExecutor` peut aussi en ajouter directement.
- Le debug expose les valeurs courantes.

## Quand toucher ce dossier

Quand tu veux ajouter un nouveau role, une nouvelle regle de gain ou un systeme qui lit les valeurs de progression.
