// Uniforms utilises pour echantillonner la data terrain depuis le plan.
// @header
varying vec3 vMapPlanWorldPosition;
uniform float uMapPlanWaterLevel;
uniform float uMapPlanSlopeFrequency;
uniform float uMapPlanNoiseFrequency;
uniform float uMapPlanRippleThreshold;
uniform vec3 uMapPlanBackgroundColor;
uniform float uMapPlanBackgroundOpacity;
uniform float uMapPlanLocalTime;
uniform vec4 uMapPlanBounds;
uniform vec2 uMapPlanHeightRange;
uniform vec2 uMapPlanTerrainDataTexelSize;
uniform sampler2D uMapPlanTerrainDataTexture;
uniform sampler2D uMapPlanNoiseTexture;

// Equivalent du outputNode: lecture data terrain puis sortie grayscale sur le canal B.
// @diffuse
vec2 planExtent = max(uMapPlanBounds.zw, vec2(0.0001));
vec2 terrainUv = (vMapPlanWorldPosition.xz - uMapPlanBounds.xy) / planExtent;
terrainUv = clamp(terrainUv, 0.0, 1.0);
vec4 terrainDataCenter = texture2D(uMapPlanTerrainDataTexture, terrainUv);
float terrainHeight01 = terrainDataCenter.r;
float terrainHeight = mix(uMapPlanHeightRange.x, uMapPlanHeightRange.y, terrainHeight01);
float floodedMask = step(terrainHeight, uMapPlanWaterLevel);
if(floodedMask < 0.5)
{
    discard;
}

vec2 texel = uMapPlanTerrainDataTexelSize;
float shoreDistance = 0.0;
shoreDistance += terrainDataCenter.b * 0.4;
shoreDistance += texture2D(uMapPlanTerrainDataTexture, terrainUv + vec2(texel.x, 0.0)).b * 0.15;
shoreDistance += texture2D(uMapPlanTerrainDataTexture, terrainUv - vec2(texel.x, 0.0)).b * 0.15;
shoreDistance += texture2D(uMapPlanTerrainDataTexture, terrainUv + vec2(0.0, texel.y)).b * 0.15;
shoreDistance += texture2D(uMapPlanTerrainDataTexture, terrainUv - vec2(0.0, texel.y)).b * 0.15;
vec4 terrainData = vec4(terrainDataCenter.r, terrainDataCenter.g, shoreDistance, terrainDataCenter.a);
float ripple = mod((terrainData.b + uMapPlanLocalTime) * uMapPlanSlopeFrequency, 1.0);
ripple -= (1.0 - terrainData.b);
float noise = texture2D(uMapPlanNoiseTexture, vMapPlanWorldPosition.xz * uMapPlanNoiseFrequency).r;
ripple += noise;
float waveVisibleMask = 1.0 - step(uMapPlanRippleThreshold, ripple);
vec3 finalColor = mix(uMapPlanBackgroundColor, vec3(1.0), waveVisibleMask);
float finalOpacity = mix(uMapPlanBackgroundOpacity, 1.0, waveVisibleMask);
vec4 diffuseColor = vec4(finalColor, finalOpacity);
