# public

Assets statiques servis tels quels par Vite.

## Sous-dossiers utiles

- `models/`: GLTF du projet.
- `sounds/`: voix, UI et effets.
- `textures/`: textures diverses.
- `icons/`, `images/`, `favicon/`: assets d'interface.
- `vendor/`: bibliotheques statiques embarquees.

## Regle

Tout chemin declare dans `src/Experience/Source/*.js` est resolu depuis ce dossier.

Exemple:

- `models/scenes/map/Map.gltf`
- `sounds/ui/menu-click.mp3`

## Fichiers HTML annexes

- `dialogue.html`
- `opti.html`
- `page.html`

Ils servent de pages/outils annexes et ne pilotent pas le runtime principal de `src/script.js`.
