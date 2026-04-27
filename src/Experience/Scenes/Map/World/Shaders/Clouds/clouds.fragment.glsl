// Role: dessine des nuages proceduraux animes avec un bruit derive dans le temps.
// @header
uniform float uTime;
uniform float uCoverage;
uniform float uSoftness;
uniform float uDensity;
uniform float uOpacity;
uniform float uNoiseScale;
uniform float uDetailScale;
uniform float uDetailStrength;
uniform float uWarpScale;
uniform float uWarpStrength;
uniform float uWindSpeed;
uniform vec2 uWindDirection;
uniform float uEdgeFade;
uniform float uSunGlowStrength;
uniform vec3 uCloudColor;
uniform vec3 uShadowColor;
uniform vec3 uSunColor;
uniform vec3 uSunPosition;

varying vec2 vUv;
varying vec3 vWorldPosition;

float hash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise2d(vec2 p)
{
    vec2 grid = floor(p);
    vec2 local = fract(p);
    vec2 blend = local * local * (3.0 - (2.0 * local));

    float bottomLeft = hash(grid + vec2(0.0, 0.0));
    float bottomRight = hash(grid + vec2(1.0, 0.0));
    float topLeft = hash(grid + vec2(0.0, 1.0));
    float topRight = hash(grid + vec2(1.0, 1.0));

    float bottom = mix(bottomLeft, bottomRight, blend.x);
    float top = mix(topLeft, topRight, blend.x);
    return mix(bottom, top, blend.y);
}

float fbm(vec2 p)
{
    float value = 0.0;
    float amplitude = 0.5;

    for(int i = 0; i < 5; i++)
    {
        value += amplitude * noise2d(p);
        p = (p * 2.02) + vec2(17.13, 8.71);
        amplitude *= 0.5;
    }

    return value;
}

void main()
{
    vec2 windOffset = uWindDirection * (uTime * uWindSpeed);
    vec2 baseUv = vWorldPosition.xz * uNoiseScale;

    vec2 warpUv = (baseUv * uWarpScale) + (windOffset * 0.35);
    vec2 warp = vec2(
        fbm(warpUv + vec2(5.2, 1.3)),
        fbm(warpUv + vec2(11.8, 9.6))
    ) - 0.5;

    vec2 sampleUv = baseUv + windOffset + (warp * uWarpStrength);

    float primary = fbm(sampleUv);
    float detail = fbm((sampleUv * uDetailScale) - (windOffset * 1.35));
    float field = primary - ((detail - 0.5) * uDetailStrength);

    float threshold = mix(0.82, 0.28, clamp(uCoverage, 0.0, 1.0));
    float mask = smoothstep(
        threshold - uSoftness,
        threshold + uSoftness,
        field
    );

    float densityFactor = clamp(uDensity / 1.5, 0.0, 1.0);
    float density = clamp(
        (field - threshold + 0.5) * mix(0.65, 1.45, densityFactor),
        0.0,
        1.0
    );

    float edgeDistance = max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0;
    float edgeMask = 1.0 - smoothstep(
        max(0.0, 1.0 - uEdgeFade),
        1.0,
        edgeDistance
    );

    float alpha = mask * density * edgeMask * uOpacity;
    if(alpha <= 0.001)
    {
        discard;
    }

    vec3 toSun = normalize(uSunPosition - vWorldPosition);
    float sunFacing = clamp((toSun.y * 0.5) + 0.5, 0.0, 1.0);
    float sunGlow = pow(mask, 0.55) * (1.0 - density) * sunFacing * uSunGlowStrength;

    float lightMix = smoothstep(0.12, 0.85, density);
    vec3 baseColor = mix(uShadowColor, uCloudColor, lightMix);
    vec3 color = mix(baseColor, uSunColor, sunGlow);

    gl_FragColor = vec4(color, alpha);
}
