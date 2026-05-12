import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import { applyStandardMaterialPatch } from '../../../Map/World/Shaders/Common/applyStandardMaterialPatch.js'
import { recuperationWaterVisibleGradientShaderChunks } from '../Shaders/Water/visibleGradientShaderChunks.js'
import * as SceneRecuperationWaterConstants from './Water.constants.js'

export default class SceneRecuperationWater
{
    constructor({ recuperationModel = null, debugParentFolder = null, sharedWaterColors = null } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.resources = this.experience.resources
        this.recuperationModel = recuperationModel
        this.debugParentFolder = debugParentFolder
        this.sharedWaterColors = sharedWaterColors
        this.waterDistributionTexture = this.resources.items.recuperationWaterDistributionTexture ?? null
        this.runtimeMaterials = []
        this.baseColor = new THREE.Color(SceneRecuperationWaterConstants.WATER_BASE_COLOR)
        this.deepFoamColor = new THREE.Color(SceneRecuperationWaterConstants.WATER_DEEP_FOAM_COLOR)
        this.surfaceFoamColor = new THREE.Color(SceneRecuperationWaterConstants.WATER_SURFACE_FOAM_COLOR)
        this.opacity = SceneRecuperationWaterConstants.WATER_OPACITY
        this.patternScale = SceneRecuperationWaterConstants.WATER_PATTERN_SCALE
        this.noiseSpeed = SceneRecuperationWaterConstants.WATER_NOISE_SPEED
        this.noiseFrequency = SceneRecuperationWaterConstants.WATER_NOISE_FREQUENCY
        this.threshold = SceneRecuperationWaterConstants.WATER_THRESHOLD
        this.intensity = SceneRecuperationWaterConstants.WATER_INTENSITY
        this.foamSoftness = SceneRecuperationWaterConstants.WATER_FOAM_SOFTNESS
        this.foamCutoff = SceneRecuperationWaterConstants.WATER_FOAM_CUTOFF
        this.deepFoamThreshold = SceneRecuperationWaterConstants.WATER_DEEP_FOAM_THRESHOLD
        this.deepFoamIntensity = SceneRecuperationWaterConstants.WATER_DEEP_FOAM_INTENSITY
        this.deepFoamSoftness = SceneRecuperationWaterConstants.WATER_DEEP_FOAM_SOFTNESS
        this.bandAngle = SceneRecuperationWaterConstants.WATER_BAND_ANGLE
        this.edgeContrast = SceneRecuperationWaterConstants.WATER_EDGE_CONTRAST
        this.localTime = 0
        this.waterMeshes = this.collectWaterMeshes()
        this.flatTintMeshes = this.collectFlatTintMeshes()

        this.applySharedWaterColors()
        this.applyTexture()
        this.setDebug()
    }

    applySharedWaterColors()
    {
        if(this.sharedWaterColors)
        {
            this.baseColor.set(this.sharedWaterColors.baseColor ?? SceneRecuperationWaterConstants.WATER_BASE_COLOR)
            this.deepFoamColor.set(this.sharedWaterColors.deepFoamColor ?? SceneRecuperationWaterConstants.WATER_DEEP_FOAM_COLOR)
            this.surfaceFoamColor.set(this.sharedWaterColors.surfaceFoamColor ?? SceneRecuperationWaterConstants.WATER_SURFACE_FOAM_COLOR)
        }

        this.syncMaterialUniforms()
    }

