# Scene Distribution

Scene de puzzle basee sur des vannes et des tubes d'eau.

## Composition

- ``: enveloppe de scene.
- `World/`: logique locale du puzzle.

## Idee de gameplay

Le joueur se deplace en FPS dans la scene et agit sur des vannes.
Le systeme convertit la rotation des vannes en progression de remplissage visuel dans les tubes associes.

## Ce qu'il faut retenir

Cette scene est plus "systemique" que `SceneRecuperation`.
Le coeur du gameplay repose sur une chaine claire:

1. viser une vanne,
2. la faire tourner,
3. convertir cette rotation en etat de flux,
4. afficher cet etat dans les tubes,
5. ouvrir la sortie quand l'equilibre attendu est atteint.
