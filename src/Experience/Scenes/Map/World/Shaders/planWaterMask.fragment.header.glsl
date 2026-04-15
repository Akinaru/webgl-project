// Uniforms utilises pour ne rendre que les zones d eau du plan.
varying vec3 vMapPlanWorldPosition;
uniform float uMapPlanWaterLevel;
uniform vec3 uMapPlanWetColor;
uniform vec4 uMapPlanBounds;
uniform vec2 uMapPlanHeightRange;
uniform sampler2D uMapPlanHeightTexture;
