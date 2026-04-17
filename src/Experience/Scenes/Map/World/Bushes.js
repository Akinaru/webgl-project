import * as THREE from 'three'
import Experience from '../../../Experience.js'
import Foliage from './Foliage.js'

export default class Bushes
{
    constructor({ mapModel = null, spawnPosition = null } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug
        this.resources = this.experience.resources
        this.mapModel = mapModel
        this.spawnPosition = spawnPosition

        this.state = {
            decalageX: 1.6,
            decalageZ: -0.55,
            echelleBuisson: 0.38,
            nombreFeuilles: 80,
            tailleFeuille: 0.8,
            seuilAlpha: 0.4,
            melangeNormales: 0.85,
            rotationAleatoire: 9999
        }

        this.couleurFeuillage = new THREE.Color('#88a94a')

        this.raycaster = new THREE.Raycaster()
        this.rayOrigin = new THREE.Vector3()
        this.rayDirection = new THREE.Vector3(0, -1, 0)

        this.init()
    }

    init()
    {
        this.group = new THREE.Group()
        this.group.name = '__mapBushesRoot'
        this.foliageAlphaTexture = this.resources?.items?.bushFoliageAlphaTexture ?? null

        this.createFoliage()
        this.applyPosition()
        this.scene.add(this.group)
    }

    createFoliage()
    {
        this.foliage = new Foliage({
            planeCount: this.state.nombreFeuilles,
            planeSize: this.state.tailleFeuille,
            color: `#${this.couleurFeuillage.getHexString()}`,
            alphaTexture: this.foliageAlphaTexture,
            alphaTest: this.state.seuilAlpha,
            normalBlend: this.state.melangeNormales,
            rotationRandomness: this.state.rotationAleatoire
        })

        this.foliage.mesh.scale.setScalar(this.state.echelleBuisson)
        this.group.add(this.foliage.mesh)
    }

    rebuildFoliage()
    {
        this.foliage?.destroy?.()
        this.foliage = null
        this.createFoliage()
    }

    applyScale()
    {
        this.foliage?.mesh?.scale?.setScalar?.(this.state.echelleBuisson)
    }

    applyPosition()
    {
        const bushPosition = this.computeBushPosition()
        this.group.position.copy(bushPosition)
    }

    applyFoliageColor()
    {
        this.foliage?.setColor?.(this.couleurFeuillage)
    }

    applyFoliageAlpha()
    {
        this.foliage?.setAlphaTest?.(this.state.seuilAlpha)
    }

    computeBushPosition()
    {
        const basePosition = new THREE.Vector3(
            this.spawnPosition?.x ?? 0,
            this.spawnPosition?.y ?? 0,
            this.spawnPosition?.z ?? 0
        )

        basePosition.x += this.state.decalageX
        basePosition.z += this.state.decalageZ

        const groundedY = this.sampleGroundYAt(basePosition.x, basePosition.z)
        basePosition.y = groundedY

        return basePosition
    }

    sampleGroundYAt(x, z)
    {
        const groundMeshes = this.mapModel?.getGroundMeshes?.() ?? []
        if(groundMeshes.length === 0)
        {
            return 1.2
        }

        this.rayOrigin.set(x, 60, z)
        this.raycaster.set(this.rayOrigin, this.rayDirection)
        this.raycaster.far = 120

        const hit = this.raycaster.intersectObjects(groundMeshes, false)[0]
        if(!hit)
        {
            return 1.2
        }

        return hit.point.y
    }

    update(delta)
    {
        this.foliage?.update?.(delta)
    }

    setDebug({ parentFolder = null } = {})
    {
        if(!this.debug?.isDebugEnabled || !parentFolder)
        {
            return
        }

        this.debugFolder = parentFolder

        this.debug.addBinding(this.debugFolder, this.state, 'decalageX', {
            label: 'Decalage X',
            min: -20,
            max: 20,
            step: 0.01
        }).on('change', () =>
        {
            this.applyPosition()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'decalageZ', {
            label: 'Decalage Z',
            min: -20,
            max: 20,
            step: 0.01
        }).on('change', () =>
        {
            this.applyPosition()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'echelleBuisson', {
            label: 'Echelle buisson',
            min: 0.05,
            max: 2,
            step: 0.01
        }).on('change', () =>
        {
            this.applyScale()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'nombreFeuilles', {
            label: 'Nombre feuilles',
            min: 4,
            max: 300,
            step: 1
        }).on('change', () =>
        {
            this.state.nombreFeuilles = Math.max(1, Math.floor(this.state.nombreFeuilles))
            this.rebuildFoliage()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'tailleFeuille', {
            label: 'Taille feuille',
            min: 0.05,
            max: 3,
            step: 0.01
        }).on('change', () =>
        {
            this.rebuildFoliage()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'seuilAlpha', {
            label: 'Seuil alpha',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.applyFoliageAlpha()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'melangeNormales', {
            label: 'Melange normales',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.rebuildFoliage()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'rotationAleatoire', {
            label: 'Rotation aleatoire',
            min: 0,
            max: 20000,
            step: 1
        }).on('change', () =>
        {
            this.rebuildFoliage()
        })

        this.debug.addColorBinding(this.debugFolder, this, 'couleurFeuillage', {
            label: 'Couleur feuillage'
        }).on('change', () =>
        {
            this.applyFoliageColor()
        })
    }

    destroy()
    {
        this.foliage?.destroy?.()
        this.foliage = null

        if(this.group)
        {
            this.scene.remove(this.group)
            this.group = null
        }

        this.debugFolder = null
        this.raycaster = null
        this.foliageAlphaTexture = null
        this.resources = null
        this.debug = null
        this.mapModel = null
        this.spawnPosition = null
    }
}
