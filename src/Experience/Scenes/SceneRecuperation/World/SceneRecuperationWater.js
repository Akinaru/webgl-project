import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class SceneRecuperationWater
{
    constructor({ recuperationModel = null } = {})
    {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.recuperationModel = recuperationModel
        this.waterDistributionTexture = this.resources.items.recuperationWaterDistributionTexture ?? null
        this.runtimeMaterials = []
        this.waterMeshes = this.recuperationModel?.getMeshesForNameTokens?.(['water'], { exact: true }) ?? []

        this.applyTexture()
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
        material.needsUpdate = true
        this.runtimeMaterials.push(material)
        return material
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
