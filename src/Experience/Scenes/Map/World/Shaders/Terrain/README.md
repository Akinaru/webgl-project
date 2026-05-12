# Shaders Terrain

Shaders du relief de la map.

## Contenu

- `waterline.vertex.glsl`
- `waterline.fragment.glsl`
- `waterlineShaderChunks.js`

## Role

Colorer et moduler le relief selon la hauteur d'eau et les bandes de transition sable/surface/fond.

## Comment le lire

Ce shader ne cree pas le terrain.
Il recolore un material existant en fonction de la hauteur monde (`world Y`).

Le principe est volontairement simple:

1. mesurer la hauteur du fragment,
2. calculer plusieurs masques de transition,
3. melanger les trois couleurs de reference,
4. recomposer une teinte finale du terrain.

## Pourquoi c'est utile

Le shader permet de faire "lire" la profondeur de l'eau meme quand le mesh du sol reste unique.
Autrement dit: on encode une information de relief visuelle sans avoir besoin de dupliquer les geometries.
