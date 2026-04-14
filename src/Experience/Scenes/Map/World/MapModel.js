import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class MapModel
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources

        this.resource = this.resources.items.mapModel

        if(this.resource?.scene)
        {
            this.setModel()
        }
        else
        {
            this.setFallback()
        }
    }

    setModel()
    {
        this.removeStaleMapRoots()

        if(this.model)
        {
            this.scene.remove(this.model)
            this.model = null
        }

        if(this.fallback)
        {
            this.scene.remove(this.fallback)
            this.fallback.geometry.dispose()
            this.fallback.material.dispose()
            this.fallback = null
        }

        this.model = this.resource.scene.clone(true)
        this.model.name = '__mapModelRoot'
        this.model.userData.isMapModelRoot = true
        this.model.position.set(0, 0, 0)
        this.model.scale.set(1, 1, 1)
        this.collisionBoxes = []
        this.collisionMeshes = []

        this.model.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            child.castShadow = true
            child.receiveShadow = true

            if(!child.geometry?.boundingBox)
            {
                child.geometry?.computeBoundingBox?.()
            }

            if(!child.geometry?.boundingBox)
            {
                return
            }

            const size = new THREE.Vector3()
            child.geometry.boundingBox.getSize(size)
            if(!this.shouldUseForCollision(child))
            {
                return
            }

            this.collisionMeshes.push(child)
        })

        this.scene.add(this.model)
        this.model.updateMatrixWorld(true)
        this.buildCollisionBoxes()
    }

    setFallback()
    {
        this.fallback = new THREE.Mesh(
            new THREE.BoxGeometry(8, 2, 8),
            new THREE.MeshStandardMaterial({
                color: '#607088',
                roughness: 0.6,
                metalness: 0.05
            })
        )
        this.fallback.position.y = 1
        this.fallback.castShadow = true
        this.fallback.receiveShadow = true
        this.fallback.userData.isMapModelRoot = true
        this.scene.add(this.fallback)
        this.fallback.updateMatrixWorld(true)
        this.collisionBoxes = [new THREE.Box3().setFromObject(this.fallback)]
        this.collisionMeshes = [this.fallback]
    }

    buildCollisionBoxes()
    {
        this.collisionBoxes = []
        const localBounds = new THREE.Box3()
        const worldBounds = new THREE.Box3()

        this.model.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh) || !child.geometry)
            {
                return
            }

            if(!child.geometry.boundingBox)
            {
                child.geometry.computeBoundingBox()
            }

            if(!child.geometry.boundingBox)
            {
                return
            }

            if(!this.shouldUseForCollision(child))
            {
                return
            }

            localBounds.copy(child.geometry.boundingBox)
            worldBounds.copy(localBounds).applyMatrix4(child.matrixWorld)
            this.collisionBoxes.push(worldBounds.clone())
        })
    }

    shouldUseForCollision(mesh)
    {
        const meshName = (mesh.name || '').toLowerCase()
        const isPalmTreePart = this.isPalmTreePart(mesh)

        if(!isPalmTreePart)
        {
            return true
        }

        const isTrunk = meshName.includes('tronc') || meshName.includes('trunk')
        return isTrunk
    }

    isPalmTreePart(object)
    {
        let current = object
        while(current)
        {
            const name = (current.name || '').toLowerCase()
            if(name.includes('palmier') || name.includes('palm'))
            {
                return true
            }
            current = current.parent
        }
        return false
    }

    getCollisionBoxes()
    {
        return this.collisionBoxes ?? []
    }

    getCollisionMeshes()
    {
        return this.collisionMeshes ?? []
    }

    getBloomGroundMeshes()
    {
        const meshes = this.collisionMeshes ?? []
        return meshes.filter((mesh) => this.isBloomWalkableSurface(mesh))
    }

    getBloomAvoidZones()
    {
        if(!this.model)
        {
            return []
        }

        const zones = []
        const bounds = new THREE.Box3()
        const center = new THREE.Vector3()
        const size = new THREE.Vector3()

        this.model.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            const isWater = this.hasNameInHierarchy(child, ['water', 'eau'])
            const isFountain = this.hasNameInHierarchy(child, ['fontaine', 'fountain'])
            if(!isWater && !isFountain)
            {
                return
            }

            bounds.setFromObject(child)
            bounds.getCenter(center)
            bounds.getSize(size)

            const radius = (Math.max(size.x, size.z) * 0.5) + (isFountain ? 0.9 : 0.7)
            zones.push({
                x: center.x,
                z: center.z,
                radius
            })
        })

        return zones
    }

    getBridgeTeleportZone({ preferredBridge = 'cloneur_4' } = {})
    {
        if(!this.model)
        {
            return null
        }

        const bounds = new THREE.Box3()
        const center = new THREE.Vector3()
        const size = new THREE.Vector3()
        const cloneurCandidates = []
        const cloneurSeen = new Set()
        const bridgeCandidates = []
        const preferredNormalized = String(preferredBridge || '').toLowerCase()
        const preferredCloneurIndex = this.parseCloneurIndex(preferredNormalized)
        let bestZone = null
        let bestScore = -Infinity

        this.model.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            const isBridge = this.hasNameInHierarchy(child, ['pont', 'bridge'])
            if(!isBridge)
            {
                return
            }

            bounds.setFromObject(child)
            bounds.getCenter(center)
            bounds.getSize(size)

            const candidate = {
                x: center.x,
                y: bounds.max.y + 0.08,
                z: center.z,
                radius: Math.max(1.2, Math.min(2.6, Math.max(size.x, size.z) * 0.22)),
                score: size.x * size.z,
                child
            }
            bridgeCandidates.push(candidate)

            const cloneurRoot = this.findAncestorByTokens(child, ['cloneur'])
            if(!cloneurRoot || cloneurSeen.has(cloneurRoot.uuid))
            {
                return
            }

            cloneurSeen.add(cloneurRoot.uuid)
            bounds.setFromObject(cloneurRoot)
            bounds.getCenter(center)
            bounds.getSize(size)
            cloneurCandidates.push({
                x: center.x,
                y: bounds.max.y + 0.08,
                z: center.z,
                radius: Math.max(1.2, Math.min(2.8, Math.max(size.x, size.z) * 0.2))
            })
        })

        if(cloneurCandidates.length > 0)
        {
            cloneurCandidates.sort((a, b) =>
            {
                if(a.z !== b.z)
                {
                    return a.z - b.z
                }
                return a.x - b.x
            })
        }

        if(preferredCloneurIndex !== null && cloneurCandidates.length >= preferredCloneurIndex)
        {
            return cloneurCandidates[preferredCloneurIndex - 1]
        }

        for(const candidate of bridgeCandidates)
        {
            if(this.hasNameInHierarchy(candidate.child, [preferredNormalized]))
            {
                bestZone = {
                    x: candidate.x,
                    y: candidate.y,
                    z: candidate.z,
                    radius: candidate.radius
                }
                break
            }
        }

        if(bestZone)
        {
            return bestZone
        }

        for(const candidate of bridgeCandidates)
        {
            if(candidate.score > bestScore)
            {
                bestScore = candidate.score
                bestZone = {
                    x: candidate.x,
                    y: candidate.y,
                    z: candidate.z,
                    radius: candidate.radius
                }
            }
        }

        return bestZone
    }

    parseCloneurIndex(name)
    {
        const match = name.match(/cloneur[_\s.-]?(\d+)/i)
        if(!match)
        {
            return null
        }

        const parsed = Number(match[1])
        if(!Number.isFinite(parsed) || parsed < 1)
        {
            return null
        }

        return Math.floor(parsed)
    }

    findAncestorByTokens(object, tokens = [])
    {
        let current = object
        while(current)
        {
            const name = (current.name || '').toLowerCase()
            for(const token of tokens)
            {
                if(name.includes(token))
                {
                    return current
                }
            }
            current = current.parent
        }

        return null
    }

    isForbiddenBloomSurface(object)
    {
        return this.hasNameInHierarchy(object, ['water', 'eau', 'fontaine', 'fountain'])
    }

    isBloomWalkableSurface(object)
    {
        const isBridge = this.hasNameInHierarchy(object, ['pont', 'bridge'])
        if(isBridge)
        {
            return true
        }

        const inRelief = this.hasNameInHierarchy(object, ['relief'])
        if(!inRelief)
        {
            return false
        }

        return true
    }

    hasNameInHierarchy(object, tokens = [])
    {
        let current = object
        while(current)
        {
            const name = (current.name || '').toLowerCase()
            for(const token of tokens)
            {
                if(name.includes(token))
                {
                    return true
                }
            }
            current = current.parent
        }
        return false
    }

    removeStaleMapRoots()
    {
        const staleRoots = []
        for(const child of this.scene.children)
        {
            if(child?.userData?.isMapModelRoot)
            {
                staleRoots.push(child)
            }
        }

        for(const staleRoot of staleRoots)
        {
            this.scene.remove(staleRoot)
        }
    }

    destroy()
    {
        if(this.model)
        {
            this.scene.remove(this.model)
            this.model = null
        }

        if(this.fallback)
        {
            this.scene.remove(this.fallback)
            this.fallback.geometry.dispose()
            this.fallback.material.dispose()
            this.fallback = null
        }

        this.collisionBoxes = null
        this.collisionMeshes = null
    }
}
