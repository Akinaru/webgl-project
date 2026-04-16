// Parametres de hauteur et couleurs pour teinter le relief sous la ligne d eau.
// @header
varying vec3 vMapWorldPosition;
uniform float uMapWaterlineMinY;
uniform float uMapWaterlineSurfaceY;
uniform float uMapWaterlineFondY;
uniform vec3 uMapWaterlineSableColor;
uniform vec3 uMapWaterlineSurfaceColor;
uniform vec3 uMapWaterlineFondColor;

// Melange la couleur du relief avec 3 strates: sable, bleu surface et bleu fond.
// @diffuse
float eauMask = 1.0 - smoothstep(uMapWaterlineMinY - 0.18, uMapWaterlineMinY + 0.18, vMapWorldPosition.y);
float versSurface = 1.0 - smoothstep(uMapWaterlineSurfaceY - 0.20, uMapWaterlineSurfaceY + 0.20, vMapWorldPosition.y);
float versFond = 1.0 - smoothstep(uMapWaterlineFondY - 0.24, uMapWaterlineFondY + 0.24, vMapWorldPosition.y);

vec3 waterTint = mix(uMapWaterlineSableColor, uMapWaterlineSurfaceColor, clamp(versSurface, 0.0, 1.0));
waterTint = mix(waterTint, uMapWaterlineFondColor, clamp(versFond, 0.0, 1.0));

vec3 terrainColor = mix(diffuse, waterTint, clamp(eauMask, 0.0, 1.0));
vec4 diffuseColor = vec4(terrainColor, opacity);
