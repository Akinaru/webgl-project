import * as THREE from 'three'
import Experience from '../../../Experience.js'

const NON_COLLIDABLE_NAME_TOKENS = [
    'water',
    'tube-water',
    'tube-join',
    'cascade',
    'sphere',
    'sphère',
    'screen'
]
const WALKABLE_GROUND_NAME_TOKENS = ['sol', 'chemin', 'passerelle']
const CLICKABLE_MATERIAL_NAMES = new Set(['materiau0', 'materiau1', 'materiau2'])
const TUBE_WATER_NAME_TOKEN = 'tube-water'

export default class Scene1Model
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.resource = this.resources.items.scene1Model

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
        this.removeStaleRoots()

        this.model = this.resource.scene.clone(true)
        this.model.name = '__scene1ModelRoot'
        this.model.userData.isScene1ModelRoot = true
        this.model.position.set(0, 0, 0)
        this.model.scale.set(1, 1, 1)

        this.collisionMeshes = []
        this.collisionBoxes = []
        this.groundMeshes = []
        this.clickableMaterialMeshes = []
        this.tubeWaterMeshes = []
        this.tubeWaterRotationTargets = []
        const tubeWaterTargetIds = new Set()

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

            if(this.isTubeWaterMesh(child))
            {
                this.applyCollisionMaterialFixes(child)
                this.tubeWaterMeshes.push(child)
                const rotationTarget = this.getTubeWaterRotationTargetFromObject(child)
                if(rotationTarget && !tubeWaterTargetIds.has(rotationTarget.uuid))
                {
                    tubeWaterTargetIds.add(rotationTarget.uuid)
                    this.tubeWaterRotationTargets.push(rotationTarget)
                }
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

            if(this.isClickableMaterialMesh(child))
            {
                this.clickableMaterialMeshes.push(child)
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
            new THREE.BoxGeometry(10, 1.5, 10),
            new THREE.MeshStandardMaterial({
                color: '#79889e',
                roughness: 0.7,
                metalness: 0.05
            })
        )
        this.fallback.position.y = 0.75
        this.fallback.castShadow = true
        this.fallback.receiveShadow = true
        this.fallback.userData.isScene1ModelRoot = true
        this.scene.add(this.fallback)
        this.fallback.updateMatrixWorld(true)

        this.collisionMeshes = [this.fallback]
        this.collisionBoxes = [new THREE.Box3().setFromObject(this.fallback)]
        this.groundMeshes = [this.fallback]
        this.clickableMaterialMeshes = []
        this.tubeWaterMeshes = []
        this.tubeWaterRotationTargets = []
        this.computeBoundsDataFrom(this.fallback)
    }

    buildCollisionBoxes()
    {
        this.collisionBoxes = []
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

    isClickableMaterialMesh(mesh)
    {
        const normalizedName = (mesh?.name || '')
            .toLowerCase()
            .replace(/[\s_-]+/g, '')
        return CLICKABLE_MATERIAL_NAMES.has(normalizedName)
    }

    isTubeWaterMesh(mesh)
    {
        return this.hasNameInHierarchy(mesh, [TUBE_WATER_NAME_TOKEN])
    }

    getTubeWaterRotationTargetFromObject(object)
    {
        let current = object
        while(current)
        {
            const name = String(current.name || '').toLowerCase()
            if(name.includes(TUBE_WATER_NAME_TOKEN))
            {
                return current
            }
            current = current.parent
        }

        return object ?? null
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
        this.boundaryRadius = Math.max(16, Math.max(size.x, size.z) * 0.6)
    }

    findFloorSurface()
    {
        const root = this.model ?? this.fallback
        if(!root)
        {
            return null
        }

        const bounds = new THREE.Box3()
        const center = new THREE.Vector3()
        let selected = null
        let selectedScore = -Infinity

        root.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            const inRoom2 = this.hasNameInHierarchy(child, ['room2', 'sol-room2'])
            if(inRoom2)
            {
                return
            }

            const isExactSol = this.hasExactNameInHierarchy(child, ['sol'])
            if(!isExactSol)
            {
                return
            }

            bounds.setFromObject(child)
            bounds.getCenter(center)
            const size = bounds.getSize(new THREE.Vector3())
            const score = size.x * size.z

            if(score <= selectedScore)
            {
                return
            }
            selectedScore = score

            selected = {
                x: center.x,
                y: bounds.max.y,
                z: center.z
            }
        })

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

    hasExactNameInHierarchy(object, names = [])
    {
        let current = object
        while(current)
        {
            const nodeName = (current.name || '').toLowerCase().trim()
            for(const name of names)
            {
                if(nodeName === name)
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
            if(child?.userData?.isScene1ModelRoot)
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
        return this.groundMeshes ?? this.collisionMeshes ?? []
    }

    getSpawnPosition()
    {
        return this.spawnPosition?.clone?.() ?? { x: 0, y: 3, z: 0 }
    }

    getClickableMaterialMeshes()
    {
        return this.clickableMaterialMeshes ?? []
    }

    getTubeWaterMeshes()
    {
        return this.tubeWaterMeshes ?? []
    }

    getTubeWaterRotationTargets()
    {
        return this.tubeWaterRotationTargets ?? []
    }

    getBoundsForNameTokens(tokens = [], { exact = false } = {})
    {
        const root = this.model ?? this.fallback
        if(!root || !Array.isArray(tokens) || tokens.length === 0)
        {
            return null
        }

        const normalizedTokens = tokens
            .map((token) => String(token || '').toLowerCase().trim())
            .filter(Boolean)
        if(normalizedTokens.length === 0)
        {
            return null
        }

        const aggregateBounds = new THREE.Box3()
        const objectBounds = new THREE.Box3()
        let hasBounds = false

        root.traverse((child) =>
        {
            const nodeName = String(child?.name || '').toLowerCase().trim()
            if(nodeName === '')
            {
                return
            }

            const isMatch = exact
                ? normalizedTokens.includes(nodeName)
                : normalizedTokens.some((token) => nodeName.includes(token))
            if(!isMatch)
            {
                return
            }

            objectBounds.setFromObject(child)
            if(objectBounds.isEmpty())
            {
                return
            }

            if(!hasBounds)
            {
                aggregateBounds.copy(objectBounds)
                hasBounds = true
                return
            }

            aggregateBounds.union(objectBounds)
        })

        if(!hasBounds)
        {
            return null
        }

        return aggregateBounds.clone()
    }

    getBoundaryRadius()
    {
        return this.boundaryRadius ?? 48
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
        this.groundMeshes = null
        this.clickableMaterialMeshes = null
        this.tubeWaterMeshes = null
        this.tubeWaterRotationTargets = null
        this.worldBounds = null
    }
}
