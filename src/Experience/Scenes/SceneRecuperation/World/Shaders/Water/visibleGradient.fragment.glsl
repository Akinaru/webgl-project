// Affiche simplement la texture du plan en niveaux de gris.
// @header
varying vec2 vRecuperationWaterUv;
uniform sampler2D uWaterMask;
uniform float uOpacity;
uniform float uDebugView;

// Affiche directement la valeur de texture du masque.
// @diffuse
vec2 maskUv = vAlphaMapUv;
float maskValue = texture2D(uWaterMask, maskUv).g;
vec3 color = vec3(maskValue);
vec4 diffuseColor = vec4(color, clamp(uOpacity, 0.0, 1.0));
