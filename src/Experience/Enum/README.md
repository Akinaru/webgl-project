# Enum

Ce dossier regroupe les constantes de reference partagees.

## Pourquoi il existe

Les scenes, events et metiers reviennent dans plusieurs modules.
Les sortir ici evite les strings inline fragiles et rend les appels plus lisibles.

## Fichiers

- `EventEnum.js`: noms d'evenements runtime (`tick`, `resize`, `ready`, etc.).
- `SceneEnum.js`: identifiants stables des scenes.
- `MetierEnum.js`: identifiants stables des roles/metriques.

## Regle

Quand une valeur devient transversale et doit rester stable, elle doit vivre ici ou dans un fichier de constantes de domaine.
