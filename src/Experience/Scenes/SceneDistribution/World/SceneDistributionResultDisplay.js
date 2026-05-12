import * as THREE from 'three'
import Experience from '../../../Experience.js'
import * as SceneDistributionResultConstants from './SceneDistributionResult.constants.js'
import MetierEnum from '../../../Enum/MetierEnum.js'
import * as SceneDistributionResultDisplayConstants from './SceneDistributionResultDisplay.constants.js'

export default class SceneDistributionResultDisplay
{
    constructor({
        distributionModel = null,
        debugParentFolder = null
    } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.distributionModel = distributionModel
        this.debugParentFolder = debugParentFolder
        this.loader = new THREE.TextureLoader()
        this.textureByMetier = new Map()
        this.screenEntries = []
        this.activeMetier = null
        this.settings = {
            emissiveIntensity: SceneDistributionResultConstants.RESULT_SCREEN_EMISSIVE_INTENSITY
        }

        this.setScreens()
        this.setDebug()
    }

    setScreens()
    {
        const screenMeshes = this.distributionModel?.getMeshesForNameTokens?.([SceneDistributionResultDisplayConstants.RESULT_SCREEN_TARGET_NAME_PREFIX]) ?? []
        const resultEntries = screenMeshes.filter((mesh) =>
            mesh instanceof THREE.Mesh
            && this.isResultScreenMesh(mesh)
        )

        for(const entry of resultEntries)
        {
            const sourceMaterials = Array.isArray(entry.material) ? entry.material : [entry.material]
            const runtimeMaterials = sourceMaterials.map((material) =>
            {
                const runtimeMaterial = material?.clone?.() ?? material
                if(!runtimeMaterial)
                {
                    return runtimeMaterial
                }

                runtimeMaterial.side = THREE.DoubleSide
                runtimeMaterial.needsUpdate = true
                return runtimeMaterial
            })

            entry.material = Array.isArray(entry.material) ? runtimeMaterials : runtimeMaterials[0]
            this.screenEntries.push({
                mesh: entry,
                materials: runtimeMaterials
            })
        }
    }

    isResultScreenMesh(mesh)
    {
        const meshName = String(mesh?.name || '').toLowerCase().trim()
        if(!meshName.startsWith(SceneDistributionResultDisplayConstants.RESULT_SCREEN_TARGET_NAME_PREFIX))
        {
            return false
        }

        return this.hasNameTokenInHierarchy(mesh, SceneDistributionResultDisplayConstants.RESULT_SCREEN_HIERARCHY_TOKENS)
    }

    hasNameTokenInHierarchy(object, tokens = [])
    {
        let current = object
        while(current)
        {
            const nodeName = String(current.name || '').toLowerCase().trim()
            for(const token of tokens)
            {
                if(nodeName.includes(token))
                {
                    return true
                }
            }
            current = current.parent
        }
        return false
    }

    showMetierResult(metierId = null)
    {
        if(!metierId)
        {
            return
        }

        this.activeMetier = metierId
        const texture = this.getTextureForMetier(metierId)
        if(!texture)
        {
            return
        }

        for(const entry of this.screenEntries)
        {
            for(const material of entry.materials)
            {
                if(!material)
                {
                    continue
                }

                if('map' in material)
                {
                    material.map = texture
                }
                if('emissiveMap' in material)
                {
                    material.emissiveMap = texture
                }
                material.color?.set?.('#ffffff')
                material.emissive?.set?.('#ffffff')
                material.emissiveIntensity = this.settings.emissiveIntensity
                material.transparent = false
                material.opacity = 1
                material.needsUpdate = true
            }
        }
    }

    getTextureForMetier(metierId)
    {
        if(this.textureByMetier.has(metierId))
        {
            return this.textureByMetier.get(metierId)
        }

        const imagePath = SceneDistributionResultConstants.RESULT_IMAGE_BY_METIER[metierId] ?? null
        if(!imagePath)
        {
            return null
        }

        const texture = this.loader.load(imagePath)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.flipY = false
        texture.needsUpdate = true
        this.textureByMetier.set(metierId, texture)
        return texture
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('Distribution result screens', {
            parent: this.debugParentFolder || this.debug.ui,
            expanded: false
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'emissiveIntensity', {
            label: 'unused intensity',
            min: 0,
            max: 2,
            step: 0.01
        }).on('change', () =>
        {
            if(this.activeMetier)
            {
                this.showMetierResult(this.activeMetier)
            }
        })

        this.debug.addButtons(this.debugFolder, {
            label: 'Test image',
            columns: 2,
            buttons: [
                {
                    label: 'Inventeur',
                    onClick: () => this.showMetierResult(MetierEnum.INVENTEUR)
                },
                {
                    label: 'Meneur',
                    onClick: () => this.showMetierResult(MetierEnum.MENEUR)
                },
                {
                    label: 'Travailleur',
                    onClick: () => this.showMetierResult(MetierEnum.TRAVAILLEUR)
                },
                {
                    label: 'Botaniste',
                    onClick: () => this.showMetierResult(MetierEnum.BOTANISTE)
                }
            ]
        })

        this.debug.addButtons(this.debugFolder, {
            label: 'Test couleur',
            columns: 3,
            buttons: [
                {
                    label: 'Rouge',
                    onClick: () => this.showSolidColor('#ff3b30')
                },
                {
                    label: 'Vert',
                    onClick: () => this.showSolidColor('#34c759')
                },
                {
                    label: 'Bleu',
                    onClick: () => this.showSolidColor('#0a84ff')
                }
            ]
        })
    }

    showSolidColor(colorHex = '#ffffff')
    {
        for(const entry of this.screenEntries)
        {
            for(const material of entry.materials)
            {
                if(!material)
                {
                    continue
                }

                if('map' in material)
                {
                    material.map = null
                }
                if('emissiveMap' in material)
                {
                    material.emissiveMap = null
                }
                material.color?.set?.(colorHex)
                material.emissive?.set?.(colorHex)
                material.emissiveIntensity = this.settings.emissiveIntensity
                material.transparent = false
                material.opacity = 1
                material.needsUpdate = true
            }
        }
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugFolder = null
        for(const texture of this.textureByMetier.values())
        {
            texture?.dispose?.()
        }
        this.textureByMetier.clear()
        this.screenEntries = []
        this.distributionModel = null
    }
}
