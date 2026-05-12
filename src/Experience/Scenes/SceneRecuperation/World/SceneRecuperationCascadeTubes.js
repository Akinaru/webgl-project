import * as THREE from 'three'
import Experience from '../../../Experience.js'
import { applyStandardMaterialPatch } from '../../Map/World/Shaders/Common/applyStandardMaterialPatch.js'
import { cascadeTubeShaderChunks } from './Shaders/CascadeTubes/cascadeTubeShaderChunks.js'
import { cascadeSlopeShaderChunks } from './Shaders/CascadeSlope/cascadeSlopeShaderChunks.js'
import {
    CASCADE_BLUE_TUBE_NAME_TOKENS,
    CASCADE_GROUP_SALLE_CHOIX,
    CASCADE_GROUP_SALLE_TUBE,
    CASCADE_PLAN_NAME_TOKENS,
    CASCADE_PLANTS_NAME_TOKENS,
    DEFAULT_BASE_COLOR,
    DEFAULT_FLOW_ANGLE,
    DEFAULT_FLOW_SCALE,
    DEFAULT_FLOW_SPEED,
    DEFAULT_FOAM_BAND_ANGLE,
    DEFAULT_FOAM_COLOR,
    DEFAULT_FOAM_INTENSITY,
    DEFAULT_FOAM_NOISE_FREQUENCY,
    DEFAULT_FOAM_OPACITY,
    DEFAULT_FOAM_SPEED,
    DEFAULT_FOAM_THRESHOLD,
    DEFAULT_OPACITY,
    DEFAULT_OVERLAY_DIAMETER_SCALE,
    DEFAULT_OVERLAY_FLOW_SPEED,
    DEFAULT_OVERLAY_FOAM_BAND_ANGLE,
    DEFAULT_OVERLAY_FOAM_COLOR,
    DEFAULT_OVERLAY_FOAM_INTENSITY,
    DEFAULT_OVERLAY_FOAM_NOISE_FREQUENCY,
    DEFAULT_OVERLAY_FOAM_OPACITY,
    DEFAULT_OVERLAY_FOAM_SPEED,
    DEFAULT_OVERLAY_FOAM_THRESHOLD,
    DEFAULT_ROTATION_SALLE_CHOIX,
    DEFAULT_ROTATION_SALLE_TUBE,
    FLOW_SPEED_VARIATION_AMPLITUDE,
    FOAM_SPEED_VARIATION_AMPLITUDE,
    SURFACE_TYPE_SLOPE,
    SURFACE_TYPE_TUBE
} from './SceneRecuperationCascadeTubes.constants.js'

export default class SceneRecuperationCascadeTubes
{
    constructor({ recuperationModel = null, debugTubeFolder = null, debugSlopeFolder = null, sharedWaterColors = null } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.recuperationModel = recuperationModel
        this.debugTubeFolder = debugTubeFolder
        this.debugSlopeFolder = debugSlopeFolder
        this.sharedWaterColors = sharedWaterColors
        this.runtimeMaterials = []
        this.overlayMeshes = []
        this.localTime = 0

        this.tubeSettings = this.createTubeDefaultSurfaceSettings()
        this.slopeSettings = this.createSlopeDefaultSurfaceSettings()
        this.rotationSalleChoix = DEFAULT_ROTATION_SALLE_CHOIX
        this.rotationSalleTube = DEFAULT_ROTATION_SALLE_TUBE

        this.applySharedWaterColors()
        this.cascadeSurfaceEntries = this.collectCascadeSurfaceEntries()
        this.applyMaterials()
        this.setDebug()
    }

    applySharedWaterColors()
    {
        const baseColor = this.sharedWaterColors?.baseColor ?? DEFAULT_BASE_COLOR
        const deepFoamColor = this.sharedWaterColors?.deepFoamColor ?? DEFAULT_FOAM_COLOR
        const surfaceFoamColor = this.sharedWaterColors?.surfaceFoamColor ?? DEFAULT_OVERLAY_FOAM_COLOR

        for(const settings of [this.tubeSettings, this.slopeSettings])
        {
            settings.baseColor.set(baseColor)
            settings.foamColor.set(deepFoamColor)
            settings.overlayFoamColor.set(surfaceFoamColor)
        }

        this.syncMaterialUniforms()
    }

