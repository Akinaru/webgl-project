// Shader des tubes de cascade: bruit anime, mousse et chute vers le bas.
// @header
uniform float uCascadeTime;
uniform vec3 uCascadeBaseColor;
uniform vec3 uCascadeFoamColor;
uniform float uCascadeFlowSpeed;
uniform float uCascadeFlowScale;
uniform float uCascadeFoamSpeed;
uniform float uCascadeFoamNoiseFrequency;
uniform float uCascadeFoamThreshold;
uniform float uCascadeFoamIntensity;
uniform float uCascadeOpacity;
uniform vec2 uCascadePatternOffset;
uniform vec2 uCascadeNoiseSeed;
uniform float uCascadeSeamOffset;

const float CASCADE_FOAM_SOFTNESS = 0.278;
const float CASCADE_FOAM_OPACITY = 0.76;
varying vec3 vCascadeWorldPosition;
varying vec3 vCascadeWorldNormal;
varying vec3 vCascadeLocalPosition;

float cascadeHash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float cascadeNoise(vec2 p)
{
    vec2 cell = floor(p);
    vec2 local = fract(p);
    vec2 smoothLocal = local * local * (3.0 - (2.0 * local));

    float bottomLeft = cascadeHash(cell);
    float bottomRight = cascadeHash(cell + vec2(1.0, 0.0));
    float topLeft = cascadeHash(cell + vec2(0.0, 1.0));
    float topRight = cascadeHash(cell + vec2(1.0, 1.0));

    float bottom = mix(bottomLeft, bottomRight, smoothLocal.x);
    float top = mix(topLeft, topRight, smoothLocal.x);
    return mix(bottom, top, smoothLocal.y);
}

// @diffuse
float cascadeAngle = atan(vCascadeLocalPosition.z, vCascadeLocalPosition.x) / 6.28318530718;
vec2 baseUv = vec2(
    fract(cascadeAngle + 0.5 + uCascadeSeamOffset),
    (vCascadeLocalPosition.y * uCascadeFlowScale) + (uCascadeTime * uCascadeFlowSpeed) + uCascadePatternOffset.y
);

vec3 waterColor = uCascadeBaseColor;

vec2 seededBaseUv = vec2(baseUv.x, baseUv.y) + uCascadeNoiseSeed;
float foamTime = uCascadeTime * uCascadeFoamSpeed;
vec2 domainWarpUvA = (seededBaseUv * vec2(1.7, 1.15)) + vec2(uCascadeNoiseSeed.y * 2.3, -uCascadeNoiseSeed.x * 1.9);
vec2 domainWarpUvB = (seededBaseUv * vec2(2.4, 1.85)) + vec2(-uCascadeNoiseSeed.x * 2.1, uCascadeNoiseSeed.y * 2.7);
vec2 domainWarp = vec2(
    cascadeNoise(domainWarpUvA + vec2(0.0, foamTime * 0.08)),
    cascadeNoise(domainWarpUvB - vec2(0.0, foamTime * 0.06))
) - 0.5;

vec2 foamNoiseUv = (seededBaseUv * vec2(max(uCascadeFoamNoiseFrequency, 0.0001), max(uCascadeFoamNoiseFrequency * 1.15, 0.0001)))
    + (domainWarp * 0.65);
float foamNoise = cascadeNoise(foamNoiseUv);
vec2 foamDriftUv = vec2(
    (seededBaseUv.x * max((uCascadeFoamNoiseFrequency * 1.7) + 0.0001, 0.0001)) - (foamTime * 0.23) + (domainWarp.x * 0.55),
    (seededBaseUv.y * max((uCascadeFoamNoiseFrequency * 1.9) + 0.0001, 0.0001)) + (foamTime * 0.31) + (domainWarp.y * 0.75)
);
float foamDrift = cascadeNoise(foamDriftUv);
float foamPulse = (sin((seededBaseUv.y * (20.0 + (uCascadeNoiseSeed.x * 11.0))) - (foamTime * 8.0) + (foamDrift * 6.28318530718)) * 0.5) + 0.5;
float foamField = (foamNoise * 0.45) + (foamDrift * 0.3) + (foamPulse * 0.25);
float foamMask = smoothstep(
    max(0.0, uCascadeFoamThreshold - CASCADE_FOAM_SOFTNESS),
    min(1.5, uCascadeFoamThreshold + CASCADE_FOAM_SOFTNESS),
    foamField
);
foamMask *= uCascadeFoamIntensity;
float foamMaskBinary = step(0.5, foamMask);

vec3 finalCascadeColor = mix(waterColor, uCascadeFoamColor, foamMaskBinary);

float finalOpacity = max(uCascadeOpacity, foamMaskBinary * CASCADE_FOAM_OPACITY);
vec4 diffuseColor = vec4(clamp(finalCascadeColor, 0.0, 1.0), clamp(finalOpacity, 0.0, 1.0));
