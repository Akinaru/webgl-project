// Texture dalles en espace monde (triplanaire) + FBM pour effacer les dalles par zones.
// Tous les paramètres sont exposés en uniforms pour un tweak total depuis le debug.
// @header
varying vec3 vWallWorldPos;
uniform sampler2D uWallSlabs;
uniform float uWallScale;
uniform float uWallNoiseScale;
uniform float uWallNoiseCoverage;
uniform float uWallNoiseTransition;
uniform float uWallSlabMin;
uniform float uWallSlabMax;
uniform float uWallTime;
uniform float uWallNoiseDriftSpeed;

float wallHash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float wallNoise(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(wallHash(i),                    wallHash(i + vec2(1.0, 0.0)), u.x),
        mix(wallHash(i + vec2(0.0, 1.0)),   wallHash(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

float wallFbm(vec2 p)
{
    float v = wallNoise(p)                           * 0.55;
    v      += wallNoise(p * 2.3 + vec2(5.1,  2.7))  * 0.30;
    v      += wallNoise(p * 5.2 + vec2(1.8, -3.4))  * 0.15;
    return v;
}

vec3 wallTriplanar(sampler2D tex, vec3 pos, vec3 n, float scale)
{
    vec3 blend = abs(n);
    blend = pow(blend, vec3(8.0));
    blend /= max(blend.x + blend.y + blend.z, 0.0001);

    vec3 xSide = texture2D(tex, pos.zy * scale).rgb;
    vec3 ySide = texture2D(tex, pos.xz * scale).rgb;
    vec3 zSide = texture2D(tex, pos.xy * scale).rgb;

    return xSide * blend.x + ySide * blend.y + zSide * blend.z;
}

// @diffuse
vec3 dX = dFdx(vWallWorldPos);
vec3 dY = dFdy(vWallWorldPos);
vec3 faceNormal = normalize(cross(dX, dY));

vec3 slabSample = wallTriplanar(uWallSlabs, vWallWorldPos, faceNormal, uWallScale);
float slabGray = dot(slabSample, vec3(0.299, 0.587, 0.114));

vec2 noiseOffset = vec2(uWallTime * uWallNoiseDriftSpeed, -uWallTime * uWallNoiseDriftSpeed * 0.6);
float noiseRaw = wallFbm((vWallWorldPos.xz * uWallNoiseScale) + noiseOffset);
float coverageThreshold = 1.0 - uWallNoiseCoverage;
float halfT = max(uWallNoiseTransition * 0.5, 0.001);
float noiseMask = smoothstep(coverageThreshold - halfT, coverageThreshold + halfT, noiseRaw);

float slabMod = mix(uWallSlabMin, uWallSlabMax, slabGray);
float finalMod = mix(1.0, slabMod, noiseMask);

vec3 wallColor = diffuse * finalMod;
vec4 diffuseColor = vec4(clamp(wallColor, 0.0, 1.0), opacity);
