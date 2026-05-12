import * as THREE from 'three'
import * as SceneRecuperationTubeWaterControllerConstants from '../TubeWaterController.constants.js'
import { setupSceneRecuperationTubeWaterControllerDebug } from '../TubeWaterController.debug.js'

export function applySharedWaterColors()
{
    const baseColor = this.sharedWaterColors?.baseColor ?? SceneRecuperationTubeWaterControllerConstants.CONNECTED_COLOR
    const deepFoamColor = this.sharedWaterColors?.deepFoamColor ?? SceneRecuperationTubeWaterControllerConstants.CONNECTED_EMISSIVE
    const surfaceFoamColor = this.sharedWaterColors?.surfaceFoamColor ?? this.waterShader.foamColor

    this.waterShader.foamColor = surfaceFoamColor
    this.foamColor.set(surfaceFoamColor)
    this.setTubeFlowColor(baseColor, deepFoamColor)
}


export function setDebug()
{
    setupSceneRecuperationTubeWaterControllerDebug.call(this)
}


export function captureInitialRotations()
{
    this.initialRotationByTubeUuid.clear()
    this.quarterTurnsFromInitialByTubeUuid.clear()

    for(const target of this.rotationTargets)
    {
        if(!target)
        {
            continue
        }

        this.initialRotationByTubeUuid.set(
            target.uuid,
            this.normalizeAngle(target.rotation[SceneRecuperationTubeWaterControllerConstants.ROTATION_AXIS] || 0)
        )
        this.quarterTurnsFromInitialByTubeUuid.set(target.uuid, 0)
    }
}


export function setupTubeMaterials()
{
    this.tubeMeshesByTargetUuid.clear()

    for(const mesh of this.tubeMeshes)
    {
        if(!(mesh instanceof THREE.Mesh))
        {
            continue
        }

        const target = this.recuperationModel?.getTubeWaterRotationTargetFromObject?.(mesh) ?? mesh
        if(!target)
        {
            continue
        }

        if(!this.tubeMeshesByTargetUuid.has(target.uuid))
        {
            this.tubeMeshesByTargetUuid.set(target.uuid, [])
        }
        this.tubeMeshesByTargetUuid.get(target.uuid).push(mesh)

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const clonedMaterials = materials.map((material) => material?.clone?.() ?? material)
        mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0]
        if(mesh.geometry?.clone)
        {
            mesh.geometry = mesh.geometry.clone()
        }

        this.setupFlowCoordAttribute(mesh, target.uuid)

        for(const material of clonedMaterials)
        {
            this.setupFlowShaderMaterial(material, mesh, target)
        }
    }
}


export function setupBlueWindowMeshes()
{
    this.blueWindowMeshes = []
    this.blueWindowMeshesByName.clear()
    this.blueWindowShaderMaterialsByMeshUuid.clear()
    this.blueWindowFlowProgressByName.clear()

    const root = this.recuperationModel?.model
    if(!root)
    {
        return
    }

    let genericBlueWindowCount = 0
    root.traverse((child) =>
    {
        if(!(child instanceof THREE.Mesh))
        {
            return
        }

        const normalizedName = this.normalizeObjectName(child.name || '')
        if(!SceneRecuperationTubeWaterControllerConstants.BLUE_WINDOW_NAME_PATTERN.test(normalizedName))
        {
            return
        }

        const materials = Array.isArray(child.material) ? child.material : [child.material]
        const clonedMaterials = materials.map((material) => material?.clone?.() ?? material)
        child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0]
        if(child.geometry?.clone)
        {
            child.geometry = child.geometry.clone()
        }

        this.setupBlueWindowCoordAttribute(child)
        for(const material of clonedMaterials)
        {
            this.setupBlueWindowShaderMaterial(material, child)
        }

        this.blueWindowMeshes.push(child)

        let windowKey = normalizedName
        if(normalizedName === 'fenetre-blue')
        {
            windowKey = genericBlueWindowCount === 0
                ? 'fenetre-blue'
                : `fenetre-blue_${genericBlueWindowCount}`
            genericBlueWindowCount++
        }

        if(!this.blueWindowMeshesByName.has(windowKey))
        {
            this.blueWindowMeshesByName.set(windowKey, [])
        }
        this.blueWindowMeshesByName.get(windowKey).push(child)
    })
}


