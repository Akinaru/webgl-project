# Scenes

Ce dossier organise la navigation entre les espaces jouables.

## Architecture

- `BaseScene.js`: contrat minimal d'une scene.
- `SceneManager.js`: registre, choix initial, switch et destruction.
- Un sous-dossier par scene concrete.

## Modele

Une scene contient surtout un `World`.
La scene reste fine:

- elle cree le world dans `enter()`,
- elle lui delegue `update()`,
- elle le detruit dans `destroy()`.

## Scenes presentes

- `Map/`: hub principal et exploration.
- `SceneRecuperation/`: puzzle de recuperation/materiaux.
- `SceneDistribution/`: puzzle de valves et remplissage de tubes.

## Grammaire commune a toutes les scenes

Chaque scene concrete suit la meme repartition:

- `SceneXxxScene.js`: couche tres fine pour s'aligner avec `SceneManager`,
- `World/`: vraie logique locale,
- `World/*.constants.js`: tokens et valeurs stables,
- `World/*.debug.js`: organisation du panneau Tweakpane,
- `World/Shaders/`: GLSL ou patches associes a la scene.

## Pourquoi cette separation

Le `SceneManager` gere la navigation globale.
Chaque `World` garde sa logique locale, ses collisions, ses interactions et ses helpers debug.
