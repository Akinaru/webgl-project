// Eau stagnante low poly cartoon: 3 bandes de couleur plates via step() + derive ultra-lente.
// 2 echantillons de bruit, zero domain warp, zero rotation.
// @header
varying vec2 vRecuperationWaterUv;
varying vec3 vRecuperationWaterWorldPosition;
uniform sampler2D uWaterMask;
uniform vec3 uWaterColorDeep;
uniform vec3 uWaterColorMid;
uniform vec3 uWaterColorLight;
uniform float uWaterTime;
uniform float uOpacity;
uniform float uWaterScale;
uniform float uWaterSpeed;
uniform float uWaterThresholdMid;
uniform float uWaterThresholdLight;

float waterHash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float waterNoise(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(waterHash(i),                waterHash(i + vec2(1.0, 0.0)), u.x),
        mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

// @diffuse
if(texture2D(uWaterMask, vAlphaMapUv).g < 0.5) discard;

vec2 worldUv = vRecuperationWaterWorldPosition.xz * uWaterScale;
vec2 drift = vec2(uWaterTime * uWaterSpeed, uWaterTime * uWaterSpeed * 0.6);

// Champ de bruit independant pour le mi-ton
float nMidA = waterNoise(worldUv + drift);
float nMidB = waterNoise(worldUv * 1.6 + vec2(3.7, 8.1) + drift * 0.4);
float noiseMid = clamp(nMidA * 0.6 + nMidB * 0.4, 0.0, 1.0);

// Champ de bruit independant pour le reflet (seed et echelle differents)
float nLightA = waterNoise(worldUv * 1.3 + vec2(11.4, -5.2) + drift * 0.7);
float nLightB = waterNoise(worldUv * 2.2 + vec2(-3.9, 14.6) + drift * 0.3);
float noiseLight = clamp(nLightA * 0.55 + nLightB * 0.45, 0.0, 1.0);

vec3 color = uWaterColorDeep;
color = mix(color, uWaterColorMid,   step(uWaterThresholdMid,   noiseMid));
color = mix(color, uWaterColorLight, step(uWaterThresholdLight, noiseLight));

float vx = abs(vRecuperationWaterUv.x - 0.5) * 2.0;
float vy = abs(vRecuperationWaterUv.y - 0.5) * 2.0;
color *= 1.0 - pow(max(vx, vy), 2.5) * 0.25;

vec4 diffuseColor = vec4(clamp(color, 0.0, 1.0), clamp(uOpacity, 0.0, 1.0));