export function setupBlueWindowCoordAttribute(mesh)
{
    const geometry = mesh?.geometry
    const position = geometry?.attributes?.position
    if(!geometry || !position)
    {
        return
    }

    if(!geometry.boundingBox)
    {
        geometry.computeBoundingBox?.()
    }

    const bounds = geometry.boundingBox
    if(!bounds)
    {
        return
    }

    const minCoord = bounds.min[SceneRecuperationTubeWaterControllerConstants.WINDOW_FLOW_AXIS]
    const maxCoord = bounds.max[SceneRecuperationTubeWaterControllerConstants.WINDOW_FLOW_AXIS]
    const range = maxCoord - minCoord
    if(!(Number.isFinite(range) && range > 1e-5))
    {
        return
    }

    const coordValues = new Float32Array(position.count)
    for(let index = 0; index < position.count; index++)
    {
        const axisValue = position.getX(index)
        coordValues[index] = THREE.MathUtils.clamp((axisValue - minCoord) / range, 0, 1)
    }

    geometry.setAttribute(SceneRecuperationTubeWaterControllerConstants.WINDOW_COORD_ATTRIBUTE, new THREE.BufferAttribute(coordValues, 1))
    geometry.attributes[SceneRecuperationTubeWaterControllerConstants.WINDOW_COORD_ATTRIBUTE].needsUpdate = true
}


export function setupBlueWindowShaderMaterial(material, mesh)
{
    if(!material || typeof material.onBeforeCompile !== 'function')
    {
        return
    }

    const geometry = mesh?.geometry
    if(!geometry?.attributes?.[SceneRecuperationTubeWaterControllerConstants.WINDOW_COORD_ATTRIBUTE] || !geometry.attributes?.position)
    {
        return
    }

    const windowUniforms = {
        uWindowProgress: { value: 0 },
        uWindowDisconnectedColor: { value: this.disconnectedColor.clone() },
        uWindowConnectedColor: { value: this.windowConnectedColor.clone() },
        uWindowConnectedEmissiveColor: { value: this.windowConnectedEmissiveColor.clone() },
        uWindowEmissiveIntensity: { value: 0.68 }
    }
    material.userData.windowFlowUniforms = windowUniforms

    const previousOnBeforeCompile = material.onBeforeCompile
    material.onBeforeCompile = (shader, renderer) =>
    {
        previousOnBeforeCompile?.(shader, renderer)

        shader.uniforms.uWindowProgress = windowUniforms.uWindowProgress
        shader.uniforms.uWindowDisconnectedColor = windowUniforms.uWindowDisconnectedColor
        shader.uniforms.uWindowConnectedColor = windowUniforms.uWindowConnectedColor
        shader.uniforms.uWindowConnectedEmissiveColor = windowUniforms.uWindowConnectedEmissiveColor
        shader.uniforms.uWindowEmissiveIntensity = windowUniforms.uWindowEmissiveIntensity

        if(shader.vertexShader.includes('#include <begin_vertex>'))
        {
            shader.vertexShader = shader.vertexShader
                .replace(
                    'void main() {',
                    `attribute float ${SceneRecuperationTubeWaterControllerConstants.WINDOW_COORD_ATTRIBUTE};
varying float vWindowCoord;
void main() {`
                )
                .replace(
                    '#include <begin_vertex>',
                    `#include <begin_vertex>
vWindowCoord = ${SceneRecuperationTubeWaterControllerConstants.WINDOW_COORD_ATTRIBUTE};`
                )
        }

        if(shader.fragmentShader.includes('#include <color_fragment>'))
        {
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    'void main() {',
                    `varying float vWindowCoord;
uniform float uWindowProgress;
uniform vec3 uWindowDisconnectedColor;
uniform vec3 uWindowConnectedColor;
uniform vec3 uWindowConnectedEmissiveColor;
uniform float uWindowEmissiveIntensity;
void main() {`
                )
                .replace(
                    '#include <color_fragment>',
                    `#include <color_fragment>
float windowFillMask = step(vWindowCoord, uWindowProgress);
diffuseColor.rgb = mix(uWindowDisconnectedColor, uWindowConnectedColor, windowFillMask);`
                )
                .replace(
                    '#include <emissivemap_fragment>',
                    `#include <emissivemap_fragment>
totalEmissiveRadiance = mix(vec3(0.0), uWindowConnectedEmissiveColor * uWindowEmissiveIntensity, windowFillMask);`
                )
        }
    }

    material.customProgramCacheKey = () => `${material.type}_windowFlow`
    material.needsUpdate = true

    if(!this.blueWindowShaderMaterialsByMeshUuid.has(mesh.uuid))
    {
        this.blueWindowShaderMaterialsByMeshUuid.set(mesh.uuid, [])
    }
    this.blueWindowShaderMaterialsByMeshUuid.get(mesh.uuid).push(material)
}


