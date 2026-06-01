uniform vec3 uColor;
uniform float uHaloIntensity;

varying float vGlow;

void main()
{
    float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
    if(distanceToCenter >= 0.5)
    {
        discard;
    }

    float core = smoothstep(0.28, 0.0, distanceToCenter);
    float halo = smoothstep(0.5, 0.08, distanceToCenter) * uHaloIntensity;
    float strength = (core + halo) * max(0.0, vGlow);

    gl_FragColor = vec4(uColor, strength);
}