    createDefaultSurfaceSettings()
    {
        return {
            baseColor: new THREE.Color(DEFAULT_BASE_COLOR),
            foamColor: new THREE.Color(DEFAULT_FOAM_COLOR),
            flowSpeed: DEFAULT_FLOW_SPEED,
            flowScale: DEFAULT_FLOW_SCALE,
            flowAngle: DEFAULT_FLOW_ANGLE,
            foamSpeed: DEFAULT_FOAM_SPEED,
            foamNoiseFrequency: DEFAULT_FOAM_NOISE_FREQUENCY,
            foamThreshold: DEFAULT_FOAM_THRESHOLD,
            foamIntensity: DEFAULT_FOAM_INTENSITY,
            foamOpacity: DEFAULT_FOAM_OPACITY,
            foamBandAngle: DEFAULT_FOAM_BAND_ANGLE,
            opacity: DEFAULT_OPACITY,
            overlayFoamColor: new THREE.Color(DEFAULT_OVERLAY_FOAM_COLOR),
            overlayFlowSpeed: DEFAULT_OVERLAY_FLOW_SPEED,
            overlayFoamSpeed: DEFAULT_OVERLAY_FOAM_SPEED,
            overlayFoamNoiseFrequency: DEFAULT_OVERLAY_FOAM_NOISE_FREQUENCY,
            overlayFoamThreshold: DEFAULT_OVERLAY_FOAM_THRESHOLD,
            overlayFoamIntensity: DEFAULT_OVERLAY_FOAM_INTENSITY,
            overlayFoamOpacity: DEFAULT_OVERLAY_FOAM_OPACITY,
            overlayFoamBandAngle: DEFAULT_OVERLAY_FOAM_BAND_ANGLE,
            overlayDiameterScale: DEFAULT_OVERLAY_DIAMETER_SCALE
        }
    }

    createTubeDefaultSurfaceSettings()
    {
        return this.createDefaultSurfaceSettings()
    }

    createSlopeDefaultSurfaceSettings()
    {
        const settings = this.createDefaultSurfaceSettings()
        settings.flowAngle = 1.5
        settings.overlayFoamThreshold = 0.68
        settings.overlayDiameterScale = 1
        return settings
    }