export function setupFlowShaderMaterial(material, mesh, tubeTarget)
{
    if(!material || typeof material.onBeforeCompile !== 'function')
    {
        return
    }

    const tubeUuid = tubeTarget?.uuid ?? mesh?.uuid

    const geometry = mesh?.geometry
    if(!geometry?.attributes?.position)
    {
        return
    }

    if(!geometry.boundingBox)
    {
        geometry.computeBoundingBox?.()
    }

    const bounds = geometry.boundingBox
    if(!bounds)
    {
        return
    }

    const min = bounds.min[SceneRecuperationTubeWaterControllerConstants.FLOW_AXIS]
    const max = bounds.max[SceneRecuperationTubeWaterControllerConstants.FLOW_AXIS]
    const range = max - min
    if(!(Number.isFinite(range) && range > 1e-5))
    {
        return
    }

    const patternSeed = this.hashStringToUnit(tubeUuid)
    const worldSeedX = this.hashStringToUnit(`${tubeUuid}:x`)
    const worldSeedY = this.hashStringToUnit(`${tubeUuid}:y`)
    this.getWorldCenter(tubeTarget ?? mesh, this.patternWorldCenter)
    this.patternOffset.set(
        (this.patternWorldCenter.x * 0.37) + ((worldSeedX - 0.5) * 8.0),
        (this.patternWorldCenter.z * 0.41) + ((worldSeedY - 0.5) * 8.0)
    )

    const flowUniforms = {
        uFlowProgress: { value: 0 },
        uFlowTime: { value: 0 },
        uPatternPhase: { value: patternSeed * 6.283185307179586 },
        uPatternOffset: { value: this.patternOffset.clone() },
        uFlowDirection: { value: 1 },
        uFlowDualSided: { value: 0 },
        uFlowFeather: { value: 0.05 },
        uFlowMin: { value: min },
        uFlowRange: { value: range },
        uFlowDisconnectedColor: { value: this.disconnectedColor.clone() },
        uFlowConnectedColor: { value: this.tubeConnectedColor.clone() },
        uFlowConnectedEmissiveColor: { value: this.tubeConnectedEmissiveColor.clone() },
        uFlowEmissiveIntensity: { value: 0.68 },
        uFoamRotation: { value: this.waterShader.foamRotation },
        uFoamScalePrimary: { value: this.waterShader.foamScalePrimary },
        uFoamScaleSecondary: { value: this.waterShader.foamScaleSecondary },
        uBodyScale: { value: this.waterShader.bodyScale },
        uRepeatNoiseScale: { value: this.waterShader.repeatNoiseScale },
        uRepeatNoiseStrength: { value: this.waterShader.repeatNoiseStrength },
        uFoamThresholdMin: { value: this.waterShader.foamThresholdMin },
        uFoamThresholdMax: { value: this.waterShader.foamThresholdMax },
        uFoamMix: { value: this.waterShader.foamMix },
        uFoamOpacity: { value: this.waterShader.foamOpacity },
        uFrontOpacity: { value: this.waterShader.frontOpacity },
        uFrontWidthSingle: { value: this.waterShader.frontWidthSingle },
        uFrontWidthDual: { value: this.waterShader.frontWidthDual },
        uWaterShadowStrength: { value: this.waterShader.waterShadowStrength },
        uWaterMidLow: { value: this.waterShader.waterMidLow },
        uWaterMidHigh: { value: this.waterShader.waterMidHigh },
        uWaterHighlightMix: { value: this.waterShader.waterHighlightMix },
        uBodyBlendBase: { value: this.waterShader.bodyBlendBase },
        uBodyBlendGain: { value: this.waterShader.bodyBlendGain },
        uEmissiveBase: { value: this.waterShader.emissiveBase },
        uEmissiveFoam: { value: this.waterShader.emissiveFoam },
        uEmissiveFront: { value: this.waterShader.emissiveFront },
        uFoamColor: { value: this.foamColor.clone() }
    }

    material.userData.flowUniforms = flowUniforms

    const previousOnBeforeCompile = material.onBeforeCompile
    material.onBeforeCompile = (shader, renderer) =>
    {
        previousOnBeforeCompile?.(shader, renderer)

        shader.uniforms.uFlowProgress = flowUniforms.uFlowProgress
        shader.uniforms.uFlowTime = flowUniforms.uFlowTime
        shader.uniforms.uPatternPhase = flowUniforms.uPatternPhase
        shader.uniforms.uPatternOffset = flowUniforms.uPatternOffset
        shader.uniforms.uFlowDirection = flowUniforms.uFlowDirection
        shader.uniforms.uFlowDualSided = flowUniforms.uFlowDualSided
        shader.uniforms.uFlowFeather = flowUniforms.uFlowFeather
        shader.uniforms.uFlowMin = flowUniforms.uFlowMin
        shader.uniforms.uFlowRange = flowUniforms.uFlowRange
        shader.uniforms.uFlowDisconnectedColor = flowUniforms.uFlowDisconnectedColor
        shader.uniforms.uFlowConnectedColor = flowUniforms.uFlowConnectedColor
        shader.uniforms.uFlowConnectedEmissiveColor = flowUniforms.uFlowConnectedEmissiveColor
        shader.uniforms.uFlowEmissiveIntensity = flowUniforms.uFlowEmissiveIntensity
        shader.uniforms.uFoamRotation = flowUniforms.uFoamRotation
        shader.uniforms.uFoamScalePrimary = flowUniforms.uFoamScalePrimary
        shader.uniforms.uFoamScaleSecondary = flowUniforms.uFoamScaleSecondary
        shader.uniforms.uBodyScale = flowUniforms.uBodyScale
        shader.uniforms.uRepeatNoiseScale = flowUniforms.uRepeatNoiseScale
        shader.uniforms.uRepeatNoiseStrength = flowUniforms.uRepeatNoiseStrength
        shader.uniforms.uFoamThresholdMin = flowUniforms.uFoamThresholdMin
        shader.uniforms.uFoamThresholdMax = flowUniforms.uFoamThresholdMax
        shader.uniforms.uFoamMix = flowUniforms.uFoamMix
        shader.uniforms.uFoamOpacity = flowUniforms.uFoamOpacity
        shader.uniforms.uFrontOpacity = flowUniforms.uFrontOpacity
        shader.uniforms.uFrontWidthSingle = flowUniforms.uFrontWidthSingle
        shader.uniforms.uFrontWidthDual = flowUniforms.uFrontWidthDual
        shader.uniforms.uWaterShadowStrength = flowUniforms.uWaterShadowStrength
        shader.uniforms.uWaterMidLow = flowUniforms.uWaterMidLow
        shader.uniforms.uWaterMidHigh = flowUniforms.uWaterMidHigh
        shader.uniforms.uWaterHighlightMix = flowUniforms.uWaterHighlightMix
        shader.uniforms.uBodyBlendBase = flowUniforms.uBodyBlendBase
        shader.uniforms.uBodyBlendGain = flowUniforms.uBodyBlendGain
        shader.uniforms.uEmissiveBase = flowUniforms.uEmissiveBase
        shader.uniforms.uEmissiveFoam = flowUniforms.uEmissiveFoam
        shader.uniforms.uEmissiveFront = flowUniforms.uEmissiveFront
        shader.uniforms.uFoamColor = flowUniforms.uFoamColor

        if(shader.vertexShader.includes('#include <begin_vertex>'))
        {
            shader.vertexShader = shader.vertexShader
                .replace(
                    'void main() {',
                    `attribute float ${SceneRecuperationTubeWaterControllerConstants.FLOW_COORD_ATTRIBUTE};
varying float vFlowCoord;
varying vec3 vFlowLocalPosition;
void main() {`
                )
                .replace(
                    '#include <begin_vertex>',
                    `#include <begin_vertex>
vFlowCoord = clamp(${SceneRecuperationTubeWaterControllerConstants.FLOW_COORD_ATTRIBUTE}, 0.0, 1.0);
vFlowLocalPosition = position;`
                )
        }

        let flowFragmentShader = shader.fragmentShader
            .replace(
                'void main() {',
                `varying float vFlowCoord;
varying vec3 vFlowLocalPosition;
uniform float uFlowProgress;
uniform float uFlowTime;
uniform float uPatternPhase;
uniform vec2 uPatternOffset;
uniform float uFlowDirection;
uniform float uFlowDualSided;
uniform float uFlowFeather;
uniform vec3 uFlowDisconnectedColor;
uniform vec3 uFlowConnectedColor;
uniform vec3 uFlowConnectedEmissiveColor;
uniform float uFlowEmissiveIntensity;
uniform float uFoamRotation;
uniform float uFoamScalePrimary;
uniform float uFoamScaleSecondary;
uniform float uBodyScale;
uniform float uRepeatNoiseScale;
uniform float uRepeatNoiseStrength;
uniform float uFoamThresholdMin;
uniform float uFoamThresholdMax;
uniform float uFoamMix;
uniform float uFoamOpacity;
uniform float uFrontOpacity;
uniform float uFrontWidthSingle;
uniform float uFrontWidthDual;
uniform float uWaterShadowStrength;
uniform float uWaterMidLow;
uniform float uWaterMidHigh;
uniform float uWaterHighlightMix;
uniform float uBodyBlendBase;
uniform float uBodyBlendGain;
uniform float uEmissiveBase;
uniform float uEmissiveFoam;
uniform float uEmissiveFront;
uniform vec3 uFoamColor;

float hash21(vec2 p)
{
p = fract(p * vec2(234.34, 435.345));
p += dot(p, p + 34.23);
return fract(p.x * p.y);
}

float noise21(vec2 p)
{
vec2 i = floor(p);
vec2 f = fract(p);
f = f * f * (3.0 - 2.0 * f);

float a = hash21(i);
float b = hash21(i + vec2(1.0, 0.0));
float c = hash21(i + vec2(0.0, 1.0));
float d = hash21(i + vec2(1.0, 1.0));

return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

mat2 rotation2d(float angle)
{
float s = sin(angle);
float c = cos(angle);
return mat2(c, -s, s, c);
}

void main() {`
            )

        const hasDiffuseLine = flowFragmentShader.includes('vec4 diffuseColor = vec4( diffuse, opacity );')
        if(hasDiffuseLine)
        {
            flowFragmentShader = flowFragmentShader.replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                `float flowEdge = max(0.0001, uFlowFeather);
float flowProgress = clamp(uFlowProgress, 0.0, 1.0);
float flowCoordSingle = uFlowDirection >= 0.0 ? vFlowCoord : (1.0 - vFlowCoord);
float flowFillSingle = 1.0 - smoothstep(flowProgress - flowEdge, flowProgress, flowCoordSingle);
float flowCoordDual = min(vFlowCoord, 1.0 - vFlowCoord);
float flowFillDual = 1.0 - smoothstep((flowProgress * 0.5) - flowEdge, (flowProgress * 0.5), flowCoordDual);
float dualFillCompleted = step(0.9999, flowProgress);
flowFillDual = mix(flowFillDual, 1.0, dualFillCompleted);
float flowFill = mix(flowFillSingle, flowFillDual, step(0.5, uFlowDualSided));

float animatedFlowCoord = (uFlowDirection >= 0.0 ? vFlowCoord : (1.0 - vFlowCoord));
vec2 baseUv = vec2(
(vFlowLocalPosition.x + vFlowLocalPosition.z) * 1.9,
(animatedFlowCoord * 6.0) - uFlowTime + uPatternPhase
);
baseUv += uPatternOffset;
vec2 clayUv = rotation2d(uFoamRotation) * baseUv;
float foamNoiseA = noise21(clayUv * uFoamScalePrimary);
float foamNoiseB = noise21((clayUv + vec2(4.2, -1.7)) * uFoamScaleSecondary);
float repeatNoise = noise21((rotation2d(uFoamRotation * 0.5) * (baseUv + vec2(1.7, -3.4))) * uRepeatNoiseScale);
float foamNoise = mix(foamNoiseA, foamNoiseB, clamp(uFoamMix, 0.0, 1.0));
foamNoise = mix(foamNoise, foamNoise * repeatNoise, clamp(uRepeatNoiseStrength, 0.0, 1.0));
float foamMask = smoothstep(uFoamThresholdMin, max(uFoamThresholdMin + 0.0001, uFoamThresholdMax), foamNoise);
float bodyBreakup = noise21((clayUv + vec2(-2.6, 3.1)) * uBodyScale);

float frontSingle = 1.0 - smoothstep(0.0, uFrontWidthSingle, abs(flowCoordSingle - flowProgress));
float frontDual = 1.0 - smoothstep(0.0, uFrontWidthDual, abs(flowCoordDual - (flowProgress * 0.5)));
float flowFront = mix(frontSingle, frontDual, step(0.5, uFlowDualSided));

vec3 waterShadow = uFlowConnectedColor * uWaterShadowStrength;
vec3 waterMid = mix(uFlowConnectedColor * uWaterMidLow, uFlowConnectedColor * uWaterMidHigh, bodyBreakup);
vec3 waterHighlight = mix(uFlowConnectedColor, uFoamColor, uWaterHighlightMix);
vec3 stylizedWater = mix(waterShadow, waterMid, uBodyBlendBase + (bodyBreakup * uBodyBlendGain));
stylizedWater = mix(stylizedWater, uFoamColor, foamMask * uFoamOpacity);
stylizedWater += waterHighlight * flowFront * uFrontOpacity;

vec3 flowBaseColor = mix(uFlowDisconnectedColor, stylizedWater, flowFill);
vec4 diffuseColor = vec4(flowBaseColor, opacity);`
            )
        }

        if(hasDiffuseLine && flowFragmentShader.includes('vec3 totalEmissiveRadiance = emissive;'))
        {
            flowFragmentShader = flowFragmentShader.replace(
                'vec3 totalEmissiveRadiance = emissive;',
                `float emissiveFoam = foamMask * uEmissiveFoam;
float emissiveFront = flowFront * uEmissiveFront;
vec3 totalEmissiveRadiance = uFlowConnectedEmissiveColor * (uFlowEmissiveIntensity * flowFill) * (uEmissiveBase + emissiveFoam + emissiveFront);`
            )
        }

        shader.fragmentShader = flowFragmentShader
    }

    const previousProgramCacheKey = material.customProgramCacheKey?.bind(material)
    material.customProgramCacheKey = () =>
    {
        const previousKey = previousProgramCacheKey ? previousProgramCacheKey() : ''
        return `${previousKey}|recuperation-flow-fill-v2`
    }

    material.needsUpdate = true

    if(!this.flowShaderMaterialsByTubeUuid.has(tubeUuid))
    {
        this.flowShaderMaterialsByTubeUuid.set(tubeUuid, [])
    }
    this.flowShaderMaterialsByTubeUuid.get(tubeUuid).push(material)
}


