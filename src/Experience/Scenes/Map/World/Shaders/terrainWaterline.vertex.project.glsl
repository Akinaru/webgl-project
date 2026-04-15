// Recupere la position monde apres le calcul standard du vertex.
#include <project_vertex>
vMapWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
