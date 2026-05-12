// Plan d eau de recuperation: meme famille visuelle que la pente, mais avec un flux statique.
// @header
varying vec2 vRecuperationWaterUv;
varying vec3 vRecuperationWaterWorldPosition;
uniform sampler2D uWaterMask;
uniform vec3 uRecuperationWaterBaseColor;
uniform vec3 uRecuperationWaterDeepFoamColor;
uniform vec3 uRecuperationWaterSurfaceFoamColor;
uniform float uRecuperationWaterTime;
uniform float uOpacity;
uniform float uRecuperationWaterPatternScale;
uniform float uRecuperationWaterNoiseSpeed;
uniform float uRecuperationWaterNoiseFrequency;
uniform float uRecuperationWaterThreshold;
uniform float uRecuperationWaterIntensity;
uniform float uRecuperationWaterFoamSoftness;
uniform float uRecuperationWaterFoamCutoff;
uniform float uRecuperationWaterDeepFoamThreshold;
uniform float uRecuperationWaterDeepFoamIntensity;
uniform float uRecuperationWaterDeepFoamSoftness;
uniform float uRecuperationWaterBandAngle;
uniform float uRecuperationWaterEdgeContrast;

const float RECUPERATION_WORLD_UV_SCALE = 0.08;

vec2 recuperationWaterHash(vec2 p)
{
    p = vec2(
        dot(p, vec2(127.1, 311.7)),
        dot(p, vec2(269.5, 183.3))
    );

    return fract(sin(p) * 43758.5453123);
}

float recuperationWaterNoise(vec2 inputUv)
{
    vec2 cell = floor(inputUv);
    vec2 localUv = fract(inputUv);
    vec2 smoothLocal = localUv * localUv * (3.0 - (2.0 * localUv));

    float bottomLeft = recuperationWaterHash(cell).x;
    float bottomRight = recuperationWaterHash(cell + vec2(1.0, 0.0)).x;
    float topLeft = recuperationWaterHash(cell + vec2(0.0, 1.0)).x;
    float topRight = recuperationWaterHash(cell + vec2(1.0, 1.0)).x;

    float bottom = mix(bottomLeft, bottomRight, smoothLocal.x);
    float top = mix(topLeft, topRight, smoothLocal.x);
    return mix(bottom, top, smoothLocal.y);
}

float recuperationWaterVoronoi(vec2 inputUv, float repeat)
{
    vec2 scaledUv = inputUv * repeat;
    vec2 cell = floor(scaledUv);
    vec2 localUv = fract(scaledUv);
    float minDist = 1.0;

    for(int y = -1; y <= 1; y++)
    {
        for(int x = -1; x <= 1; x++)
        {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 point = recuperationWaterHash(mod(cell + neighbor, repeat));
            vec2 diff = neighbor + point - localUv;
            float dist = length(diff);
            minDist = min(minDist, dist);
        }
    }

    return minDist;
}

mat2 recuperationWaterRotation(float angle)
{
    float sineValue = sin(angle);
    float cosineValue = cos(angle);
    return mat2(cosineValue, -sineValue, sineValue, cosineValue);
}

// @diffuse
vec2 maskUv = vAlphaMapUv;
float maskValue = texture2D(uWaterMask, maskUv).g;

if(maskValue < 0.5)
{
    discard;
}

vec2 worldUv = vRecuperationWaterWorldPosition.xz * (uRecuperationWaterPatternScale * RECUPERATION_WORLD_UV_SCALE);
vec2 baseUv = ((vRecuperationWaterUv - 0.5) * uRecuperationWaterPatternScale) + worldUv;
// Petit domain warp pour casser les bandes trop paralleles et obtenir une lecture plus organique.
vec2 organicOffset = vec2(
    sin((baseUv.y * 2.7) + (baseUv.x * 0.9)),
    sin((baseUv.x * 2.1) - (baseUv.y * 1.4))
) * 0.18;
vec2 warpedBaseUv = baseUv + organicOffset;
vec2 rotatedBaseUv = recuperationWaterRotation(uRecuperationWaterBandAngle) * warpedBaseUv;
float noiseTime = uRecuperationWaterTime * uRecuperationWaterNoiseSpeed;
vec2 domainWarpUvA = (rotatedBaseUv * vec2(1.7, 1.15)) + vec2(0.0, noiseTime * 0.08);
vec2 domainWarpUvB = (rotatedBaseUv * vec2(2.4, 1.85)) - vec2(0.0, noiseTime * 0.06);
vec2 domainWarp = vec2(
    recuperationWaterNoise(domainWarpUvA),
    recuperationWaterNoise(domainWarpUvB)
) - 0.5;

// Toute la mousse part d'un meme champ de bruit, puis on derive:
// - une couche "deep foam" plus large,
// - une couche "surface foam" plus tranchee.
vec2 foamNoiseUv = (rotatedBaseUv * vec2(max(uRecuperationWaterNoiseFrequency, 0.0001), max(uRecuperationWaterNoiseFrequency * 1.15, 0.0001)))
    + (domainWarp * 0.65);
float foamNoise = recuperationWaterNoise(foamNoiseUv);
vec2 foamDriftUv = vec2(
    (rotatedBaseUv.x * max((uRecuperationWaterNoiseFrequency * 1.7) + 0.0001, 0.0001)) - (noiseTime * 0.23) + (domainWarp.x * 0.55),
    (rotatedBaseUv.y * max((uRecuperationWaterNoiseFrequency * 1.9) + 0.0001, 0.0001)) + (noiseTime * 0.31) + (domainWarp.y * 0.75)
);
float foamDrift = recuperationWaterNoise(foamDriftUv);
float foamPulse = (sin((rotatedBaseUv.y * 20.0) - (noiseTime * 8.0) + (foamDrift * 6.28318530718)) * 0.5) + 0.5;
float foamField = (foamNoise * 0.45) + (foamDrift * 0.3) + (foamPulse * 0.25);
float foamMask = smoothstep(
    max(0.0, uRecuperationWaterThreshold - uRecuperationWaterFoamSoftness),
    min(1.5, uRecuperationWaterThreshold + uRecuperationWaterFoamSoftness),
    foamField
);
foamMask *= uRecuperationWaterIntensity;
float deepFoamEnvelope = smoothstep(
    max(0.0, uRecuperationWaterDeepFoamThreshold - uRecuperationWaterDeepFoamSoftness),
    min(1.5, uRecuperationWaterDeepFoamThreshold + uRecuperationWaterDeepFoamSoftness),
    foamMask * uRecuperationWaterDeepFoamIntensity
);
float deepFoamMaskBinary = step(0.5, deepFoamEnvelope);
float foamMaskBinary = step(uRecuperationWaterFoamCutoff, foamMask);

// Les bords peuvent se teinter legerement vers la mousse profonde si on remonte le contraste.
float edgeMix = max(pow(abs((vRecuperationWaterUv.x - 0.5) * 2.0), 3.0), 0.0);
vec3 baseColor = mix(uRecuperationWaterBaseColor, uRecuperationWaterDeepFoamColor, edgeMix * uRecuperationWaterEdgeContrast);
vec3 deepFoamColor = mix(baseColor, uRecuperationWaterDeepFoamColor, deepFoamMaskBinary);
vec3 finalColor = mix(deepFoamColor, uRecuperationWaterSurfaceFoamColor, foamMaskBinary);
vec4 diffuseColor = vec4(clamp(finalColor, 0.0, 1.0), clamp(uOpacity, 0.0, 1.0));
