// Passe la position monde pour le mapping triplanaire dans le fragment shader.
// @header
varying vec3 vWallWorldPos;

// @project
vec4 wallWorldPos4 = modelMatrix * vec4(transformed, 1.0);
#include <project_vertex>
vWallWorldPos = wallWorldPos4.xyz;
