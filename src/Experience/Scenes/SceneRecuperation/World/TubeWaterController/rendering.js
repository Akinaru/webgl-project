import * as THREE from 'three'
import * as SceneRecuperationTubeWaterControllerConstants from '../TubeWaterController.constants.js'

export function applyBlueWindowColors()
{
    if(this.blueWindowMeshes.length === 0)
    {
        return
    }

    const windowProgressByName = new Map([
        ['fenetre-blue', this.blueWindowFlowProgressByName.get('fenetre-blue') ?? 0],
        ['fenetre-blue_1', this.blueWindowFlowProgressByName.get('fenetre-blue_1') ?? 0],
        ['fenetre-blue_2', this.blueWindowFlowProgressByName.get('fenetre-blue_2') ?? 0]
    ])

    // Preferred path: explicit window names (fenêtre-blue, _1, _2).
    for(const [windowName, flowProgress] of windowProgressByName)
    {
        const meshes = this.blueWindowMeshesByName.get(windowName) ?? []
        for(const mesh of meshes)
        {
            this.applyBlueWindowMeshState(mesh, flowProgress)
        }
    }

    // Fallback for GLTF exports where all three windows share the same name.
    const fallbackMeshBuckets = [
        this.blueWindowMeshesByName.get('fenetre-blue') ?? [],
        this.blueWindowMeshesByName.get('fenetre-blue_1') ?? [],
        this.blueWindowMeshesByName.get('fenetre-blue_2') ?? []
    ]
    if(fallbackMeshBuckets.every((bucket) => bucket.length === 0) && this.blueWindowMeshes.length > 0)
    {
        const fallbackProgress = [
            windowProgressByName.get('fenetre-blue') ?? 0,
            windowProgressByName.get('fenetre-blue_1') ?? 0,
            windowProgressByName.get('fenetre-blue_2') ?? 0
        ]
        for(let index = 0; index < this.blueWindowMeshes.length; index++)
        {
            const progress = fallbackProgress[Math.min(index, fallbackProgress.length - 1)]
            this.applyBlueWindowMeshState(this.blueWindowMeshes[index], progress)
        }
    }
}


