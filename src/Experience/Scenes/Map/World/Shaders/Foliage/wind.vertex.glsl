// @header
uniform sampler2D uBushWindPerlinTexture;
uniform float uBushWindTime;
uniform float uBushWindFrequency;
uniform float uBushWindTimeScale;
uniform float uBushWindStrength;

// @begin
vec3 bushWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
vec2 bushPerlinUv = bushWorldPosition.xz * uBushWindFrequency;
bushPerlinUv += vec2(uBushWindTime * uBushWindTimeScale);
float bushPerlinValue = texture2D(uBushWindPerlinTexture, bushPerlinUv).r - 0.5;
float bushWindOffset = bushPerlinValue * bushWorldPosition.y * uBushWindStrength;
transformed.x += bushWindOffset;
transformed.z += bushWindOffset;