    collectCascadeSurfaceEntries()
    {
        const root = this.recuperationModel?.model
        if(!root)
        {
            return []
        }

        const entries = []
        root.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            const isPlanMesh = this.recuperationModel?.hasNameInHierarchy?.(child, CASCADE_PLAN_NAME_TOKENS)
            const isTubeMesh = this.recuperationModel?.hasNameInHierarchy?.(child, CASCADE_PLANTS_NAME_TOKENS)
                && this.recuperationModel?.hasNameInHierarchy?.(child, CASCADE_BLUE_TUBE_NAME_TOKENS)

            if(!isPlanMesh && !isTubeMesh)
            {
                return
            }

            entries.push({
                mesh: child,
                surfaceType: isPlanMesh ? SURFACE_TYPE_SLOPE : SURFACE_TYPE_TUBE
            })
        })

        return entries
    }

    applyMaterials()
    {
        for(const entry of this.cascadeSurfaceEntries)
        {
            const { mesh, surfaceType } = entry
            const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const patchedMaterials = sourceMaterials.map((material) => this.createCascadeTubeMaterial(material, mesh, {
                isOverlay: false,
                surfaceType
            }))
            mesh.material = Array.isArray(mesh.material) ? patchedMaterials : patchedMaterials[0]
            this.attachFoamOverlayMesh(mesh, sourceMaterials, surfaceType)
        }
    }

    getSurfaceSettings(surfaceType)
    {
        return surfaceType === SURFACE_TYPE_SLOPE ? this.slopeSettings : this.tubeSettings
    }

    getShaderChunks(surfaceType)
    {
        return surfaceType === SURFACE_TYPE_SLOPE ? cascadeSlopeShaderChunks : cascadeTubeShaderChunks
    }

    createCascadeTubeMaterial(baseMaterial, mesh, { isOverlay = false, surfaceType = SURFACE_TYPE_TUBE } = {})
    {
        const material = baseMaterial?.clone?.() ?? baseMaterial
        if(!material)
        {
            return material
        }

        const surfaceSettings = this.getSurfaceSettings(surfaceType)
        const groupKey = this.getCascadeTubeGroupKey(mesh)
        const patternOffset = this.createPatternOffset(mesh, isOverlay ? 'overlay' : 'base')
        const noiseSeed = this.createNoiseSeed(mesh, isOverlay ? 'overlay' : 'base')
        const speedVariation = this.createSpeedVariation(mesh, isOverlay ? 'overlay' : 'base')
        const settings = isOverlay
            ? this.createOverlayUniformSettings(surfaceSettings)
            : this.createBaseUniformSettings(surfaceSettings)

        material.transparent = true
        material.side = THREE.DoubleSide
        material.depthWrite = !isOverlay
        material.userData = material.userData || {}
        material.userData.isRecuperationCascadeTubeMaterial = true
        material.userData.recuperationCascadeTubeUniforms = {
            localTime: { value: this.localTime },
            baseColor: { value: settings.baseColor },
            foamColor: { value: settings.foamColor },
            flowSpeed: { value: settings.flowSpeed },
            flowScale: { value: settings.flowScale },
            flowAngle: { value: settings.flowAngle },
            foamSpeed: { value: settings.foamSpeed },
            foamNoiseFrequency: { value: settings.foamNoiseFrequency },
            foamThreshold: { value: settings.foamThreshold },
            foamIntensity: { value: settings.foamIntensity },
            opacity: { value: settings.opacity },
            foamOpacity: { value: settings.foamOpacity },
            foamBandAngle: { value: settings.foamBandAngle },
            flowSpeedOffset: { value: speedVariation.flowSpeedOffset },
            foamSpeedOffset: { value: speedVariation.foamSpeedOffset },
            foamOnly: { value: isOverlay ? 1 : 0 },
            patternOffset: { value: patternOffset },
            noiseSeed: { value: noiseSeed },
            seamOffset: { value: this.getRotationValueForGroup(groupKey) },
            groupKey,
            surfaceType,
            isOverlay
        }

        material.onBeforeCompile = (shader) =>
        {
            const uniforms = material.userData.recuperationCascadeTubeUniforms
            shader.uniforms.uCascadeTime = uniforms.localTime
            shader.uniforms.uCascadeBaseColor = uniforms.baseColor
            shader.uniforms.uCascadeFoamColor = uniforms.foamColor
            shader.uniforms.uCascadeFlowSpeed = uniforms.flowSpeed
            shader.uniforms.uCascadeFlowScale = uniforms.flowScale
            shader.uniforms.uCascadeFlowAngle = uniforms.flowAngle
            shader.uniforms.uCascadeFoamSpeed = uniforms.foamSpeed
            shader.uniforms.uCascadeFoamNoiseFrequency = uniforms.foamNoiseFrequency
            shader.uniforms.uCascadeFoamThreshold = uniforms.foamThreshold
            shader.uniforms.uCascadeFoamIntensity = uniforms.foamIntensity
            shader.uniforms.uCascadeOpacity = uniforms.opacity
            shader.uniforms.uCascadeFoamOpacity = uniforms.foamOpacity
            shader.uniforms.uCascadeFoamBandAngle = uniforms.foamBandAngle
            shader.uniforms.uCascadeFoamOnly = uniforms.foamOnly
            shader.uniforms.uCascadePatternOffset = uniforms.patternOffset
            shader.uniforms.uCascadeNoiseSeed = uniforms.noiseSeed
            shader.uniforms.uCascadeSeamOffset = uniforms.seamOffset

            applyStandardMaterialPatch(shader, this.getShaderChunks(surfaceType))
        }

        material.customProgramCacheKey = () =>
        {
            const parentKey = typeof baseMaterial?.customProgramCacheKey === 'function'
                ? baseMaterial.customProgramCacheKey()
                : ''
            return `${parentKey}__recuperationCascadeFlowV6_${surfaceType}_${isOverlay ? 'overlay' : 'main'}`
        }

        material.needsUpdate = true
        this.runtimeMaterials.push(material)
        return material
    }

    createBaseUniformSettings(surfaceSettings)
    {
        return {
            baseColor: surfaceSettings.baseColor.clone(),
            foamColor: surfaceSettings.foamColor.clone(),
            flowSpeed: surfaceSettings.flowSpeed,
            flowScale: surfaceSettings.flowScale,
            flowAngle: surfaceSettings.flowAngle,
            foamSpeed: surfaceSettings.foamSpeed,
            foamNoiseFrequency: surfaceSettings.foamNoiseFrequency,
            foamThreshold: surfaceSettings.foamThreshold,
            foamIntensity: surfaceSettings.foamIntensity,
            opacity: surfaceSettings.opacity,
            foamOpacity: surfaceSettings.foamOpacity,
            foamBandAngle: surfaceSettings.foamBandAngle
        }
    }

    createOverlayUniformSettings(surfaceSettings)
    {
        return {
            baseColor: new THREE.Color(0x000000),
            foamColor: surfaceSettings.overlayFoamColor.clone(),
            flowSpeed: surfaceSettings.overlayFlowSpeed,
            flowScale: surfaceSettings.flowScale,
            flowAngle: surfaceSettings.flowAngle,
            foamSpeed: surfaceSettings.overlayFoamSpeed,
            foamNoiseFrequency: surfaceSettings.overlayFoamNoiseFrequency,
            foamThreshold: surfaceSettings.overlayFoamThreshold,
            foamIntensity: surfaceSettings.overlayFoamIntensity,
            opacity: 0,
            foamOpacity: surfaceSettings.overlayFoamOpacity,
            foamBandAngle: surfaceSettings.overlayFoamBandAngle
        }
    }

    attachFoamOverlayMesh(mesh, sourceMaterials, surfaceType)
    {
        const overlayMaterials = sourceMaterials.map((material) => this.createCascadeTubeMaterial(material, mesh, {
            isOverlay: true,
            surfaceType
        }))
        const surfaceSettings = this.getSurfaceSettings(surfaceType)
        const overlayMesh = new THREE.Mesh(
            mesh.geometry,
            Array.isArray(mesh.material) ? overlayMaterials : overlayMaterials[0]
        )

        overlayMesh.name = `${mesh.name || 'cascadeTube'}_foamOverlay`
        overlayMesh.position.set(0, 0, 0)
        overlayMesh.rotation.set(0, 0, 0)
        overlayMesh.scale.set(surfaceSettings.overlayDiameterScale, 1, surfaceSettings.overlayDiameterScale)
        overlayMesh.renderOrder = (mesh.renderOrder || 0) + 1
        overlayMesh.frustumCulled = mesh.frustumCulled
        overlayMesh.matrixAutoUpdate = false
        overlayMesh.visible = mesh.visible
        overlayMesh.castShadow = false
        overlayMesh.receiveShadow = false
        overlayMesh.userData.isRecuperationCascadeTubeFoamOverlay = true
        overlayMesh.userData.surfaceType = surfaceType
        overlayMesh.updateMatrix()

        mesh.add(overlayMesh)
        this.overlayMeshes.push(overlayMesh)
    }

    createPatternOffset(mesh, variant = 'base')
    {
        const worldPosition = new THREE.Vector3()
        mesh?.getWorldPosition?.(worldPosition)

        const variantOffset = variant === 'overlay' ? 2.37 : 1.91
        const seedY = Math.abs(Math.sin((worldPosition.z * 39.3468) + (worldPosition.y * 11.135) + (worldPosition.x * 5.913) + variantOffset))

        return new THREE.Vector2(0, seedY * 5.0)
    }

    createNoiseSeed(mesh, variant = 'base')
    {
        const worldPosition = new THREE.Vector3()
        mesh?.getWorldPosition?.(worldPosition)

        const phaseA = variant === 'overlay' ? 5.41 : 2.17
        const phaseB = variant === 'overlay' ? 7.89 : 4.63
        const seedA = Math.abs(Math.sin((worldPosition.x * 31.341) + (worldPosition.z * 17.417) + (worldPosition.y * 9.137) + phaseA))
        const seedB = Math.abs(Math.sin((worldPosition.x * 7.731) + (worldPosition.z * 27.913) + (worldPosition.y * 21.553) + phaseB))

        return new THREE.Vector2(
            (seedA * 4.0) + 0.13,
            (seedB * 4.0) + 0.29
        )
    }

    createSpeedVariation(mesh, variant = 'base')
    {
        const worldPosition = new THREE.Vector3()
        mesh?.getWorldPosition?.(worldPosition)

        const phase = variant === 'overlay' ? 3.83 : 1.57
        const flowNoise = Math.sin((worldPosition.x * 4.137) + (worldPosition.z * 2.913) + (worldPosition.y * 1.731) + phase)
        const foamNoise = Math.sin((worldPosition.x * 2.517) + (worldPosition.z * 5.201) + (worldPosition.y * 1.173) + (phase * 1.7))

        return {
            flowSpeedOffset: flowNoise * FLOW_SPEED_VARIATION_AMPLITUDE,
            foamSpeedOffset: foamNoise * FOAM_SPEED_VARIATION_AMPLITUDE
        }
    }

    getCascadeTubeGroupKey(mesh)
    {
        let current = mesh
        while(current)
        {
            const normalizedName = String(current.name || '')
                .toLowerCase()
                .trim()
                .replace(/[\s_]+/g, '_')

            if(normalizedName === 'cascade+plantes_1' || normalizedName === 'cascade_plantes_1')
            {
                return CASCADE_GROUP_SALLE_TUBE
            }

            if(normalizedName === 'cascade+plantes' || normalizedName === 'cascade_plantes')
            {
                return CASCADE_GROUP_SALLE_CHOIX
            }

            current = current.parent
        }

        return CASCADE_GROUP_SALLE_CHOIX
    }

    getRotationValueForGroup(groupKey)
    {
        if(groupKey === CASCADE_GROUP_SALLE_CHOIX)
        {
            return this.rotationSalleChoix
        }

        return this.rotationSalleTube
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.ownsTubeDebugFolder = !this.debugTubeFolder
        this.ownsSlopeDebugFolder = !this.debugSlopeFolder
        this.tubeDebugFolder = this.debugTubeFolder || this.debug.addFolder('Tuyaux', {
            expanded: false
        })
        this.slopeDebugFolder = this.debugSlopeFolder || this.debug.addFolder('Pentes', {
            expanded: false
        })
        this.buildSurfaceDebug(this.tubeDebugFolder, this.tubeSettings, SURFACE_TYPE_TUBE)
        this.buildSurfaceDebug(this.slopeDebugFolder, this.slopeSettings, SURFACE_TYPE_SLOPE)

        this.debug.addBinding(this.slopeDebugFolder, this, 'rotationSalleChoix', {
            label: 'Rotation salle choix',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.tubeDebugFolder, this, 'rotationSalleTube', {
            label: 'Rotation salle tube',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () => this.syncMaterialUniforms())
    }

    buildSurfaceDebug(parentFolder, surfaceSettings, surfaceType)
    {
        const innerFolder = this.debug.addFolder('Mousse interrieure', {
            parent: parentFolder,
            expanded: false
        })
        const outerFolder = this.debug.addFolder('Mousse exterieur', {
            parent: parentFolder,
            expanded: false
        })

        this.debug.addBinding(parentFolder, surfaceSettings, 'flowSpeed', { label: 'Vitesse du flux', min: -4, max: 4, step: 0.01 }).on('change', () => this.syncMaterialUniforms())
        this.debug.addBinding(parentFolder, surfaceSettings, 'flowScale', { label: 'Echelle du motif', min: 0.02, max: 2, step: 0.01 }).on('change', () => this.syncMaterialUniforms())
        if(surfaceType === SURFACE_TYPE_SLOPE)
        {
            this.debug.addBinding(parentFolder, surfaceSettings, 'flowAngle', { label: 'Angle du flux', min: -3.1416, max: 3.1416, step: 0.001 }).on('change', () => this.syncMaterialUniforms())
        }
        this.debug.addBinding(parentFolder, surfaceSettings, 'opacity', { label: 'Opacite du flux', min: 0, max: 1, step: 0.01 }).on('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(innerFolder, surfaceSettings, 'foamSpeed', { label: 'Vitesse de la mousse', min: -4, max: 4, step: 0.01 }).on('change', () => this.syncMaterialUniforms())
        this.debug.addBinding(innerFolder, surfaceSettings, 'foamBandAngle', { label: 'Angle des bandes', min: -3.1416, max: 3.1416, step: 0.001 }).on('change', () => this.syncMaterialUniforms())
        this.debug.addBinding(innerFolder, surfaceSettings, 'foamNoiseFrequency', { label: 'Frequence du bruit de mousse', min: 0, max: 12, step: 0.01 }).on('change', () => this.syncMaterialUniforms())
        this.debug.addBinding(innerFolder, surfaceSettings, 'foamThreshold', { label: 'Largeur de mousse', min: 0, max: 1, step: 0.01 }).on('change', () => this.syncMaterialUniforms())
        this.debug.addBinding(innerFolder, surfaceSettings, 'foamIntensity', { label: 'Intensite de mousse', min: 0, max: 3, step: 0.01 }).on('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(outerFolder, surfaceSettings, 'overlayFlowSpeed', { label: 'Vitesse flux overlay', min: -4, max: 4, step: 0.01 }).on('change', () => this.syncMaterialUniforms())
        this.debug.addBinding(outerFolder, surfaceSettings, 'overlayFoamSpeed', { label: 'Vitesse mousse overlay', min: -4, max: 4, step: 0.01 }).on('change', () => this.syncMaterialUniforms())
        this.debug.addBinding(outerFolder, surfaceSettings, 'overlayFoamBandAngle', { label: 'Angle des bandes overlay', min: -3.1416, max: 3.1416, step: 0.001 }).on('change', () => this.syncMaterialUniforms())
        this.debug.addBinding(outerFolder, surfaceSettings, 'overlayFoamNoiseFrequency', { label: 'Bruit mousse overlay', min: 0, max: 12, step: 0.01 }).on('change', () => this.syncMaterialUniforms())
        this.debug.addBinding(outerFolder, surfaceSettings, 'overlayFoamThreshold', { label: 'Largeur mousse overlay', min: 0, max: 1, step: 0.01 }).on('change', () => this.syncMaterialUniforms())
        this.debug.addBinding(outerFolder, surfaceSettings, 'overlayFoamIntensity', { label: 'Intensite mousse overlay', min: 0, max: 3, step: 0.01 }).on('change', () => this.syncMaterialUniforms())
        this.debug.addBinding(outerFolder, surfaceSettings, 'overlayFoamOpacity', { label: 'Opacite mousse overlay', min: 0, max: 1, step: 0.01 }).on('change', () => this.syncMaterialUniforms())
        this.debug.addBinding(outerFolder, surfaceSettings, 'overlayDiameterScale', { label: 'Diametre overlay', min: 1, max: 1.5, step: 0.001 }).on('change', () => this.syncMaterialUniforms())

        if(surfaceType === SURFACE_TYPE_TUBE)
        {
            this.tubeInnerFoamDebugFolder = innerFolder
            this.tubeOuterFoamDebugFolder = outerFolder
        }
        else
        {
            this.slopeInnerFoamDebugFolder = innerFolder
            this.slopeOuterFoamDebugFolder = outerFolder
        }
    }

    syncMaterialUniforms()
    {
        for(const material of this.runtimeMaterials)
        {
            const uniforms = material?.userData?.recuperationCascadeTubeUniforms
            if(!uniforms)
            {
                continue
            }

            const surfaceSettings = this.getSurfaceSettings(uniforms.surfaceType)
            const isOverlay = Boolean(uniforms.isOverlay)
            const settings = isOverlay
                ? this.createOverlayUniformSettings(surfaceSettings)
                : this.createBaseUniformSettings(surfaceSettings)

            uniforms.baseColor.value.copy(settings.baseColor)
            uniforms.foamColor.value.copy(settings.foamColor)
            uniforms.flowSpeed.value = settings.flowSpeed + (uniforms.flowSpeedOffset?.value || 0)
            uniforms.flowScale.value = settings.flowScale
            uniforms.flowAngle.value = settings.flowAngle
            uniforms.foamSpeed.value = settings.foamSpeed + (uniforms.foamSpeedOffset?.value || 0)
            uniforms.foamNoiseFrequency.value = settings.foamNoiseFrequency
            uniforms.foamThreshold.value = settings.foamThreshold
            uniforms.foamIntensity.value = settings.foamIntensity
            uniforms.foamOpacity.value = settings.foamOpacity
            uniforms.foamBandAngle.value = settings.foamBandAngle
            uniforms.opacity.value = settings.opacity
            uniforms.seamOffset.value = this.getRotationValueForGroup(uniforms.groupKey)
        }

        for(const overlayMesh of this.overlayMeshes)
        {
            const surfaceSettings = this.getSurfaceSettings(overlayMesh.userData.surfaceType)
            overlayMesh.scale.set(surfaceSettings.overlayDiameterScale, 1, surfaceSettings.overlayDiameterScale)
            overlayMesh.updateMatrix()
        }
    }

    update()
    {
        this.localTime = this.experience.time.elapsed * 0.001

        for(const material of this.runtimeMaterials)
        {
            const uniforms = material?.userData?.recuperationCascadeTubeUniforms
            if(!uniforms)
            {
                continue
            }

            uniforms.localTime.value = this.localTime
        }

        for(const overlayMesh of this.overlayMeshes)
        {
            if(overlayMesh.parent)
            {
                overlayMesh.visible = overlayMesh.parent.visible
            }
        }
    }

    destroy()
    {
        this.tubeInnerFoamDebugFolder?.dispose?.()
        this.tubeInnerFoamDebugFolder = null
        this.tubeOuterFoamDebugFolder?.dispose?.()
        this.tubeOuterFoamDebugFolder = null
        this.slopeInnerFoamDebugFolder?.dispose?.()
        this.slopeInnerFoamDebugFolder = null
        this.slopeOuterFoamDebugFolder?.dispose?.()
        this.slopeOuterFoamDebugFolder = null
        if(this.ownsTubeDebugFolder)
        {
            this.tubeDebugFolder?.dispose?.()
        }
        this.tubeDebugFolder = null
        if(this.ownsSlopeDebugFolder)
        {
            this.slopeDebugFolder?.dispose?.()
        }
        this.slopeDebugFolder = null
        for(const overlayMesh of this.overlayMeshes)
        {
            overlayMesh.parent?.remove?.(overlayMesh)
        }

        for(const material of this.runtimeMaterials)
        {
            material?.dispose?.()
        }

        this.runtimeMaterials = []
        this.overlayMeshes = []
        this.cascadeSurfaceEntries = null
        this.recuperationModel = null
    }
}
