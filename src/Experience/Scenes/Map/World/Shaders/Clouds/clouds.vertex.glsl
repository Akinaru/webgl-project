// Role: projette une nappe de nuages dans l espace monde au-dessus de la map.
// @header
varying vec2 vUv;
varying vec3 vWorldPosition;

void main()
{
    vUv = uv;

    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;

    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
