// Melange la couleur du relief avec une teinte eau selon la hauteur locale.
float shallowMask = 1.0 - smoothstep(uMapWaterlineMinY - 0.18, uMapWaterlineMinY + 0.18, vMapWorldPosition.y);
float deepMask = 1.0 - smoothstep(uMapWaterlineDeepY - 0.18, uMapWaterlineDeepY + 0.18, vMapWorldPosition.y);
vec3 depthTint = mix(uMapWaterlineShallowColor, uMapWaterlineDeepColor, clamp(deepMask, 0.0, 1.0));
vec3 terrainColor = mix(diffuse, depthTint, clamp(shallowMask, 0.0, 1.0));
vec4 diffuseColor = vec4(terrainColor, opacity);
