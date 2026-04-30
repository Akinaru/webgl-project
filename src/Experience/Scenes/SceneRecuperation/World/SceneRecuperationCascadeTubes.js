import * as THREE from 'three'
import Experience from '../../../Experience.js'
import { applyStandardMaterialPatch } from '../../Map/World/Shaders/Common/applyStandardMaterialPatch.js'
import { cascadeTubeShaderChunks } from './Shaders/CascadeTubes/cascadeTubeShaderChunks.js'

const CASCADE_PLANTS_NAME_TOKENS = ['cascade+plantes', 'cascade+tubes', 'cascade_plantes', 'pente_tubes', 'shad_tubes']
const CASCADE_BLUE_TUBE_NAME_TOKENS = ['tube-blue', 'shad_tubes-blue']

const DEFAULT_BASE_COLOR = '#13375f'
const DEFAULT_HIGHLIGHT_COLOR = '#5bc2b9'
const DEFAULT_FOAM_COLOR = '#ffffff'
const DEFAULT_FLOW_SPEED = 1.1
const DEFAULT_FLOW_SCALE = 0.9
const DEFAULT_FOAM_NOISE_FREQUENCY = 9.26
const DEFAULT_FOAM_THRESHOLD = 0.76
const DEFAULT_FOAM_SOFTNESS = 0.001
const DEFAULT_FOAM_INTENSITY = 1
const DEFAULT_FOAM_OPACITY = 1
const DEFAULT_OPACITY = 1
const DEFAULT_ROTATION_SALLE_CHOIX = 0.228
const DEFAULT_ROTATION_SALLE_TUBE = 0.196
const CASCADE_GROUP_SALLE_TUBE = 'salleTube'
const CASCADE_GROUP_SALLE_CHOIX = 'salleChoix'

export default class SceneRecuperationCascadeTubes
{
    constructor({ recuperationModel = null, debugParentFolder = null } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.recuperationModel = recuperationModel
        this.debugParentFolder = debugParentFolder
        this.runtimeMaterials = []
        this.localTime = 0

        this.baseColor = new THREE.Color(DEFAULT_BASE_COLOR)
        this.highlightColor = new THREE.Color(DEFAULT_HIGHLIGHT_COLOR)
        this.foamColor = new THREE.Color(DEFAULT_FOAM_COLOR)
        this.flowSpeed = DEFAULT_FLOW_SPEED
        this.flowScale = DEFAULT_FLOW_SCALE
        this.foamNoiseFrequency = DEFAULT_FOAM_NOISE_FREQUENCY
        this.foamThreshold = DEFAULT_FOAM_THRESHOLD
        this.foamSoftness = DEFAULT_FOAM_SOFTNESS
        this.foamIntensity = DEFAULT_FOAM_INTENSITY
        this.foamOpacity = DEFAULT_FOAM_OPACITY
        this.opacity = DEFAULT_OPACITY
        this.rotationSalleChoix = DEFAULT_ROTATION_SALLE_CHOIX
        this.rotationSalleTube = DEFAULT_ROTATION_SALLE_TUBE

        this.cascadeTubeMeshes = this.collectCascadeTubeMeshes()
        this.applyMaterials()
        this.setDebug()
    }

    collectCascadeTubeMeshes()
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

            if(!this.recuperationModel?.hasNameInHierarchy?.(child, CASCADE_PLANTS_NAME_TOKENS))
            {
                return
            }

            if(!this.recuperationModel?.hasNameInHierarchy?.(child, CASCADE_BLUE_TUBE_NAME_TOKENS))
            {
                return
            }

