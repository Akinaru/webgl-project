export const fountainCartoonVertexShader = /* glsl */`
    varying vec2 vUv;
    varying vec3 vWorldPos;

    void main() {
        vUv = uv;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`

export const fountainCartoonFragmentShader = /* glsl */`
    uniform float uTime;
    uniform vec3 uDeepColor;
    uniform vec3 uShallowColor;
    uniform vec3 uFoamColor;
    uniform float uFlowSpeed;
    uniform float uRippleScale;
    uniform float uFoamThreshold;
    uniform float uOpacity;
    uniform float uIsVertical;

    varying vec2 vUv;
    varying vec3 vWorldPos;

    void main() {
        // Horizontal surfaces scroll in two directions, vertical (waterfall) falls down
        vec2 flowDir = mix(vec2(0.18, 0.28), vec2(0.0, 1.0), uIsVertical);
        vec2 scrolledUv = vUv + flowDir * uTime * uFlowSpeed;

        // Three overlapping sine waves at different angles → breaks up streaks
        float w1 = sin(scrolledUv.x * uRippleScale + uTime * 1.6) * 0.5 + 0.5;
        float w2 = sin(scrolledUv.y * uRippleScale * 1.3 - uTime * 2.1) * 0.5 + 0.5;
        float w3 = sin((scrolledUv.x * 0.7 - scrolledUv.y * 0.9) * uRippleScale * 1.1 + uTime * 0.9) * 0.5 + 0.5;
        float pattern = w1 * 0.38 + w2 * 0.32 + w3 * 0.30;

        // Hard cartoon step: two flat tones
        float toon = step(0.54, pattern);

        // Sharp foam highlight on peaks
        float foam = step(uFoamThreshold, pattern);

        vec3 color = mix(uDeepColor, uShallowColor, toon);
        color = mix(color, uFoamColor, foam);

        gl_FragColor = vec4(color, uOpacity);
    }
`
