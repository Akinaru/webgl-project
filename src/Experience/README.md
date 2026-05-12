# Experience

`Experience` est la composition root du projet.
Ce dossier porte l'architecture runtime: orchestration, services transverses, scenes et boucle de mise a jour.

## Fichiers centraux

- `Experience.js`: singleton applicatif, creation des services et boucle principale.
- `Camera.js`: camera Three.js partagee.
- `Renderer.js`: renderer WebGL et stats de rendu.
- `Scenes/SceneManager.js`: activation et destruction des scenes.

## Ce que fait exactement `Experience.js`

Le fichier joue le role de "chef d'orchestre":

1. il cree les services transverses une seule fois,
2. il expose ces services aux modules via le singleton `new Experience()`,
3. il branche la boucle `Time`,
4. il delegue ensuite le travail concret aux scenes et aux sous-systemes.

Concretement, si tu te demandes "qui cree cet objet ?" ou "qui possede cet etat global ?", la reponse se trouve tres souvent ici.

## Domaines

- `Actions/`: suivi des actions uniques et de leurs effets.
- `Audio/`: lecture audio, canaux et volumes.
- `Common/`: systemes 3D reutilises par plusieurs scenes.
- `Dialogues/`: repository, moteur, UI et actions de dialogues.
- `Enum/`: constantes de reference.
- `Inputs/`: source unique de verite pour les controles.
- `Menu/`: boot screen et pause runtime.
- `Metiers/`: progression/metriques de role.
- `Scenes/`: scenes navigables du jeu.
- `Source/`: manifest central des assets.
- `Utils/`: primitives transverses.

## Boucle runtime

La boucle part de `Time`, puis `Experience.update()` appelle:

1. la scene courante,
2. le tutoriel,
3. Bloom,
4. le son,
5. la camera,
6. le renderer,
7. le debug.

Cette sequence est importante pour lire le code:

- la scene met a jour le gameplay et les objets 3D,
- les systemes transverses consomment ensuite cet etat deja calcule,
- le rendu et le debug arrivent a la fin.

## A retenir pour les evolutions

- Toute dependance transverse doit etre accessible via `Experience`.
- Les scenes ne s'instancient pas entre elles.
- Les modules doivent exposer un cycle de vie lisible: `start`, `update`, `resize`, `destroy` selon le besoin.

## Quand tu hesites ou brancher une feature

- besoin global a plusieurs scenes: `Common/`, `Utils/` ou un domaine transverse,
- logique locale a une scene: `Scenes/<Scene>/World/`,
- simple configuration d'asset: `Source/`,
- contenu narratif: `Dialogues/`,
- input ou UI globale: `Inputs/` ou `Menu/`.
