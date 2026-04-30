// Shader des tubes de cascade: coordonnees monde + normales pour animer un flux vertical.
// @header
varying vec3 vCascadeWorldPosition;
varying vec3 vCascadeWorldNormal;
varying vec3 vCascadeLocalPosition;

// @project
vec4 cascadeWorldPosition = modelMatrix * vec4(transformed, 1.0);
#include <project_vertex>
vCascadeWorldPosition = cascadeWorldPosition.xyz;
vCascadeWorldNormal = normalize(mat3(modelMatrix) * normal);
vCascadeLocalPosition = transformed;
