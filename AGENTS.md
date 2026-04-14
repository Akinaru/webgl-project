# AGENTS.md

Regles d'architecture et de qualite pour ce projet.
Basee sur les principes utilises dans `brunosimon/folio-2025`:
- orchestration centrale
- systemes modules
- boucle de jeu ordonnee par etapes
- chargement en batches
- event bus simple et deterministe

Ce document sert de contrat de dev pour Codex et pour l'equipe.

## 1) Principes non negociables

1. Un seul orchestrateur applicatif (ici `Experience`) pilote le cycle de vie.
2. `src/script.js` reste minimal: bootstrap DOM + `new Experience(...)`.
3. Pas de logique metier diffusee dans des handlers inline, listeners globaux ou fichiers d'entree.
4. Chaque responsabilite est dans une classe/module dedie.
5. Tout module a un cycle de vie explicite: `init/start`, `update`, `destroy` (et `resize/reset` si necessaire).
6. Toute dependance runtime passe par l'orchestrateur (ou un contexte injecte), pas par du global implicite.

## 2) Architecture cible (style Bruno Simon)

### 2.1 Composition root

- L'orchestrateur cree et possede:
  - temps/ticker
  - ressources
  - renderer/camera/scene manager
  - systemes metier (dialogues, gameplay, etc.)
  - UI runtime (menu, modals, overlay, HUD)
- Les modules ne s'instancient pas entre eux de maniere anarchique.
- Toute creation transversale passe par l'orchestrateur.

### 2.2 Separation par domaines

- `Utils/`: primitives transverses (Time, Sizes, EventEmitter, Resources, Debug).
- `Scenes/`: composition scene + monde visuel + logique locale de scene.
- `Dialogues/`: repository, resolution de conditions, execution d'actions, UI de dialogue.
- `Menu/` et UI: seulement presentation + interaction utilisateur.
- `Metiers/` (ou gameplay systems): logique metier pure.

Regle: un module ne doit pas melanger "chargement ressources + rendu + logique metier + UI" dans une meme classe.

### 2.3 Contrat standard d'un module

Chaque nouveau module doit suivre ce contrat (ou un sous-ensemble justifie):

```js
export default class SomeSystem {
    constructor(experience) {}
    init?.() {}
    start?.() {}
    update?.(delta) {}
    resize?.() {}
    reset?.() {}
    destroy?.() {}
}
```

## 3) Boucle de jeu ordonnee

Le projet doit garder une pipeline stable (inspiree de la game loop du folio):

1. `time + inputs`
2. `pre-physics`
3. `physics`
4. `post-physics`
5. `gameplay systems`
6. `rendering`
7. `monitoring/debug`

Regles:
- L'ordre est explicite dans le code (pas implicite via effets de bord).
- Un systeme sait dans quelle phase il tourne.
- Eviter les dependances circulaires entre phases.

## 4) Chargement des ressources

### 4.1 Loader unique

- Un seul service de chargement (`Resources` / `ResourcesLoader`) gere:
  - registry des loaders
  - cache
  - progression
  - erreurs

- Interdit: charger des fichiers 3D/textures "a la main" dans des modules metier/UI.

### 4.2 Chargement par batches

- Batch 1: ressources minimales pour demarrer l'experience/menu/intro.
- Batch 2+: ressources lourdes en parallelisation quand possible (`Promise.all`).
- Afficher une progression utilisateur fiable (pas de faux pourcentage).

### 4.3 Manifest de ressources

- Les ressources sont decrites via un manifest central (ex: `sources.js`).
- Cle stable, type explicite, options de post-traitement claires.

## 5) Events et communication inter-modules

- Utiliser un bus d'evenements simple, nomme et deterministic.
- Les events critiques doivent etre namespaced.
- Tout `on(...)` doit avoir son cleanup dans `destroy()`.
- Les callbacks a ordre d'execution doivent etre ordonnes explicitement.

## 6) Regles UI runtime

1. Pas de `alert/confirm/prompt` navigateur pour les actions metier.
2. Utiliser une couche de `Modal` reusable pour confirmations et erreurs.
3. Le menu de droite (ou inspecteur) ne doit pas se fermer sur changement de champ.
4. Les interactions prioritaires doivent etre faisables directement dans le canvas (moins de friction).
5. Les composants UI ne doivent pas piloter la logique metier directement: ils deleguent aux managers/systemes.

## 7) Etat, persistence, reprise

- Etat courant explicite et serialisable pour les features qui le demandent (dialogues, editor config, audio pref).
- `localStorage` accepte pour preferences et reprise locale.
- Reouverture de session: restaurer la derniere config valide si presente.
- Changement de config/fichier: clean unload avant load suivant.
- Eviter les "etats fantomes" (ancienne version reappliquee sans intention utilisateur).

## 8) Regles de code

1. Classes courtes et cohesion forte.
2. Noms explicites (pas d'abreviations opaques).
3. Pas de duplication evitable.
4. Pas de magic numbers non nommes pour les timings/seuils importants.
5. Commentaires rares et utiles (intention, pas narration).
6. Pas de mutation globale non controlee.

## 9) Checklist avant merge

1. Syntaxe OK sur les fichiers modifies.
2. Build OK.
3. Parcours critiques testes manuellement.
4. `destroy()` verifie sur les modules touches (listeners, raf, timeouts, events).
5. Diff relu pour eviter regressions UI/UX.

## 10) Regles de collaboration

- Ne pas casser un comportement valide sans demande explicite.
- En cas de choix d'architecture non trivial:
  1. proposer options
  2. expliquer impact
  3. valider avant implementation lourde
- Preferer des changements incrementaux, testables et revertables facilement.

## 11) Decision en cas de conflit

Si une demande contredit ce guide:
1. implementer la version demandee seulement apres confirmation explicite
2. documenter la derogation dans le PR/commit
3. garder l'architecture lisible malgre la derogation
