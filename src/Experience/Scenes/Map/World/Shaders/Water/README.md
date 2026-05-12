# Shaders Water

Shaders lies au plan d'eau de la map.

## Contenu

- `planMask.vertex.glsl`
- `planMask.fragment.glsl`
- `planMaskShaderChunks.js`

## Role

Appliquer le masque visuel du plan d'eau et ses effets de mousse/opacite sur les maillages concernes.

## Idee generale

Le plan d'eau de la map n'est pas juste une surface bleue uniforme.
Il lit une texture de donnees terrain pour savoir:

- quelles zones sont vraiment immergees,
- ou se situe le bord de rive,
- ou afficher mousse et vaguelettes.

## Pipeline mental

1. convertir la position monde du plan en UV terrain,
2. lire la texture de donnees precomputees,
3. decider si le pixel doit etre visible ou `discard`,
4. generer mousse et ruptures a partir du bruit,
5. produire une couleur/opacite finale.

## Point d'attention

Le fichier `planMask.fragment.glsl` contient a la fois:

- la logique de presence de l'eau,
- la mousse de rive,
- un traitement specifique quand on regarde le plan par dessous.

C'est l'un des shaders a lire avec le README a cote si tu le modifies.
