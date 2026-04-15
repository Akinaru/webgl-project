# Shaders Map

- `Terrain/`: shader de teinte du relief sous la ligne d eau.
- `Water/`: shader de masque d eau sur le plan.
- `Common/`: helpers d injection/parse pour patcher les materials Three.js.

Chaque shader metier est decoupe en 2 fichiers GLSL (`vertex`, `fragment`) avec des sections:
- `// @header`
- `// @project` (vertex)
- `// @diffuse` (fragment)