export function applyBlueWindowMeshState(mesh, flowProgress)
{
    const colorLerp = THREE.MathUtils.clamp(flowProgress ?? 0, 0, 1)
    const shaderMaterials = this.blueWindowShaderMaterialsByMeshUuid.get(mesh.uuid) ?? []
    for(const shaderMaterial of shaderMaterials)
    {
        const uniforms = shaderMaterial?.userData?.windowFlowUniforms
        if(uniforms?.uWindowProgress)
        {
            uniforms.uWindowProgress.value = colorLerp
        }
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for(const material of materials)
    {
        if(!material)
        {
            continue
        }

        this.applyWindowMaterialTransparency(material, colorLerp)

        if(material.userData?.windowFlowUniforms)
        {
            continue
        }

        if(material.color)
        {
            this.colorMix.lerpColors(this.disconnectedColor, this.windowConnectedColor, colorLerp)
            material.color.copy(this.colorMix)
        }

        if(material.emissive)
        {
            this.emissiveMix.lerpColors(this.emissiveOffColor, this.windowConnectedEmissiveColor, colorLerp)
            material.emissive.copy(this.emissiveMix)
            material.emissiveIntensity = 0.68 * colorLerp
        }

        material.needsUpdate = true
    }
}


export function applyWindowMaterialTransparency(material, flowProgress)
{
    if(typeof material.opacity !== 'number')
    {
        return
    }

    material.userData = material.userData || {}
    if(material.userData.windowTransparencyDefaultsCaptured !== true)
    {
        material.userData.windowTransparencyDefaultsCaptured = true
        material.userData.windowTransparentDefault = Boolean(material.transparent)
        material.userData.windowOpacityDefault = material.opacity
        material.userData.windowDepthWriteDefault = Boolean(material.depthWrite)
    }

    if(!this.waterShader.animateWindowOpacity)
    {
        material.transparent = Boolean(material.userData.windowTransparentDefault)
        material.opacity = material.userData.windowOpacityDefault
        material.depthWrite = Boolean(material.userData.windowDepthWriteDefault)
        return
    }

    const clampedProgress = THREE.MathUtils.clamp(flowProgress ?? 0, 0, 1)
    const nextOpacity = THREE.MathUtils.lerp(SceneRecuperationTubeWaterControllerConstants.EMPTY_WINDOW_OPACITY, SceneRecuperationTubeWaterControllerConstants.FILLED_WINDOW_OPACITY, clampedProgress)
    const shouldBeTransparent = nextOpacity < (SceneRecuperationTubeWaterControllerConstants.FILLED_WINDOW_OPACITY - SceneRecuperationTubeWaterControllerConstants.FLOW_PROGRESS_EPSILON)

    material.transparent = shouldBeTransparent
    material.opacity = nextOpacity
    material.depthWrite = shouldBeTransparent
        ? false
        : Boolean(material.userData.windowDepthWriteDefault)
}


export function applyTubeFlowColors()
{
    for(const target of this.rotationTargets)
    {
        if(!target)
        {
            continue
        }

        const flowProgress = this.flowProgressByTubeUuid.get(target.uuid) ?? 0
        const flowDirection = this.getTubeFlowDirection(target.uuid)
        const shaderMaterials = this.flowShaderMaterialsByTubeUuid.get(target.uuid) ?? []
        for(const shaderMaterial of shaderMaterials)
        {
            const flowUniforms = shaderMaterial?.userData?.flowUniforms
            if(flowUniforms?.uFlowProgress)
            {
                flowUniforms.uFlowProgress.value = flowProgress
            }
            if(flowUniforms?.uFlowTime)
            {
                flowUniforms.uFlowTime.value = (this.experience.time?.elapsed ? this.experience.time.elapsed * 0.001 : 0) * this.flow.fillSpeed * this.waterShader.foamSpeedMultiplier
            }
            if(flowUniforms?.uFlowDirection)
            {
                flowUniforms.uFlowDirection.value = flowDirection
            }
            if(flowUniforms?.uFlowDualSided)
            {
                flowUniforms.uFlowDualSided.value = this.dualInflowByTubeUuid.get(target.uuid) ? 1 : 0
            }
            if(flowUniforms?.uFoamRotation) flowUniforms.uFoamRotation.value = this.waterShader.foamRotation
            if(flowUniforms?.uFoamScalePrimary) flowUniforms.uFoamScalePrimary.value = this.waterShader.foamScalePrimary
            if(flowUniforms?.uFoamScaleSecondary) flowUniforms.uFoamScaleSecondary.value = this.waterShader.foamScaleSecondary
            if(flowUniforms?.uBodyScale) flowUniforms.uBodyScale.value = this.waterShader.bodyScale
            if(flowUniforms?.uRepeatNoiseScale) flowUniforms.uRepeatNoiseScale.value = this.waterShader.repeatNoiseScale
            if(flowUniforms?.uRepeatNoiseStrength) flowUniforms.uRepeatNoiseStrength.value = this.waterShader.repeatNoiseStrength
            if(flowUniforms?.uFoamThresholdMin) flowUniforms.uFoamThresholdMin.value = this.waterShader.foamThresholdMin
            if(flowUniforms?.uFoamThresholdMax) flowUniforms.uFoamThresholdMax.value = this.waterShader.foamThresholdMax
            if(flowUniforms?.uFoamMix) flowUniforms.uFoamMix.value = this.waterShader.foamMix
            if(flowUniforms?.uFoamOpacity) flowUniforms.uFoamOpacity.value = this.waterShader.foamOpacity
            if(flowUniforms?.uFrontOpacity) flowUniforms.uFrontOpacity.value = this.waterShader.frontOpacity
            if(flowUniforms?.uFrontWidthSingle) flowUniforms.uFrontWidthSingle.value = this.waterShader.frontWidthSingle
            if(flowUniforms?.uFrontWidthDual) flowUniforms.uFrontWidthDual.value = this.waterShader.frontWidthDual
            if(flowUniforms?.uWaterShadowStrength) flowUniforms.uWaterShadowStrength.value = this.waterShader.waterShadowStrength
            if(flowUniforms?.uWaterMidLow) flowUniforms.uWaterMidLow.value = this.waterShader.waterMidLow
            if(flowUniforms?.uWaterMidHigh) flowUniforms.uWaterMidHigh.value = this.waterShader.waterMidHigh
            if(flowUniforms?.uWaterHighlightMix) flowUniforms.uWaterHighlightMix.value = this.waterShader.waterHighlightMix
            if(flowUniforms?.uBodyBlendBase) flowUniforms.uBodyBlendBase.value = this.waterShader.bodyBlendBase
            if(flowUniforms?.uBodyBlendGain) flowUniforms.uBodyBlendGain.value = this.waterShader.bodyBlendGain
            if(flowUniforms?.uEmissiveBase) flowUniforms.uEmissiveBase.value = this.waterShader.emissiveBase
            if(flowUniforms?.uEmissiveFoam) flowUniforms.uEmissiveFoam.value = this.waterShader.emissiveFoam
            if(flowUniforms?.uEmissiveFront) flowUniforms.uEmissiveFront.value = this.waterShader.emissiveFront
            flowUniforms?.uFoamColor?.value?.set?.(this.waterShader.foamColor)
        }

        const tubeMeshes = this.tubeMeshesByTargetUuid.get(target.uuid) ?? []
        for(const mesh of tubeMeshes)
        {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            for(const material of materials)
            {
                if(!material)
                {
                    continue
                }

                this.applyTubeMaterialTransparency(material, flowProgress)

                // Fallback path for materials where onBeforeCompile shader hook
                // is not available.
                const usesFlowShader = Boolean(material.userData?.flowUniforms)
                if(usesFlowShader)
                {
                    continue
                }

                if(material.color)
                {
                    this.colorMix.lerpColors(this.disconnectedColor, this.tubeConnectedColor, flowProgress)
                    material.color.copy(this.colorMix)
                }

                if(material.emissive)
                {
                    this.emissiveMix.lerpColors(this.emissiveOffColor, this.tubeConnectedEmissiveColor, flowProgress)
                    material.emissive.copy(this.emissiveMix)
                    material.emissiveIntensity = 0.68 * flowProgress
                }

                material.needsUpdate = true
            }
        }
    }
}


export function applyTubeMaterialTransparency(material, flowProgress)
{
    if(typeof material.opacity !== 'number')
    {
        return
    }

    material.userData = material.userData || {}
    if(material.userData.tubeTransparencyDefaultsCaptured !== true)
    {
        material.userData.tubeTransparencyDefaultsCaptured = true
        material.userData.tubeTransparentDefault = Boolean(material.transparent)
        material.userData.tubeOpacityDefault = material.opacity
        material.userData.tubeDepthWriteDefault = Boolean(material.depthWrite)
    }

    if(!this.waterShader.animateTubeOpacity)
    {
        material.transparent = Boolean(material.userData.tubeTransparentDefault)
        material.opacity = material.userData.tubeOpacityDefault
        material.depthWrite = Boolean(material.userData.tubeDepthWriteDefault)
        return
    }

    const clampedProgress = THREE.MathUtils.clamp(flowProgress ?? 0, 0, 1)
    const nextOpacity = THREE.MathUtils.lerp(SceneRecuperationTubeWaterControllerConstants.EMPTY_TUBE_OPACITY, SceneRecuperationTubeWaterControllerConstants.FILLED_TUBE_OPACITY, clampedProgress)
    const shouldBeTransparent = nextOpacity < (SceneRecuperationTubeWaterControllerConstants.FILLED_TUBE_OPACITY - SceneRecuperationTubeWaterControllerConstants.FLOW_PROGRESS_EPSILON)

    material.transparent = shouldBeTransparent
    material.opacity = nextOpacity
    material.depthWrite = shouldBeTransparent
        ? false
        : Boolean(material.userData.tubeDepthWriteDefault)
}


export function setTubeFlowColor(colorValue, emissiveColorValue = null)
{
    if(colorValue === null || colorValue === undefined)
    {
        this.tubeConnectedColor.set(SceneRecuperationTubeWaterControllerConstants.CONNECTED_COLOR)
        this.tubeConnectedEmissiveColor.set(SceneRecuperationTubeWaterControllerConstants.CONNECTED_EMISSIVE)
        this.windowConnectedColor.set(SceneRecuperationTubeWaterControllerConstants.CONNECTED_COLOR)
        this.windowConnectedEmissiveColor.set(SceneRecuperationTubeWaterControllerConstants.CONNECTED_EMISSIVE)
    }
    else
    {
        this.tmpColor.set(colorValue)
        this.tubeConnectedColor.copy(this.tmpColor)
        this.tubeConnectedEmissiveColor.copy(emissiveColorValue ? new THREE.Color(emissiveColorValue) : this.tmpColor).lerp(this.emissiveOffColor, 0.44)
        this.windowConnectedColor.copy(this.tmpColor)
        this.windowConnectedEmissiveColor.copy(emissiveColorValue ? new THREE.Color(emissiveColorValue) : this.tmpColor).lerp(this.emissiveOffColor, 0.44)
    }

    for(const shaderMaterials of this.flowShaderMaterialsByTubeUuid.values())
    {
        for(const shaderMaterial of shaderMaterials)
        {
            const flowUniforms = shaderMaterial?.userData?.flowUniforms
            if(!flowUniforms)
            {
                continue
            }

            flowUniforms.uFlowConnectedColor?.value?.copy?.(this.tubeConnectedColor)
            flowUniforms.uFlowConnectedEmissiveColor?.value?.copy?.(this.tubeConnectedEmissiveColor)
        }
    }

    for(const shaderMaterials of this.blueWindowShaderMaterialsByMeshUuid.values())
    {
        for(const shaderMaterial of shaderMaterials)
        {
            const windowFlowUniforms = shaderMaterial?.userData?.windowFlowUniforms
            if(!windowFlowUniforms)
            {
                continue
            }

            windowFlowUniforms.uWindowConnectedColor?.value?.copy?.(this.windowConnectedColor)
            windowFlowUniforms.uWindowConnectedEmissiveColor?.value?.copy?.(this.windowConnectedEmissiveColor)
        }
    }

    this.applyTubeFlowColors()
    this.applyBlueWindowColors()
}