export function setupFlowCoordAttribute(mesh, tubeUuid)
{
    const geometry = mesh?.geometry
    const positionAttribute = geometry?.attributes?.position
    if(!geometry || !positionAttribute)
    {
        return
    }

    if(!geometry.boundingBox)
    {
        geometry.computeBoundingBox?.()
    }

    const bounds = geometry.boundingBox
    if(!bounds)
    {
        return
    }

    const min = bounds.min[SceneRecuperationTubeWaterControllerConstants.FLOW_AXIS]
    const max = bounds.max[SceneRecuperationTubeWaterControllerConstants.FLOW_AXIS]
    const range = max - min
    const hasAxisRange = Number.isFinite(range) && range > SceneRecuperationTubeWaterControllerConstants.FLOW_COORD_EPSILON

    const isAngleTube = this.isAngleTube(tubeUuid)
    if(!hasAxisRange && !isAngleTube)
    {
        return
    }

    const angleProjection = isAngleTube
        ? this.computeAngleFlowProjection(positionAttribute, bounds)
        : null
    const joinGuidedAngleProjection = angleProjection
        ? this.refineAngleFlowProjectionWithTubeJoins(angleProjection, mesh, tubeUuid, bounds)
        : null
    const effectiveAngleProjection = joinGuidedAngleProjection ?? angleProjection
    const flowProjection = angleProjection
        ? {
            type: 'angle',
            cornerX: effectiveAngleProjection.cornerX,
            cornerY: effectiveAngleProjection.cornerY,
            angleMin: effectiveAngleProjection.angleMin,
            angleRange: effectiveAngleProjection.angleRange,
            radiusMin: effectiveAngleProjection.radiusMin,
            radiusRange: effectiveAngleProjection.radiusRange
        }
        : {
            type: 'axis',
            min,
            range: Math.max(range, SceneRecuperationTubeWaterControllerConstants.FLOW_COORD_EPSILON)
        }
    geometry.userData.flowProjection = flowProjection

    const flowCoordArray = new Float32Array(positionAttribute.count)
    for(let index = 0; index < positionAttribute.count; index++)
    {
        let flowCoord
        if(angleProjection)
        {
            const x = positionAttribute.getX(index)
            const y = positionAttribute.getY(index)
            const dx = x - effectiveAngleProjection.cornerX
            const dy = y - effectiveAngleProjection.cornerY
            const theta = Math.atan2(dy, dx)
            flowCoord = this.getAngleArcProgress(theta, effectiveAngleProjection.angleMin, effectiveAngleProjection.angleRange)
        }
        else
        {
            const axisValue = positionAttribute.getY(index)
            flowCoord = (axisValue - min) / Math.max(range, SceneRecuperationTubeWaterControllerConstants.FLOW_COORD_EPSILON)
        }

        flowCoordArray[index] = THREE.MathUtils.clamp(flowCoord, 0, 1)
    }

    geometry.setAttribute(SceneRecuperationTubeWaterControllerConstants.FLOW_COORD_ATTRIBUTE, new THREE.BufferAttribute(flowCoordArray, 1))
}


