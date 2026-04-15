// Uniforms utilises pour ne rendre que les zones d eau du plan.
// @header
varying vec3 vMapPlanWorldPosition;
uniform float uMapPlanWaterLevel;
uniform vec3 uMapPlanWetColor;
uniform vec4 uMapPlanBounds;
uniform vec2 uMapPlanHeightRange;
uniform sampler2D uMapPlanHeightTexture;

// Echantillonne la hauteur du relief et ignore les pixels hors eau pour eviter de dessiner la partie noire.
// @diffuse
vec2 planExtent = max(uMapPlanBounds.zw, vec2(0.0001));
vec2 planUv = (vMapPlanWorldPosition.xz - uMapPlanBounds.xy) / planExtent;
planUv = clamp(planUv, 0.0, 1.0);
float terrainHeight01 = texture2D(uMapPlanHeightTexture, planUv).r;
float terrainHeight = mix(uMapPlanHeightRange.x, uMapPlanHeightRange.y, terrainHeight01);
float floodedMask = step(terrainHeight, uMapPlanWaterLevel);
if(floodedMask < 0.5)
{
    discard;
}
vec4 diffuseColor = vec4(uMapPlanWetColor, opacity);
