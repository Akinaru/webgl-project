// Passe la position monde du plan pour retrouver sa coordonnee XZ.
// @header
varying vec3 vMapPlanWorldPosition;

// Recupere la position monde du plan apres projection standard.
// @project
#include <project_vertex>
vMapPlanWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