export function hashStringToUnit(value = '')
{
    let hash = 2166136261
    const input = String(value)

    for(let index = 0; index < input.length; index++)
    {
        hash ^= input.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }

    return ((hash >>> 0) % 1000000) / 1000000
}


export function computeAngleFlowProjection(positionAttribute, bounds)
{
    const corners = [
        [bounds.min.x, bounds.min.y],
        [bounds.min.x, bounds.max.y],
        [bounds.max.x, bounds.min.y],
        [bounds.max.x, bounds.max.y]
    ]

    let bestProjection = null
    for(const [cornerX, cornerY] of corners)
    {
        let angleMin = Number.POSITIVE_INFINITY
        let angleMax = Number.NEGATIVE_INFINITY
        let radiusMin = Number.POSITIVE_INFINITY
        let radiusMax = Number.NEGATIVE_INFINITY

        for(let index = 0; index < positionAttribute.count; index++)
        {
            const dx = positionAttribute.getX(index) - cornerX
            const dy = positionAttribute.getY(index) - cornerY
            const angle = Math.atan2(dy, dx)
            const radius = Math.sqrt((dx * dx) + (dy * dy))
            if(angle < angleMin)
            {
                angleMin = angle
            }
            if(angle > angleMax)
            {
                angleMax = angle
            }
            if(radius < radiusMin)
            {
                radiusMin = radius
            }
            if(radius > radiusMax)
            {
                radiusMax = radius
            }
        }

        const angleRange = angleMax - angleMin
        if(!(Number.isFinite(angleRange) && angleRange >= SceneRecuperationTubeWaterControllerConstants.ANGLE_FLOW_MIN_SPAN && angleRange <= SceneRecuperationTubeWaterControllerConstants.ANGLE_FLOW_MAX_SPAN))
        {
            continue
        }

        const radiusRange = radiusMax - radiusMin
        if(!(Number.isFinite(radiusRange) && radiusRange > SceneRecuperationTubeWaterControllerConstants.FLOW_COORD_EPSILON))
        {
            continue
        }

        if(!bestProjection || radiusRange > bestProjection.radiusRange)
        {
            bestProjection = {
                cornerX,
                cornerY,
                angleMin,
                angleRange,
                radiusMin,
                radiusRange
            }
        }
    }

    return bestProjection
}