            meshes.push(child)
        })

        return meshes
    }

    applyMaterials()
    {
        for(const mesh of this.cascadeTubeMeshes)
        {
            const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const patchedMaterials = sourceMaterials.map((material) => this.createCascadeTubeMaterial(material, mesh))
            mesh.material = Array.isArray(mesh.material) ? patchedMaterials : patchedMaterials[0]
        }
    }

    createCascadeTubeMaterial(baseMaterial, mesh)
    {
        const material = baseMaterial?.clone?.() ?? baseMaterial
        if(!material)
        {
            return material
        }

        const groupKey = this.getCascadeTubeGroupKey(mesh)
        const patternOffset = this.createPatternOffset(mesh)
        const noiseSeed = this.createNoiseSeed(mesh)

        material.transparent = true
        material.side = THREE.DoubleSide
        material.depthWrite = true
        material.userData = material.userData || {}
        material.userData.isRecuperationCascadeTubeMaterial = true
        material.userData.recuperationCascadeTubeUniforms = {
            localTime: { value: this.localTime },
            baseColor: { value: this.baseColor.clone() },
            highlightColor: { value: this.highlightColor.clone() },
            foamColor: { value: this.foamColor.clone() },
            flowSpeed: { value: this.flowSpeed },
            flowScale: { value: this.flowScale },
            foamNoiseFrequency: { value: this.foamNoiseFrequency },
            foamThreshold: { value: this.foamThreshold },
            foamSoftness: { value: this.foamSoftness },
            foamIntensity: { value: this.foamIntensity },
            foamOpacity: { value: this.foamOpacity },
            opacity: { value: this.opacity },
            patternOffset: { value: patternOffset },
            noiseSeed: { value: noiseSeed },
            seamOffset: { value: this.getRotationValueForGroup(groupKey) },
            groupKey
        }

        material.onBeforeCompile = (shader) =>
        {
            const uniforms = material.userData.recuperationCascadeTubeUniforms
            shader.uniforms.uCascadeTime = uniforms.localTime
            shader.uniforms.uCascadeBaseColor = uniforms.baseColor
            shader.uniforms.uCascadeHighlightColor = uniforms.highlightColor
            shader.uniforms.uCascadeFoamColor = uniforms.foamColor
            shader.uniforms.uCascadeFlowSpeed = uniforms.flowSpeed
            shader.uniforms.uCascadeFlowScale = uniforms.flowScale
            shader.uniforms.uCascadeFoamNoiseFrequency = uniforms.foamNoiseFrequency
            shader.uniforms.uCascadeFoamThreshold = uniforms.foamThreshold
            shader.uniforms.uCascadeFoamSoftness = uniforms.foamSoftness
            shader.uniforms.uCascadeFoamIntensity = uniforms.foamIntensity
            shader.uniforms.uCascadeFoamOpacity = uniforms.foamOpacity
            shader.uniforms.uCascadeOpacity = uniforms.opacity
            shader.uniforms.uCascadePatternOffset = uniforms.patternOffset
            shader.uniforms.uCascadeNoiseSeed = uniforms.noiseSeed
            shader.uniforms.uCascadeSeamOffset = uniforms.seamOffset

            applyStandardMaterialPatch(shader, cascadeTubeShaderChunks)
        }

        material.customProgramCacheKey = () =>
        {
            const parentKey = typeof baseMaterial?.customProgramCacheKey === 'function'
                ? baseMaterial.customProgramCacheKey()
                : ''
            return `${parentKey}__recuperationCascadeTubeFlowV1`
        }

        material.needsUpdate = true
        this.runtimeMaterials.push(material)
        return material
    }

    createPatternOffset(mesh)
    {
        const worldPosition = new THREE.Vector3()
        mesh?.getWorldPosition?.(worldPosition)

        const seedY = Math.abs(Math.sin((worldPosition.z * 39.3468) + (worldPosition.y * 11.135) + (worldPosition.x * 5.913) + 1.91))

        return new THREE.Vector2(0, seedY * 5.0)
    }

    createNoiseSeed(mesh)
    {
        const worldPosition = new THREE.Vector3()
        mesh?.getWorldPosition?.(worldPosition)

        const seedA = Math.abs(Math.sin((worldPosition.x * 31.341) + (worldPosition.z * 17.417) + (worldPosition.y * 9.137) + 2.17))
        const seedB = Math.abs(Math.sin((worldPosition.x * 7.731) + (worldPosition.z * 27.913) + (worldPosition.y * 21.553) + 4.63))

        return new THREE.Vector2(
            (seedA * 4.0) + 0.13,
            (seedB * 4.0) + 0.29
        )
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

        this.debugFolder = this.debug.addFolder('Cascade de tuyaux', {
            parent: this.debugParentFolder || this.debug.ui,
            expanded: false
        })

        this.debug.addColorBinding(this.debugFolder, this, 'baseColor', {
            label: 'Couleur de base'
        }).on('change', () => this.syncMaterialUniforms())

        this.debug.addColorBinding(this.debugFolder, this, 'highlightColor', {
            label: 'Couleur de reflet'
        }).on('change', () => this.syncMaterialUniforms())

        this.debug.addColorBinding(this.debugFolder, this, 'foamColor', {
            label: 'Couleur de mousse'
        }).on('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.debugFolder, this, 'flowSpeed', {
            label: 'Vitesse du flux',
            min: -4,
            max: 4,
            step: 0.01
        }).on('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.debugFolder, this, 'flowScale', {
            label: 'Echelle du motif',
            min: 0.02,
            max: 2,
            step: 0.01
        }).on('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.debugFolder, this, 'foamNoiseFrequency', {
            label: 'Frequence du bruit de mousse',
            min: 0,
            max: 12,
            step: 0.01
        }).on('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.debugFolder, this, 'foamThreshold', {
            label: 'Largeur de mousse',
            min: 0,
            max: 1,
            step: 0.01
        }).on('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.debugFolder, this, 'foamSoftness', {
            label: 'Douceur de mousse',
            min: 0.001,
            max: 0.5,
            step: 0.001
        }).on('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.debugFolder, this, 'foamIntensity', {
            label: 'Intensite de mousse',
            min: 0,
            max: 2,
            step: 0.01
        }).on('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.debugFolder, this, 'foamOpacity', {
            label: 'Opacite de mousse',
            min: 0,
            max: 2,
            step: 0.01
        }).on('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.debugFolder, this, 'opacity', {
            label: 'Opacite du flux',
            min: 0,
            max: 1,
            step: 0.01
        }).on('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.debugFolder, this, 'rotationSalleChoix', {
            label: 'Rotation salle choix',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.debugFolder, this, 'rotationSalleTube', {
            label: 'Rotation salle tube',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () => this.syncMaterialUniforms())
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

            uniforms.baseColor.value.copy(this.baseColor)
            uniforms.highlightColor.value.copy(this.highlightColor)
            uniforms.foamColor.value.copy(this.foamColor)
            uniforms.flowSpeed.value = this.flowSpeed
            uniforms.flowScale.value = this.flowScale
            uniforms.foamNoiseFrequency.value = this.foamNoiseFrequency
            uniforms.foamThreshold.value = this.foamThreshold
            uniforms.foamSoftness.value = this.foamSoftness
            uniforms.foamIntensity.value = this.foamIntensity
            uniforms.foamOpacity.value = this.foamOpacity
            uniforms.opacity.value = this.opacity
            uniforms.seamOffset.value = this.getRotationValueForGroup(uniforms.groupKey)
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
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugFolder = null

        for(const material of this.runtimeMaterials)
        {
            material?.dispose?.()
        }

        this.runtimeMaterials = []
        this.cascadeTubeMeshes = null
        this.recuperationModel = null
    }
}
