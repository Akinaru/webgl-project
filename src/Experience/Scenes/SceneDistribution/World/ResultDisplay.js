import * as THREE from 'three'
import Experience from '../../../Experience.js'
import * as SceneDistributionResultConstants from './Result.constants.js'
import MetierEnum from '../../../Enum/MetierEnum.js'
import * as SceneDistributionResultDisplayConstants from './ResultDisplay.constants.js'

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
        this.textTextureByMetier = new Map()
        this.screenEntries = []
        this.activeMetier = null
        this.casinoState = null
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
                materials: runtimeMaterials,
                order: this.resolveScreenOrder(entry)
            })
        }

        this.screenEntries.sort((leftEntry, rightEntry) => leftEntry.order - rightEntry.order)
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
        const finalTextures = this.getFinalTexturesForMetier(metierId)
        if(!finalTextures)
        {
            return
        }

        this.casinoState = {
            metierId,
            elapsedMs: 0,
            frameElapsedMs: SceneDistributionResultConstants.RESULT_CASINO_FRAME_DURATION_MS,
            previousTextureIndex: -1,
            finalTextures
        }

        this.advanceCasinoFrame()
    }

    update(delta = this.experience.time.delta)
    {
        if(!this.casinoState)
        {
            return
        }

        const deltaMs = Number.isFinite(delta) ? delta : 0
        this.casinoState.elapsedMs += deltaMs
        this.casinoState.frameElapsedMs += deltaMs

        while(this.casinoState && this.casinoState.frameElapsedMs >= SceneDistributionResultConstants.RESULT_CASINO_FRAME_DURATION_MS)
        {
            this.casinoState.frameElapsedMs -= SceneDistributionResultConstants.RESULT_CASINO_FRAME_DURATION_MS
            this.advanceCasinoFrame()
        }

        if(this.casinoState && this.casinoState.elapsedMs >= SceneDistributionResultConstants.RESULT_CASINO_DURATION_MS)
        {
            const { finalTextures, metierId } = this.casinoState
            this.casinoState = null
            this.activeMetier = metierId
            this.applyTexturesToScreens(finalTextures)
        }
    }

    advanceCasinoFrame()
    {
        if(!this.casinoState)
        {
            return
        }

        const availableMetiers = Object.values(MetierEnum)
        if(availableMetiers.length === 0)
        {
            return
        }

        let nextTextureIndex = this.casinoState.previousTextureIndex
        if(availableMetiers.length === 1)
        {
            nextTextureIndex = 0
        }
        else
        {
            while(nextTextureIndex === this.casinoState.previousTextureIndex)
            {
                nextTextureIndex = Math.floor(Math.random() * availableMetiers.length)
            }
        }

        this.casinoState.previousTextureIndex = nextTextureIndex
        const texture = this.getTextureForMetier(availableMetiers[nextTextureIndex])
        if(!texture)
        {
            return
        }

        this.applyTexturesToScreens(this.screenEntries.map(() => texture))
    }

    getFinalTexturesForMetier(metierId)
    {
        const roleTexture = this.getTextureForMetier(metierId)
        const textTexture = this.getTextTextureForMetier(metierId)
        if(!roleTexture || !textTexture)
        {
            return null
        }

        return this.screenEntries.map((entry, index) =>
        {
            const screenIndex = this.getScreenIndex(entry, index)
            return screenIndex === SceneDistributionResultDisplayConstants.RESULT_TEXT_SCREEN_INDEX
                ? textTexture
                : roleTexture
        })
    }

    applyTexturesToScreens(textures = [])
    {
        for(const [index, entry] of this.screenEntries.entries())
        {
            const texture = textures[index] ?? null
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

    getTextTextureForMetier(metierId)
    {
        if(this.textTextureByMetier.has(metierId))
        {
            return this.textTextureByMetier.get(metierId)
        }

        const imagePath = SceneDistributionResultConstants.RESULT_TEXT_IMAGE_BY_METIER[metierId] ?? null
        if(!imagePath)
        {
            return null
        }

        const texture = this.loader.load(imagePath)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.flipY = false
        texture.needsUpdate = true
        this.textTextureByMetier.set(metierId, texture)
        return texture
    }

    resolveScreenOrder(mesh)
    {
        const exactScreenIndex = this.getScreenIndexFromName(mesh?.name)
        if(exactScreenIndex !== null)
        {
            return exactScreenIndex
        }

        return Number.isFinite(mesh?.position?.x) ? mesh.position.x : 0
    }

    getScreenIndex(entry, fallbackIndex = 0)
    {
        const exactScreenIndex = this.getScreenIndexFromName(entry?.mesh?.name)
        if(exactScreenIndex !== null)
        {
            return exactScreenIndex
        }

        return fallbackIndex + 1
    }

    getScreenIndexFromName(name)
    {
        const normalizedName = String(name || '').toLowerCase().trim()
        if(!normalizedName.startsWith(SceneDistributionResultDisplayConstants.RESULT_SCREEN_NAME_PREFIX))
        {
            return null
        }

        const suffix = normalizedName.slice(SceneDistributionResultDisplayConstants.RESULT_SCREEN_NAME_PREFIX.length)
        const parsedIndex = Number.parseInt(suffix, 10)
        return Number.isFinite(parsedIndex) ? parsedIndex : null
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
        for(const texture of this.textTextureByMetier.values())
        {
            texture?.dispose?.()
        }
        this.textTextureByMetier.clear()
        this.casinoState = null
        this.screenEntries = []
        this.distributionModel = null
    }
}
