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

// Conserve la decoupe via le masque et applique exactement la logique couleur/foam de waterfallStill.
// @diffuse
vec2 maskUv = vAlphaMapUv;
float maskValue = texture2D(uWaterMask, maskUv).g;

if(maskValue < 0.5)
{
    discard;
}

vec2 baseUv = vRecuperationWaterUv;
float edgeWidth = max(0.0001, uRecuperationWaterEdgeSoftness);
float distanceToCenter = abs((baseUv.x - 0.5) * 2.0);
float edgeFactor = smoothstep(max(0.0, 1.0 - edgeWidth), 1.0, distanceToCenter);
float xMix = pow(edgeFactor, max(0.0001, uRecuperationWaterEdgePower));
vec3 baseColor = mix(uRecuperationWaterColorB, uRecuperationWaterColorA, xMix);

vec2 foamUv = baseUv;
foamUv.x = abs(foamUv.x - 0.5) * 2.0;

vec2 uv3 = (foamUv - vec2(uRecuperationWaterTime * 0.05, 0.0)) * vec2(0.35, 0.96);
float noise3 = recuperationWaterVoronoi(uv3, 8.0);

vec2 uv4 = (foamUv - vec2(uRecuperationWaterTime * 0.041, 0.0)) * vec2(0.75, 1.28);
float noise4 = recuperationWaterVoronoi(uv4, 8.0);

float noiseFinal = min(noise3, noise4);
float stepThreshold = 1.0 - ((edgeFactor + 0.5) * 0.5);
float foamMix = step(stepThreshold, noiseFinal);

vec3 finalColor = mix(baseColor, vec3(1.0), foamMix);
vec4 diffuseColor = vec4(finalColor, clamp(uOpacity, 0.0, 1.0));
