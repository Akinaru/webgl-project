# Shaders Citerne

Dossier reserve pour les effets de citerne de la scene Distribution.

## Usage attendu

Si la citerne doit recevoir un shader dedie, le code GLSL et son assembleur JS doivent vivre ici plutot que dans le controller runtime.

## Intention documentaire

Ce README existe surtout pour signaler la frontiere d'architecture:

- ce qui est simple et etroitement couple au puzzle peut rester dans le controller,
- ce qui devient un vrai effet graphique autonome doit migrer ici.