export function refineAngleFlowProjectionWithTubeJoins(angleProjection, mesh, tubeUuid, bounds)
{
    if(!angleProjection || !mesh || !tubeUuid || !bounds)
    {
        return angleProjection
    }

    const localJoinCenters = this.getTubeJoinCentersInMeshLocal(mesh, tubeUuid)
    if(localJoinCenters.length < 2)
    {
        return angleProjection
    }

    let maxDistanceSq = -Infinity
    let joinA = null
    let joinB = null
    for(let i = 0; i < localJoinCenters.length; i++)
    {
        for(let j = i + 1; j < localJoinCenters.length; j++)
        {
            const dx = localJoinCenters[i].x - localJoinCenters[j].x
            const dy = localJoinCenters[i].y - localJoinCenters[j].y
            const dz = localJoinCenters[i].z - localJoinCenters[j].z
            const distanceSq = (dx * dx) + (dy * dy) + (dz * dz)
            if(distanceSq <= maxDistanceSq)
            {
                continue
            }
            maxDistanceSq = distanceSq
            joinA = localJoinCenters[i]
            joinB = localJoinCenters[j]
        }
    }

    if(!joinA || !joinB)
    {
        return angleProjection
    }

    const corners = [
        { x: bounds.min.x, y: bounds.min.y },
        { x: bounds.min.x, y: bounds.max.y },
        { x: bounds.max.x, y: bounds.min.y },
        { x: bounds.max.x, y: bounds.max.y }
    ]

    let bestProjection = null
    let bestScore = Number.POSITIVE_INFINITY
    for(const corner of corners)
    {
        const angleAReal = Math.atan2(joinA.y - corner.y, joinA.x - corner.x)
        const angleBReal = Math.atan2(joinB.y - corner.y, joinB.x - corner.x)
        let delta = Math.atan2(Math.sin(angleBReal - angleAReal), Math.cos(angleBReal - angleAReal))
        let angleMin = angleAReal
        if(delta < 0)
        {
            angleMin = angleBReal
            delta = -delta
        }

        if(!(Number.isFinite(delta) && delta > SceneRecuperationTubeWaterControllerConstants.FLOW_COORD_EPSILON))
        {
            continue
        }

        const radiusA = Math.sqrt(((joinA.x - corner.x) ** 2) + ((joinA.y - corner.y) ** 2))
        const radiusB = Math.sqrt(((joinB.x - corner.x) ** 2) + ((joinB.y - corner.y) ** 2))
        const radiusMismatch = Math.abs(radiusA - radiusB)
        const quarterTurnDelta = Math.abs(delta - (Math.PI * 0.5))
        const score = (radiusMismatch * 2.5) + quarterTurnDelta
        if(score >= bestScore)
        {
            continue
        }
        bestScore = score

        bestProjection = {
            ...angleProjection,
            cornerX: corner.x,
            cornerY: corner.y,
            angleMin,
            angleRange: delta,
            isJoinGuided: true
        }
    }

    return bestProjection ?? angleProjection
}


