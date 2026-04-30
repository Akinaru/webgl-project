// Reproduction du rendu "waterfallStill" de folio-2025 pour le plan d eau.
// @header
varying vec2 vRecuperationWaterUv;
uniform sampler2D uWaterMask;
uniform vec3 uRecuperationWaterColorA;
uniform vec3 uRecuperationWaterColorB;
uniform float uRecuperationWaterEdgeSoftness;
uniform float uRecuperationWaterEdgePower;
uniform float uRecuperationWaterTime;
uniform float uOpacity;
uniform vec2 uWaterMaskTexelSize;

vec2 recuperationWaterHash(vec2 p)
{
    p = vec2(
        dot(p, vec2(127.1, 311.7)),
        dot(p, vec2(269.5, 183.3))
    );

    return fract(sin(p) * 43758.5453123);
}

float recuperationWaterVoronoi(vec2 inputUv, float repeat)
{
    vec2 repeatedUv = fract(inputUv) * repeat;
    vec2 cell = floor(repeatedUv);
    vec2 localUv = fract(repeatedUv);
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

float recuperationWaterMaskValue(vec2 uv)
{
    return texture2D(uWaterMask, clamp(uv, 0.0, 1.0)).g;
}

// Approxime la distance au bord a partir du masque alpha pour que le degrade
// suive la silhouette reelle de l eau plutot que l axe des UV du mesh.
float recuperationWaterEdgeProximity(vec2 maskUv)
{
    vec2 texelSize = max(uWaterMaskTexelSize, vec2(0.000001));
    float maxRadiusInTexels = mix(2.0, 48.0, clamp(uRecuperationWaterEdgeSoftness, 0.0, 1.0));
    float nearestBorder = 1.0;
    bool foundBorder = false;

    for(int stepIndex = 1; stepIndex <= 6; stepIndex++)
    {
        float stepRatio = float(stepIndex) / 6.0;
        float radius = maxRadiusInTexels * stepRatio;
        vec2 offsetA = vec2(radius, 0.0) * texelSize;
        vec2 offsetB = vec2(0.0, radius) * texelSize;
        vec2 offsetC = vec2(radius, radius) * texelSize;
        vec2 offsetD = vec2(radius, -radius) * texelSize;

        float sampleRight = recuperationWaterMaskValue(maskUv + offsetA);
        float sampleLeft = recuperationWaterMaskValue(maskUv - offsetA);
        float sampleUp = recuperationWaterMaskValue(maskUv + offsetB);
        float sampleDown = recuperationWaterMaskValue(maskUv - offsetB);
        float sampleDiagA = recuperationWaterMaskValue(maskUv + offsetC);
        float sampleDiagB = recuperationWaterMaskValue(maskUv - offsetC);
        float sampleDiagC = recuperationWaterMaskValue(maskUv + offsetD);
        float sampleDiagD = recuperationWaterMaskValue(maskUv - offsetD);

        bool isOutside = sampleRight < 0.5 ||
            sampleLeft < 0.5 ||
            sampleUp < 0.5 ||
            sampleDown < 0.5 ||
            sampleDiagA < 0.5 ||
            sampleDiagB < 0.5 ||
            sampleDiagC < 0.5 ||
            sampleDiagD < 0.5;

        if(isOutside)
        {
            nearestBorder = min(nearestBorder, stepRatio);
            foundBorder = true;
        }
    }

    if(!foundBorder)
    {
        return 0.0;
    }

    return 1.0 - nearestBorder;
}

// Conserve la decoupe via le masque et applique exactement la logique couleur/foam de waterfallStill.
// @diffuse
vec2 maskUv = vAlphaMapUv;
float maskValue = recuperationWaterMaskValue(maskUv);

if(maskValue < 0.5)
{
    discard;
}

vec2 baseUv = vRecuperationWaterUv;
float edgeFactor = recuperationWaterEdgeProximity(maskUv);
float xMix = pow(clamp(edgeFactor, 0.0, 1.0), max(0.0001, uRecuperationWaterEdgePower));
vec3 baseColor = mix(uRecuperationWaterColorB, uRecuperationWaterColorA, xMix);

vec2 foamUv = baseUv;
foamUv += vec2(maskUv.x * 0.3, maskUv.y * 0.3);

vec2 uv3 = (foamUv - vec2(uRecuperationWaterTime * 0.05, 0.0)) * vec2(0.35, 0.96);
float noise3 = recuperationWaterVoronoi(uv3, 8.0);

vec2 uv4 = (foamUv - vec2(uRecuperationWaterTime * 0.041, 0.0)) * vec2(0.75, 1.28);
float noise4 = recuperationWaterVoronoi(uv4, 8.0);

float noiseFinal = min(noise3, noise4);
float stepThreshold = 1.0 - ((edgeFactor + 0.5) * 0.5);
float foamMix = step(stepThreshold, noiseFinal);

vec3 finalColor = mix(baseColor, vec3(1.0), foamMix);
vec4 diffuseColor = vec4(finalColor, clamp(uOpacity, 0.0, 1.0));
