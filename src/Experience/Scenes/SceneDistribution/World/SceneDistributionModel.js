import * as THREE from 'three'
import Experience from '../../../Experience.js'
import * as SceneDistributionModelConstants from './SceneDistributionModel.constants.js'
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
        this.tubeWaterMeshes = []

        this.model.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            child.castShadow = true
            child.receiveShadow = true
            this.applyTransparentMaterialRules(child)

            if(!child.geometry?.boundingBox)
            {
                child.geometry?.computeBoundingBox?.()
            }

            if(!child.geometry?.boundingBox)
            {
                return
            }

            if(this.hasNameInHierarchy(child, SceneDistributionModelConstants.TUBE_WATER_NAME_TOKENS))
            {
                this.tubeWaterMeshes.push(child)
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

            if(this.hasNameInHierarchy(child, SceneDistributionModelConstants.VANNE_NAME_TOKENS))
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
        if(this.hasNameInHierarchy(mesh, SceneDistributionModelConstants.COLLIDABLE_OVERRIDE_NAME_TOKENS))
        {
            return true
        }

        if(this.hasNameInHierarchy(mesh, SceneDistributionModelConstants.NON_COLLIDABLE_NAME_TOKENS))
        {
            return false
        }

        if(!this.isPalmTreePart(mesh))
        {
            return true
        }

        const meshName = (mesh.name || '').toLowerCase()
        const isTrunk = SceneDistributionModelConstants.PALM_TRUNK_NAME_TOKENS.some((token) => meshName.includes(token))
        return isTrunk
    }

    isWalkableGroundMesh(mesh)
    {
        return this.hasNameInHierarchy(mesh, SceneDistributionModelConstants.WALKABLE_GROUND_NAME_TOKENS)
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

    applyTransparentMaterialRules(mesh)
    {
        const meshName = (mesh.name || '').toLowerCase()
        const isTransparentTarget = SceneDistributionModelConstants.TRANSPARENT_EXACT_NAMES.has(meshName)
            || SceneDistributionModelConstants.TRANSPARENT_PREFIXES.some((prefix) => meshName.startsWith(prefix))

        if(!isTransparentTarget)
        {
            return
        }

        const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]

        for(const material of materials)
        {
            if(!material)
            {
                continue
            }

            material.transparent = true
            material.opacity = SceneDistributionModelConstants.TRANSPARENT_OPACITY
            material.depthWrite = false
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

    isPalmTreePart(object)
    {
        return this.hasNameInHierarchy(object, SceneDistributionModelConstants.PALM_TREE_NAME_TOKENS)
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

    getTubeWaterMeshes()
    {
        return this.tubeWaterMeshes ?? []
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

    getMeshesForNameTokens(tokens = [], { exact = false } = {})
    {
        const root = this.model ?? this.fallback
        if(!root || !Array.isArray(tokens) || tokens.length === 0)
        {
            return []
        }

        const normalizedTokens = tokens
            .map((token) => String(token || '').toLowerCase().trim())
            .filter(Boolean)
        if(normalizedTokens.length === 0)
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

            const nodeName = String(child?.name || '').toLowerCase().trim()
            if(nodeName === '')
            {
                return
            }

            const isMatch = exact
                ? normalizedTokens.includes(nodeName)
                : normalizedTokens.some((token) => nodeName.includes(token))
            if(isMatch)
            {
                meshes.push(child)
            }
        })

        return meshes
    }

    getFirstObjectForNameTokens(tokens = [], { exact = false } = {})
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

        let matchedObject = null
        root.traverse((child) =>
        {
            if(matchedObject)
            {
                return
            }

            const nodeName = String(child?.name || '').toLowerCase().trim()
            if(nodeName === '')
            {
                return
            }

            const isMatch = exact
                ? normalizedTokens.includes(nodeName)
                : normalizedTokens.some((token) => nodeName.includes(token))

            if(isMatch)
            {
                matchedObject = child
            }
        })

        return matchedObject
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

        return hasBounds ? aggregateBounds.clone() : null
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
        this.tubeWaterMeshes = null
        this.spawnPosition = null
        this.worldBounds = null
        this.boundaryBox = null
    }
}