export function getTubeJoinCentersInMeshLocal(mesh, tubeUuid)
{
    const joinTargets = this.joinTargetsByTubeUuid.get(tubeUuid) ?? []
    if(joinTargets.length === 0)
    {
        return []
    }

    const objectBounds = new THREE.Box3()
    const worldCenter = new THREE.Vector3()
    const localCenter = new THREE.Vector3()
    const centers = []

    mesh.updateMatrixWorld(true)

    for(const joinTarget of joinTargets)
    {
        if(!joinTarget)
        {
            continue
        }

        joinTarget.updateMatrixWorld(true)
        objectBounds.setFromObject(joinTarget)
        if(objectBounds.isEmpty())
        {
            continue
        }

        objectBounds.getCenter(worldCenter)
        localCenter.copy(worldCenter)
        mesh.worldToLocal(localCenter)
        centers.push({
            x: localCenter.x,
            y: localCenter.y,
            z: localCenter.z
        })
    }

    return centers
}


export function getAngleArcProgress(theta, angleMin, angleRange)
{
    const safeRange = Math.max(angleRange, SceneRecuperationTubeWaterControllerConstants.FLOW_COORD_EPSILON)
    const arcStart = angleMin
    const arcEnd = angleMin + safeRange
    let bestClampedAngle = arcStart
    let bestDistance = Number.POSITIVE_INFINITY

    for(const wrap of [-Math.PI * 2, 0, Math.PI * 2])
    {
        const wrappedTheta = theta + wrap
        const clampedTheta = THREE.MathUtils.clamp(wrappedTheta, arcStart, arcEnd)
        const distance = Math.abs(wrappedTheta - clampedTheta)
        if(distance < bestDistance)
        {
            bestDistance = distance
            bestClampedAngle = clampedTheta
        }
    }

    return (bestClampedAngle - arcStart) / safeRange
}


export function computeLocalFlowCoord(mesh, localPosition)
{
    const flowProjection = mesh?.geometry?.userData?.flowProjection
    if(!flowProjection || !localPosition)
    {
        return null
    }

    if(flowProjection.type === 'angle')
    {
        const dx = localPosition.x - flowProjection.cornerX
        const dy = localPosition.y - flowProjection.cornerY
        const theta = Math.atan2(dy, dx)
        return this.getAngleArcProgress(theta, flowProjection.angleMin, flowProjection.angleRange)
    }

    return (localPosition[SceneRecuperationTubeWaterControllerConstants.FLOW_AXIS] - flowProjection.min) / Math.max(flowProjection.range, SceneRecuperationTubeWaterControllerConstants.FLOW_COORD_EPSILON)
}

