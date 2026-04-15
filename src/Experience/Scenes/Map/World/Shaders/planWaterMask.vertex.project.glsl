// Recupere la position monde du plan apres projection standard.
#include <project_vertex>
vMapPlanWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
