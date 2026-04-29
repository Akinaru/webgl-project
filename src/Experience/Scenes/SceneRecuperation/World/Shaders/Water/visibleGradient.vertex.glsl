// Utilise les UV unwrappees du mesh d eau pour peindre un degrade horizontal.
// @header
varying vec2 vRecuperationWaterUv;

// Transmet les UV au fragment shader apres la projection standard.
// @project
#include <project_vertex>
vRecuperationWaterUv = uv;
