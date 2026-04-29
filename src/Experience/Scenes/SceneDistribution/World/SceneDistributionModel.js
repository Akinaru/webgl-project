import * as THREE from 'three'
import Experience from '../../../Experience.js'

const NON_COLLIDABLE_NAME_TOKENS = [
    'water',
    'cascade',
    'sphere',
    'sphère',
    'screen'
]
const WALKABLE_GROUND_NAME_TOKENS = [
    'sol',
    'ground',
    'floor',
    'chemin',
    'passerelle',
    'platform'
]

export default class SceneDistributionModel
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.resource = this.resources.items.distributionModel
        this.vanneMeshes = []

        if(this.resource?.scene)
        {
            this.setModel()
            return
        }

        this.setFallback()
    }

    setModel()
    {
        this.removeStaleRoots()

        this.model = this.resource.scene.clone(true)
        this.model.name = '__distributionModelRoot'
        this.model.userData.isDistributionModelRoot = true
        this.model.position.set(0, 0, 0)
        this.model.scale.set(1, 1, 1)

        this.collisionMeshes = []
        this.collisionBoxes = []
        this.groundMeshes = []
        this.vanneMeshes = []

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

            if(!this.shouldUseForCollision(child))
            {
                return
            }

            this.applyCollisionMaterialFixes(child)
            this.collisionMeshes.push(child)

            if(this.isWalkableGroundMesh(child))
            {
                this.groundMeshes.push(child)
            }

            if(this.hasNameInHierarchy(child, ['vanne']))
            {
                this.vanneMeshes.push(child)
            }
        })

        this.scene.add(this.model)
        this.model.updateMatrixWorld(true)
        this.buildCollisionBoxes()
        this.computeBoundsDataFrom(this.model)
    }

    setFallback()
    {
        this.fallback = new THREE.Mesh(
            new THREE.BoxGeometry(12, 1.5, 12),
            new THREE.MeshStandardMaterial({
                color: '#93a3b8',
                roughness: 0.7,
                metalness: 0.05
            })
        )
        this.fallback.position.y = 0.75
        this.fallback.castShadow = true
        this.fallback.receiveShadow = true
        this.fallback.userData.isDistributionModelRoot = true
        this.scene.add(this.fallback)
        this.fallback.updateMatrixWorld(true)

        this.collisionMeshes = [this.fallback]
        this.collisionBoxes = [new THREE.Box3().setFromObject(this.fallback)]
        this.groundMeshes = [this.fallback]
        this.computeBoundsDataFrom(this.fallback)
    }

    buildCollisionBoxes()
    {
        this.collisionBoxes = this.collisionBoxes ?? []
        this.collisionBoxes.length = 0
        const localBounds = new THREE.Box3()
        const worldBounds = new THREE.Box3()

        this.model.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh) || !child.geometry?.boundingBox)
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
        return !this.hasNameInHierarchy(mesh, NON_COLLIDABLE_NAME_TOKENS)
    }

    isWalkableGroundMesh(mesh)
    {
        return this.hasNameInHierarchy(mesh, WALKABLE_GROUND_NAME_TOKENS)
    }

    applyCollisionMaterialFixes(mesh)
    {
        const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]

        for(const material of materials)
        {
            if(!material)
            {
                continue
            }

            material.side = THREE.DoubleSide
            material.needsUpdate = true
        }
    }

    computeBoundsDataFrom(object3D)
    {
        this.worldBounds = new THREE.Box3().setFromObject(object3D)
        const center = this.worldBounds.getCenter(new THREE.Vector3())
        const size = this.worldBounds.getSize(new THREE.Vector3())
        const floorSurface = this.findFloorSurface()

        this.spawnPosition = new THREE.Vector3(
            floorSurface?.x ?? center.x,
            (floorSurface?.y ?? this.worldBounds.max.y) + 2.2,
            floorSurface?.z ?? center.z
        )
        this.boundaryRadius = Math.max(18, Math.max(size.x, size.z) * 0.6)
        this.boundaryBox = {
            minX: this.worldBounds.min.x,
            maxX: this.worldBounds.max.x,
            minZ: this.worldBounds.min.z,
            maxZ: this.worldBounds.max.z
        }
    }

    findFloorSurface()
    {
        const candidates = this.groundMeshes?.length > 0
            ? this.groundMeshes
            : this.collisionMeshes
        if(!Array.isArray(candidates) || candidates.length === 0)
        {
            return null
        }

        const bounds = new THREE.Box3()
        const center = new THREE.Vector3()
        let selected = null
        let selectedScore = -Infinity

        for(const mesh of candidates)
        {
            bounds.setFromObject(mesh)
            bounds.getCenter(center)
            const size = bounds.getSize(new THREE.Vector3())
            const score = size.x * size.z

            if(score <= selectedScore)
            {
                continue
            }

            selectedScore = score
            selected = {
                x: center.x,
                y: bounds.max.y,
                z: center.z
            }
        }

        return selected
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

    removeStaleRoots()
    {
        const staleRoots = []
        for(const child of this.scene.children)
        {
            if(child?.userData?.isDistributionModelRoot)
            {
                staleRoots.push(child)
            }
        }

        for(const staleRoot of staleRoots)
        {
            this.scene.remove(staleRoot)
        }
    }

    getCollisionBoxes()
    {
        return this.collisionBoxes ?? []
    }

    getCollisionMeshes()
    {
        return this.collisionMeshes ?? []
    }

    getGroundMeshes()
    {
        return this.groundMeshes?.length > 0
            ? this.groundMeshes
            : (this.collisionMeshes ?? [])
    }

    getVanneMeshes()
    {
        return this.vanneMeshes ?? []
    }

    getSpawnPosition()
    {
        return this.spawnPosition?.clone?.() ?? { x: 0, y: 3, z: 0 }
    }

    getBoundaryRadius()
    {
        return this.boundaryRadius ?? 48
    }

    getBoundaryBox()
    {
        return this.boundaryBox ? { ...this.boundaryBox } : null
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
            this.fallback.geometry?.dispose?.()
            this.fallback.material?.dispose?.()
            this.fallback = null
        }

        this.collisionMeshes = null
        this.collisionBoxes = null
        this.groundMeshes = null
        this.vanneMeshes = null
        this.spawnPosition = null
        this.worldBounds = null
        this.boundaryBox = null
    }
}
