# Shaders Clouds

Shaders des nuages proceduraux de la map.

## Contenu

- `clouds.vertex.glsl`
- `clouds.fragment.glsl`
- `cloudsShader.js`: assemblage et creation du material/shader runtime.

## Usage

Ce dossier porte un effet autonome, plutot qu'un patch applique a un material GLTF existant.

## Particularite

Ici, le shader porte son propre material du debut a la fin.
La logique est donc plus "self contained" que dans les autres effets de la map.

En lecture:

- `cloudsShader.js` explique les uniforms et la construction du material,
- les GLSL decrivent la forme et l'animation des nuages,
- `CloudLayer.js` explique comment l'effet est place dans le monde.
