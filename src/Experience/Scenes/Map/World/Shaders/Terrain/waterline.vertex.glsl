// Passe la position monde du relief au fragment shader.
// @header
varying vec3 vMapWorldPosition;

// Recupere la position monde apres le calcul standard du vertex.
// @project
#include <project_vertex>
vMapWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