    collectWaterMeshes()
    {
        const root = this.recuperationModel?.model
        if(!root)
        {
            return []
        }

        const meshes = []
        root.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            if(!this.recuperationModel?.hasExactNameInHierarchy?.(child, SceneRecuperationWaterConstants.WATER_PLAN_MESH_NAMES))
            {
                return
            }

            meshes.push(child)
        })

        return meshes
    }

    collectFlatTintMeshes()
    {
        const root = this.recuperationModel?.model
        if(!root)
        {
            return []
        }

        const meshes = []
        root.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            if(!this.recuperationModel?.hasExactNameInHierarchy?.(child, SceneRecuperationWaterConstants.WATER_BASE_TINT_MESH_NAMES))
            {
                return
            }

            meshes.push(child)
        })

        return meshes
    }

    applyTexture()
    {
        if(!(this.waterDistributionTexture instanceof THREE.Texture))
        {
            return
        }

        this.waterDistributionTexture.colorSpace = THREE.NoColorSpace
        this.waterDistributionTexture.flipY = false
        this.waterDistributionTexture.wrapS = THREE.ClampToEdgeWrapping
        this.waterDistributionTexture.wrapT = THREE.ClampToEdgeWrapping
        this.waterDistributionTexture.minFilter = THREE.LinearMipmapLinearFilter
        this.waterDistributionTexture.magFilter = THREE.LinearFilter
        this.waterDistributionTexture.generateMipmaps = true
        const maxAnisotropy = this.experience.renderer?.instance?.capabilities?.getMaxAnisotropy?.() ?? 1
        this.waterDistributionTexture.anisotropy = Math.max(1, Math.min(8, maxAnisotropy))
        this.waterDistributionTexture.center.set(0.5, 0.5)
        this.waterDistributionTexture.repeat.set(1, 1)
        this.waterDistributionTexture.offset.set(0, 0)
        this.waterDistributionTexture.rotation = 0
        this.waterDistributionTexture.needsUpdate = true

        for(const mesh of this.waterMeshes)
        {
            if(!(mesh instanceof THREE.Mesh))
            {
                continue
            }

            const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const clonedMaterials = sourceMaterials.map((material) => this.createWaterMaterial(material))
            mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0]
        }

        this.applyBaseTintToFlatMeshes()
    }

    applyBaseTintToFlatMeshes()
    {
        for(const mesh of this.flatTintMeshes)
        {
            if(!(mesh instanceof THREE.Mesh))
            {
                continue
            }

            const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const tintedMaterials = sourceMaterials.map((material) => this.createFlatTintMaterial(material))
            mesh.material = Array.isArray(mesh.material) ? tintedMaterials : tintedMaterials[0]
        }
    }

    createWaterMaterial(baseMaterial)
    {
        const material = baseMaterial?.clone?.() ?? baseMaterial
        if(!material)
        {
            return material
        }

        material.alphaMap = this.waterDistributionTexture
        material.transparent = true
        material.alphaTest = 0.5
        material.depthWrite = false
        material.side = THREE.DoubleSide
        material.userData = material.userData || {}
        material.userData.isRecuperationVisibleGradientMaterial = true
        material.userData.recuperationVisibleGradientUniforms = {
            waterMask: { value: this.waterDistributionTexture },
            baseColor: { value: this.baseColor.clone() },
            deepFoamColor: { value: this.deepFoamColor.clone() },
            surfaceFoamColor: { value: this.surfaceFoamColor.clone() },
            localTime: { value: this.localTime },
            opacity: { value: this.opacity },
            patternScale: { value: this.patternScale },
            noiseSpeed: { value: this.noiseSpeed },
            noiseFrequency: { value: this.noiseFrequency },
            threshold: { value: this.threshold },
            intensity: { value: this.intensity },
            foamSoftness: { value: this.foamSoftness },
            foamCutoff: { value: this.foamCutoff },
            deepFoamThreshold: { value: this.deepFoamThreshold },
            deepFoamIntensity: { value: this.deepFoamIntensity },
            deepFoamSoftness: { value: this.deepFoamSoftness },
            bandAngle: { value: this.bandAngle },
            edgeContrast: { value: this.edgeContrast }
        }
        material.onBeforeCompile = (shader) =>
        {
            const uniforms = material.userData.recuperationVisibleGradientUniforms
            shader.uniforms.uWaterMask = uniforms.waterMask
            shader.uniforms.uRecuperationWaterBaseColor = uniforms.baseColor
            shader.uniforms.uRecuperationWaterDeepFoamColor = uniforms.deepFoamColor
            shader.uniforms.uRecuperationWaterSurfaceFoamColor = uniforms.surfaceFoamColor
            shader.uniforms.uRecuperationWaterTime = uniforms.localTime
            shader.uniforms.uOpacity = uniforms.opacity
            shader.uniforms.uRecuperationWaterPatternScale = uniforms.patternScale
            shader.uniforms.uRecuperationWaterNoiseSpeed = uniforms.noiseSpeed
            shader.uniforms.uRecuperationWaterNoiseFrequency = uniforms.noiseFrequency
            shader.uniforms.uRecuperationWaterThreshold = uniforms.threshold
            shader.uniforms.uRecuperationWaterIntensity = uniforms.intensity
            shader.uniforms.uRecuperationWaterFoamSoftness = uniforms.foamSoftness
            shader.uniforms.uRecuperationWaterFoamCutoff = uniforms.foamCutoff
            shader.uniforms.uRecuperationWaterDeepFoamThreshold = uniforms.deepFoamThreshold
            shader.uniforms.uRecuperationWaterDeepFoamIntensity = uniforms.deepFoamIntensity
            shader.uniforms.uRecuperationWaterDeepFoamSoftness = uniforms.deepFoamSoftness
            shader.uniforms.uRecuperationWaterBandAngle = uniforms.bandAngle
            shader.uniforms.uRecuperationWaterEdgeContrast = uniforms.edgeContrast

            applyStandardMaterialPatch(shader, recuperationWaterVisibleGradientShaderChunks)
        }
        material.customProgramCacheKey = () =>
        {
            const parentKey = typeof baseMaterial?.customProgramCacheKey === 'function'
                ? baseMaterial.customProgramCacheKey()
                : ''
            return `${parentKey}__recuperationVisibleGradientV3`
        }
        material.needsUpdate = true
        this.runtimeMaterials.push(material)
        return material
    }

    createFlatTintMaterial(baseMaterial)
    {
        const material = baseMaterial?.clone?.() ?? baseMaterial
        if(!material)
        {
            return material
        }

        material.color?.copy?.(this.baseColor)
        material.emissive?.set?.(0x000000)
        material.needsUpdate = true
        this.runtimeMaterials.push(material)
        return material
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debugParentFolder || this.debug.addFolder('Plan', {
            expanded: false
        })

        this.debug.addBinding(this.debugFolder, this, 'opacity', {
            label: 'Opacite',
            min: 0,
            max: 1,
            step: 0.01
        }).on('change', () =>
        {
            this.syncMaterialUniforms()
        })

        this.debug.addBinding(this.debugFolder, this, 'patternScale', {
            label: 'Echelle motif',
            min: 0.1,
            max: 8,
            step: 0.01
        }).on('change', () =>
        {
            this.syncMaterialUniforms()
        })

        this.debug.addBinding(this.debugFolder, this, 'noiseSpeed', {
            label: 'Vitesse bruit',
            min: -4,
            max: 4,
            step: 0.01
        }).on('change', () =>
        {
            this.syncMaterialUniforms()
        })

        this.debug.addBinding(this.debugFolder, this, 'noiseFrequency', {
            label: 'Frequence bruit',
            min: 0,
            max: 16,
            step: 0.01
        }).on('change', () =>
        {
            this.syncMaterialUniforms()
        })

        this.debug.addBinding(this.debugFolder, this, 'threshold', {
            label: 'Seuil mousse',
            min: 0,
            max: 1.5,
            step: 0.01
        }).on('change', () =>
        {
            this.syncMaterialUniforms()
        })

        this.debug.addBinding(this.debugFolder, this, 'intensity', {
            label: 'Intensite mousse',
            min: 0,
            max: 3,
            step: 0.01
        }).on('change', () =>
        {
            this.syncMaterialUniforms()
        })

        this.debug.addBinding(this.debugFolder, this, 'foamSoftness', {
            label: 'Douceur mousse',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.syncMaterialUniforms()
        })

        this.debug.addBinding(this.debugFolder, this, 'foamCutoff', {
            label: 'Seuil net mousse',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.syncMaterialUniforms()
        })

        this.debug.addBinding(this.debugFolder, this, 'deepFoamThreshold', {
            label: 'Seuil mousse profonde',
            min: 0,
            max: 1.5,
            step: 0.01
        }).on('change', () =>
        {
            this.syncMaterialUniforms()
        })

        this.debug.addBinding(this.debugFolder, this, 'deepFoamIntensity', {
            label: 'Intensite mousse profonde',
            min: 0,
            max: 3,
            step: 0.01
        }).on('change', () =>
        {
            this.syncMaterialUniforms()
        })

        this.debug.addBinding(this.debugFolder, this, 'deepFoamSoftness', {
            label: 'Douceur mousse profonde',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.syncMaterialUniforms()
        })

        this.debug.addBinding(this.debugFolder, this, 'bandAngle', {
            label: 'Angle bandes',
            min: -3.1416,
            max: 3.1416,
            step: 0.001
        }).on('change', () =>
        {
            this.syncMaterialUniforms()
        })

        this.debug.addBinding(this.debugFolder, this, 'edgeContrast', {
            label: 'Contraste bord',
            min: 0,
            max: 1,
            step: 0.01
        }).on('change', () =>
        {
            this.syncMaterialUniforms()
        })
    }

    syncMaterialUniforms()
    {
        for(const material of this.runtimeMaterials)
        {
            const uniforms = material?.userData?.recuperationVisibleGradientUniforms
            if(!uniforms)
            {
                continue
            }

            uniforms.baseColor.value.copy(this.baseColor)
            uniforms.deepFoamColor.value.copy(this.deepFoamColor)
            uniforms.surfaceFoamColor.value.copy(this.surfaceFoamColor)
            uniforms.opacity.value = this.opacity
            uniforms.patternScale.value = this.patternScale
            uniforms.noiseSpeed.value = this.noiseSpeed
            uniforms.noiseFrequency.value = this.noiseFrequency
            uniforms.threshold.value = this.threshold
            uniforms.intensity.value = this.intensity
            uniforms.foamSoftness.value = this.foamSoftness
            uniforms.foamCutoff.value = this.foamCutoff
            uniforms.deepFoamThreshold.value = this.deepFoamThreshold
            uniforms.deepFoamIntensity.value = this.deepFoamIntensity
            uniforms.deepFoamSoftness.value = this.deepFoamSoftness
            uniforms.bandAngle.value = this.bandAngle
            uniforms.edgeContrast.value = this.edgeContrast
            material.color?.copy?.(this.baseColor)
        }
    }

    update()
    {
        this.localTime = this.experience.time.elapsed * 0.001

        for(const material of this.runtimeMaterials)
        {
            const uniforms = material?.userData?.recuperationVisibleGradientUniforms
            if(!uniforms)
            {
                continue
            }

            uniforms.localTime.value = this.localTime
        }
    }

    destroy()
    {
        for(const material of this.runtimeMaterials)
        {
            material?.dispose?.()
        }

        this.runtimeMaterials = []
        this.waterMeshes = null
        this.flatTintMeshes = null
        this.recuperationModel = null
    }
}
