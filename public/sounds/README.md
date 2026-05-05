# public/sounds

Banque sonore brute du projet.

## Organisation

- `dialogues/`: voix et lignes de dialogues.
- `effects/`: sons de gameplay et d'environnement.
- `ui/`: feedback d'interface.

## Lien avec le code

- les sons precharges sont listes dans `src/Experience/Source/sources.audio.js`,
- les definitions nommees sont dans `src/Experience/Audio/soundDefinitions.json`,
- `SoundManager` orchestre la lecture runtime.
