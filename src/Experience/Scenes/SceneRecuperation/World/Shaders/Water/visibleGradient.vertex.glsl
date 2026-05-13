// Utilise les UV unwrappees du mesh d eau pour peindre un degrade horizontal.
// @header
varying vec2 vRecuperationWaterUv;
varying vec3 vRecuperationWaterWorldPosition;

// Transmet les UV au fragment shader apres la projection standard.
// @project
vec4 recuperationWaterWorldPosition = modelMatrix * vec4(transformed, 1.0);
#include <project_vertex>
vRecuperationWaterUv = uv;
// La position monde sert a stabiliser le motif entre plusieurs plans d'eau distincts.
vRecuperationWaterWorldPosition = recuperationWaterWorldPosition.xyz;
