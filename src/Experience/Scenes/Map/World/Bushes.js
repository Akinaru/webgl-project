import * as THREE from 'three'
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js'
import Experience from '../../../Experience.js'
import Foliage from './Foliage.js'

const INSTANCE_ATTEMPTS_FACTOR = 120
const INSTANCE_ATTEMPTS_MIN = 200

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
            nombreBuissons: 220,
            graineRepartition: 54348,
            distanceMinimale: 0.35,
            echelleMin: 0.26,
            echelleMax: 0.41,
            hauteurOffset: 0.02,
            normaleYMin: 0.337,
            margeHauteurHerbe: 0.08,
            nombreFeuilles: 80,
            tailleFeuille: 0.82,
            seuilAlpha: 0.38,
            melangeNormales: 0.85,
            rotationAleatoire: 9999,
            frequenceVent: 0.043,
            vitesseVent: 0.043,
            forceVent: 0.391,
            buissonsActifs: 0
        }

        this.couleurFeuillage = new THREE.Color('#88bb31')

        this.raycaster = new THREE.Raycaster()
        this.rayOrigin = new THREE.Vector3()
        this.rayDirection = new THREE.Vector3(0, -1, 0)
        this.worldNormal = new THREE.Vector3()
        this.tmpBounds = new THREE.Box3()
        this.tmpMeshBounds = new THREE.Box3()
        this.dummy = new THREE.Object3D()
        this.instanceColliders = []

        this.init()
    }

    init()
    {
        this.group = new THREE.Group()
        this.group.name = '__mapBushesRoot'
        this.foliageAlphaTexture = this.resources?.items?.bushFoliageAlphaTexture ?? null
        this.windPerlinTexture = this.createWindPerlinTexture()

        this.scene.add(this.group)
        this.rebuildInstances()
    }

    createSeededRandom(seed)
    {
        let state = seed >>> 0

        return () =>
        {
            state += 0x6D2B79F5
            let t = state
            t = Math.imul(t ^ (t >>> 15), t | 1)
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
    }

    createWindPerlinTexture(resolution = 128)
    {
        const safeResolution = Math.max(16, Math.floor(resolution))
        const noiseGenerator = new ImprovedNoise()
        const pixels = new Uint8Array(safeResolution * safeResolution * 4)
        const octaves = 4
        const persistence = 0.5
        const scale = 6
        let amplitudeSum = 0

        for(let octave = 0; octave < octaves; octave++)
        {
            amplitudeSum += Math.pow(persistence, octave)
        }

        for(let y = 0; y < safeResolution; y++)
        {
            for(let x = 0; x < safeResolution; x++)
            {
                const baseX = x / safeResolution
                const baseY = y / safeResolution
                let value = 0
                let amplitude = 1
                let frequency = 1

                for(let octave = 0; octave < octaves; octave++)
                {
                    value += noiseGenerator.noise(
                        baseX * scale * frequency,
                        baseY * scale * frequency,
                        0.37 * frequency
                    ) * amplitude

                    amplitude *= persistence
                    frequency *= 2
                }

                const normalized = THREE.MathUtils.clamp((value / amplitudeSum) * 0.5 + 0.5, 0, 1)
                const byteValue = Math.round(normalized * 255)
                const pixelOffset = ((y * safeResolution) + x) * 4

                pixels[pixelOffset] = byteValue
                pixels[pixelOffset + 1] = byteValue
                pixels[pixelOffset + 2] = byteValue
                pixels[pixelOffset + 3] = 255
            }
        }

        const texture = new THREE.DataTexture(
            pixels,
            safeResolution,
            safeResolution,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
        )
        if('NoColorSpace' in THREE)
        {
            texture.colorSpace = THREE.NoColorSpace
        }
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.generateMipmaps = true
        const maxAnisotropy = this.experience.renderer?.instance?.capabilities?.getMaxAnisotropy?.() ?? 1
        texture.anisotropy = Math.max(1, Math.min(8, maxAnisotropy))
        texture.needsUpdate = true

        return texture
    }

    createFoliageTemplate()
    {
        this.foliageTemplate = new Foliage({
            planeCount: this.state.nombreFeuilles,
            planeSize: this.state.tailleFeuille,
            color: `#${this.couleurFeuillage.getHexString()}`,
            alphaTexture: this.foliageAlphaTexture,
            alphaTest: this.state.seuilAlpha,
            normalBlend: this.state.melangeNormales,
            rotationRandomness: this.state.rotationAleatoire,
            windPerlinTexture: this.windPerlinTexture,
            windFrequency: this.state.frequenceVent,
            windTimeScale: this.state.vitesseVent,
            windStrength: this.state.forceVent,
            createMesh: false
        })
    }

    applyWindSettings()
    {
        this.foliageTemplate?.setWindSettings?.({
            frequency: this.state.frequenceVent,
            timeScale: this.state.vitesseVent,
            strength: this.state.forceVent
        })
    }

    createInstancedMesh()
    {
        const instanceCount = Math.max(1, Math.floor(this.state.nombreBuissons))

        this.instancedMesh = new THREE.InstancedMesh(
            this.foliageTemplate.geometry,
            this.foliageTemplate.material,
            instanceCount
        )
        this.instancedMesh.name = '__mapBushesInstanced'
        this.instancedMesh.castShadow = true
        this.instancedMesh.receiveShadow = true
        this.instancedMesh.frustumCulled = true
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

        this.group.add(this.instancedMesh)
    }

    computeReliefBounds(reliefMeshes)
    {
        let hasBounds = false

        for(const reliefMesh of reliefMeshes)
        {
            if(!(reliefMesh instanceof THREE.Mesh))
            {
                continue
            }

            this.tmpMeshBounds.setFromObject(reliefMesh)
            if(!hasBounds)
            {
                this.tmpBounds.copy(this.tmpMeshBounds)
                hasBounds = true
                continue
            }

            this.tmpBounds.union(this.tmpMeshBounds)
        }

        if(!hasBounds)
        {
            return null
        }

        return this.tmpBounds.clone()
    }

    isValidReliefHit(hit, waterlineMinY)
    {
        if(!hit?.point || !(hit.object instanceof THREE.Mesh))
        {
            return false
        }

        if(!this.mapModel?.hasNameInHierarchy?.(hit.object, ['relief']))
        {
            return false
        }

        if(hit.point.y < (waterlineMinY + this.state.margeHauteurHerbe))
        {
            return false
        }

        if(!hit.face?.normal)
        {
            return false
        }

        this.worldNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
        if(this.worldNormal.y < this.state.normaleYMin)
        {
            return false
        }

        return true
    }

    isFarEnoughFromOthers(point, acceptedPoints)
    {
        const minimumDistance = Math.max(0, this.state.distanceMinimale)
        if(minimumDistance <= 0 || acceptedPoints.length === 0)
        {
            return true
        }

        const minimumDistanceSq = minimumDistance * minimumDistance
        for(const acceptedPoint of acceptedPoints)
        {
            const dx = point.x - acceptedPoint.x
            const dz = point.z - acceptedPoint.z
            if((dx * dx) + (dz * dz) < minimumDistanceSq)
            {
                return false
            }
        }

        return true
    }

    collectInstancePoints(targetCount)
    {
        const reliefMeshes = this.mapModel?.getReliefMeshes?.() ?? []
        if(reliefMeshes.length === 0)
        {
            return []
        }

        const reliefBounds = this.computeReliefBounds(reliefMeshes)
        if(!reliefBounds)
        {
            return []
        }

        const random = this.createSeededRandom(Math.floor(this.state.graineRepartition) >>> 0)
        const waterlineMinY = this.mapModel?.getTerrainWaterlineMinY?.() ?? Number.NEGATIVE_INFINITY
        const topY = reliefBounds.max.y + 18
        const raycastFar = (topY - reliefBounds.min.y) + 18
        const maxAttempts = Math.max(INSTANCE_ATTEMPTS_MIN, targetCount * INSTANCE_ATTEMPTS_FACTOR)
        const acceptedPoints = []

        for(let attempt = 0; attempt < maxAttempts && acceptedPoints.length < targetCount; attempt++)
        {
            const x = THREE.MathUtils.lerp(reliefBounds.min.x, reliefBounds.max.x, random())
            const z = THREE.MathUtils.lerp(reliefBounds.min.z, reliefBounds.max.z, random())

            this.rayOrigin.set(x, topY, z)
            this.raycaster.set(this.rayOrigin, this.rayDirection)
            this.raycaster.far = raycastFar

            const hit = this.raycaster.intersectObjects(reliefMeshes, false)[0]
            if(!this.isValidReliefHit(hit, waterlineMinY))
            {
                continue
            }

            if(!this.isFarEnoughFromOthers(hit.point, acceptedPoints))
            {
                continue
            }

            acceptedPoints.push(hit.point.clone())
        }

        return acceptedPoints
    }

    applyInstanceMatrices()
    {
        if(!this.instancedMesh)
        {
            return
        }

        const desiredCount = Math.max(1, Math.floor(this.state.nombreBuissons))
        const points = this.collectInstancePoints(desiredCount)
        const scaleMin = Math.max(0.01, Math.min(this.state.echelleMin, this.state.echelleMax))
        const scaleMax = Math.max(scaleMin, Math.max(this.state.echelleMin, this.state.echelleMax))
        const random = this.createSeededRandom((Math.floor(this.state.graineRepartition) ^ 0x9E3779B9) >>> 0)
        const colliders = []

        let appliedCount = 0
        for(const point of points)
        {
            const scale = THREE.MathUtils.lerp(scaleMin, scaleMax, random())
            const yaw = random() * Math.PI * 2

            this.dummy.position.copy(point)
            this.dummy.position.y += this.state.hauteurOffset
            this.dummy.rotation.set(0, yaw, 0)
            this.dummy.scale.setScalar(scale)
            this.dummy.updateMatrix()

            this.instancedMesh.setMatrixAt(appliedCount, this.dummy.matrix)
            colliders.push({
                x: this.dummy.position.x,
                z: this.dummy.position.z,
                radius: Math.max(0.12, scale * 0.6)
            })
            appliedCount++
        }

        this.instancedMesh.count = appliedCount
        this.instancedMesh.instanceMatrix.needsUpdate = true
        this.instancedMesh.computeBoundingSphere()
        this.state.buissonsActifs = appliedCount
        this.instanceColliders = colliders
    }

    isPointInsideBush(x, z, extraRadius = 0.18)
    {
        if(!Number.isFinite(x) || !Number.isFinite(z) || !Array.isArray(this.instanceColliders))
        {
            return false
        }

        for(const collider of this.instanceColliders)
        {
            const radius = Math.max(0, (collider.radius ?? 0) + extraRadius)
            const dx = x - collider.x
            const dz = z - collider.z
            if((dx * dx) + (dz * dz) <= (radius * radius))
            {
                return true
            }
        }

        return false
    }

    disposeInstancedMesh()
    {
        if(!this.instancedMesh)
        {
            return
        }

        this.group.remove(this.instancedMesh)
        this.instancedMesh = null
        this.state.buissonsActifs = 0
    }

    disposeFoliageTemplate()
    {
        if(!this.foliageTemplate)
        {
            return
        }

        this.foliageTemplate.destroy?.()
        this.foliageTemplate = null
    }

    rebuildInstances()
    {
        this.state.nombreBuissons = Math.max(1, Math.floor(this.state.nombreBuissons))
        this.state.nombreFeuilles = Math.max(4, Math.floor(this.state.nombreFeuilles))
        this.state.graineRepartition = Math.max(0, Math.floor(this.state.graineRepartition))

        this.disposeInstancedMesh()
        this.disposeFoliageTemplate()

        this.createFoliageTemplate()
        this.createInstancedMesh()
        this.applyInstanceMatrices()
    }

    update(delta)
    {
        this.foliageTemplate?.update?.(delta)
    }

    setDebug({ parentFolder = null } = {})
    {
        if(!this.debug?.isDebugEnabled || !parentFolder)
        {
            return
        }

        this.debugFolder = parentFolder

        const rebuild = () =>
        {
            this.rebuildInstances()
        }

        this.debug.addBinding(this.debugFolder, this.state, 'nombreBuissons', {
            label: 'Nombre buissons',
            min: 1,
            max: 1200,
            step: 1
        }).on('change', rebuild)

        this.debug.addBinding(this.debugFolder, this.state, 'graineRepartition', {
            label: 'Graine repartition',
            min: 0,
            max: 999999,
            step: 1
        }).on('change', rebuild)

        this.debug.addBinding(this.debugFolder, this.state, 'distanceMinimale', {
            label: 'Distance minimale',
            min: 0,
            max: 4,
            step: 0.01
        }).on('change', rebuild)

        this.debug.addBinding(this.debugFolder, this.state, 'echelleMin', {
            label: 'Echelle min',
            min: 0.05,
            max: 2,
            step: 0.01
        }).on('change', rebuild)

        this.debug.addBinding(this.debugFolder, this.state, 'echelleMax', {
            label: 'Echelle max',
            min: 0.05,
            max: 2,
            step: 0.01
        }).on('change', rebuild)

        this.debug.addBinding(this.debugFolder, this.state, 'hauteurOffset', {
            label: 'Hauteur offset',
            min: -1,
            max: 1,
            step: 0.001
        }).on('change', rebuild)

        this.debug.addBinding(this.debugFolder, this.state, 'normaleYMin', {
            label: 'Normale Y min',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', rebuild)

        this.debug.addBinding(this.debugFolder, this.state, 'margeHauteurHerbe', {
            label: 'Marge hauteur herbe',
            min: -1,
            max: 3,
            step: 0.01
        }).on('change', rebuild)

        this.debug.addBinding(this.debugFolder, this.state, 'nombreFeuilles', {
            label: 'Nombre feuilles',
            min: 4,
            max: 400,
            step: 1
        }).on('change', rebuild)

        this.debug.addBinding(this.debugFolder, this.state, 'tailleFeuille', {
            label: 'Taille feuille',
            min: 0.05,
            max: 3,
            step: 0.01
        }).on('change', rebuild)

        this.debug.addBinding(this.debugFolder, this.state, 'seuilAlpha', {
            label: 'Seuil alpha',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', rebuild)

        this.debug.addBinding(this.debugFolder, this.state, 'melangeNormales', {
            label: 'Melange normales',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', rebuild)

        this.debug.addBinding(this.debugFolder, this.state, 'rotationAleatoire', {
            label: 'Rotation aleatoire',
            min: 0,
            max: 20000,
            step: 1
        }).on('change', rebuild)

        this.debug.addBinding(this.debugFolder, this.state, 'frequenceVent', {
            label: 'Frequence vent',
            min: 0,
            max: 2,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWindSettings()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'vitesseVent', {
            label: 'Vitesse vent',
            min: 0,
            max: 2,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWindSettings()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'forceVent', {
            label: 'Force vent',
            min: 0,
            max: 3,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWindSettings()
        })

        this.debug.addColorBinding(this.debugFolder, this, 'couleurFeuillage', {
            label: 'Couleur feuillage'
        }).on('change', rebuild)

        this.debug.addManualBinding(this.debugFolder, this.state, 'buissonsActifs', {
            label: 'Buissons actifs',
            readonly: true
        }, 'auto')
    }

    destroy()
    {
        this.disposeInstancedMesh()
        this.disposeFoliageTemplate()

        if(this.group)
        {
            this.scene.remove(this.group)
            this.group = null
        }

        this.debugFolder = null
        this.raycaster = null
        this.rayOrigin = null
        this.rayDirection = null
        this.worldNormal = null
        this.tmpBounds = null
        this.tmpMeshBounds = null
        this.dummy = null
        this.instanceColliders = null
        this.foliageAlphaTexture = null
        this.windPerlinTexture?.dispose?.()
        this.windPerlinTexture = null
        this.resources = null
        this.debug = null
        this.mapModel = null
        this.spawnPosition = null
    }
}
