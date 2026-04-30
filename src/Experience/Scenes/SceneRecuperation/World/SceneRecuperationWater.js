import * as THREE from 'three'
import Experience from '../../../Experience.js'
import { applyStandardMaterialPatch } from '../../Map/World/Shaders/Common/applyStandardMaterialPatch.js'
import { recuperationWaterVisibleGradientShaderChunks } from './Shaders/Water/visibleGradientShaderChunks.js'

const WATER_COLOR_A = '#5bc2b9'
const WATER_COLOR_B = '#13375f'
const WATER_OPACITY = 1

export default class SceneRecuperationWater
{
    constructor({ recuperationModel = null, debugParentFolder = null } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.resources = this.experience.resources
        this.recuperationModel = recuperationModel
        this.debugParentFolder = debugParentFolder
        this.waterDistributionTexture = this.resources.items.recuperationWaterDistributionTexture ?? null
        this.runtimeMaterials = []
        this.waterColorA = new THREE.Color(WATER_COLOR_A)
        this.waterColorB = new THREE.Color(WATER_COLOR_B)
        this.opacity = WATER_OPACITY
        this.localTime = 0
        this.waterMeshes = this.collectWaterMeshes()

        this.applyTexture()
        this.setDebug()
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

            if(!this.recuperationModel?.hasExactNameInHierarchy?.(child, ['water']))
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
            waterColorA: { value: this.waterColorA.clone() },
            waterColorB: { value: this.waterColorB.clone() },
            localTime: { value: this.localTime },
            opacity: { value: this.opacity }
        }
        material.onBeforeCompile = (shader) =>
        {
            const uniforms = material.userData.recuperationVisibleGradientUniforms
            shader.uniforms.uWaterMask = uniforms.waterMask
            shader.uniforms.uRecuperationWaterColorA = uniforms.waterColorA
            shader.uniforms.uRecuperationWaterColorB = uniforms.waterColorB
            shader.uniforms.uRecuperationWaterTime = uniforms.localTime
            shader.uniforms.uOpacity = uniforms.opacity

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

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('Water Recuperation', {
            parent: this.debugParentFolder,
            expanded: false
        })

        this.debug.addColorBinding(this.debugFolder, this, 'waterColorA', {
            label: 'Couleur bord'
        }).on('change', () =>
        {
            this.syncMaterialUniforms()
        })

        this.debug.addColorBinding(this.debugFolder, this, 'waterColorB', {
            label: 'Couleur centre'
        }).on('change', () =>
        {
            this.syncMaterialUniforms()
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

            uniforms.waterColorA.value.copy(this.waterColorA)
            uniforms.waterColorB.value.copy(this.waterColorB)
            uniforms.opacity.value = this.opacity
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
        this.recuperationModel = null
    }
}
