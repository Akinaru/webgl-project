uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTimeScale;
uniform float uScaleTimeBoost;
uniform float uSwayXAmplitude;
uniform float uSwayZAmplitude;
uniform float uSwayYAmplitude;
uniform float uSwayXSpeed;
uniform float uSwayZSpeed;
uniform float uSwayYSpeed;

attribute float aScale;
attribute float aPhase;

varying float vGlow;

void main()
{
    vec3 displacedPosition = position;
    float time = uTime * (uTimeScale + (aScale * uScaleTimeBoost)) + (aPhase * 6.2831853);

    displacedPosition.x += sin(time * uSwayXSpeed) * (uSwayXAmplitude + (aScale * uSwayXAmplitude));
    displacedPosition.z += cos(time * uSwayZSpeed) * (uSwayZAmplitude + (aScale * uSwayZAmplitude));
    displacedPosition.y += sin(time * uSwayYSpeed + position.x * 1.7) * (0.08 + (aScale * uSwayYAmplitude));

    vec4 modelPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;

    gl_Position = projectedPosition;

    float fogFade = 1.0 - smoothstep(uFogNear, uFogFar, -viewPosition.z);
    vGlow = fogFade;

    gl_PointSize = uSize * aScale * uPixelRatio;
    gl_PointSize *= (1.0 / max(0.1, -viewPosition.z));
    gl_PointSize *= mix(0.75, 1.15, vGlow);
}
