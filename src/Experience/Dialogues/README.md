# Dialogues

Ce dossier contient le moteur de dialogues data-driven.

## Pieces du systeme

- `dialogues.json`: source de verite des dialogues.
- `DialogueRepository.js`: acces aux donnees.
- `DialogueManager.js`: machine d'etat du dialogue courant.
- `DialogueConditionResolver.js`: evaluation des conditions.
- `DialogueActionExecutor.js`: execution des effets lies aux noeuds.
- `DialogueUI.js`: rendu HTML et interactions utilisateur.

## Modele mental

Un dialogue est un graphe de noeuds.
Chaque noeud peut:

- afficher une ligne,
- proposer un choix,
- brancher selon des conditions,
- lancer des actions,
- terminer le flux.

## Flux typique

1. Un systeme appelle `startByKey`.
2. `DialogueManager` charge le dialogue et place son etat sur le noeud de depart.
3. Les actions du noeud partent vers `DialogueActionExecutor`.
4. L'UI se met a jour selon l'etat courant.
5. Le dialogue peut chaines, changer de scene, alimenter les metiers ou pousser des flags.

## Bon endroit pour brancher

- Nouvelle condition: `DialogueConditionResolver`.
- Nouvel effet: `DialogueActionExecutor`.
- Nouvelle presentation UI: `DialogueUI`.
- Nouveau contenu: `dialogues.json`.
