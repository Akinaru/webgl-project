import * as THREE from 'three'
import Experience from '../../../Experience.js'
import * as SceneRecyclageModelConstants from './Model.constants.js'

export default class SceneRecyclageModel
{
    constructor({
        resourceKey = 'recyclageModel',
        position = null,
        visible = true,
        clearExistingRoots = true,
        debugParentFolder = null
    } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.debug = this.experience.debug
        this.resourceKey = resourceKey
        this.debugParentFolder = debugParentFolder
        this.rootPosition = position instanceof THREE.Vector3
            ? position.clone()
            : new THREE.Vector3(position?.x ?? 0, position?.y ?? 0, position?.z ?? 0)
        this.initialVisible = visible !== false
        this.clearExistingRoots = clearExistingRoots !== false
        this.resource = this.resources.items[this.resourceKey]
        this.glassMaterials = []
        this.glassPatternTexture = this.createGlassPatternTexture()
        this.glassPatternOverlayMaterials = []
        this.glassUvSettings = {
            repeatX: SceneRecyclageModelConstants.VITRE_PATTERN_REPEAT_X,
            repeatY: SceneRecyclageModelConstants.VITRE_PATTERN_REPEAT_Y,
            offsetX: SceneRecyclageModelConstants.VITRE_PATTERN_OFFSET_X,
            offsetY: SceneRecyclageModelConstants.VITRE_PATTERN_OFFSET_Y,
            patternOpacity: SceneRecyclageModelConstants.VITRE_PATTERN_OPACITY
        }
        this.applyGlassTextureTransform()
        this.setDebug()

        if(this.resource?.scene)
        {
            this.setModel()
            return
        }

        this.setFallback()
    }

    setModel()
    {
        if(this.clearExistingRoots)
        {
            this.removeStaleRoots()
        }

        this.model = this.resource.scene.clone(true)
        this.model.name = '__recyclageModelRoot'
        this.model.userData.isRecyclageModelRoot = true
        this.model.position.copy(this.rootPosition)
        this.model.scale.set(1, 1, 1)
        this.model.visible = this.initialVisible

        this.collisionMeshes = []
        this.collisionBoxes = []
        this.groundMeshes = []
        this.consoleObject = null

        this.model.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            child.castShadow = true
            child.receiveShadow = true
            this.applyVisualMaterialOverrides(child)

            if(!child.geometry?.boundingBox)
            {
                child.geometry?.computeBoundingBox?.()
            }

            if(!this.consoleObject)
            {
                this.consoleObject = this.findAncestorByTokens(child, SceneRecyclageModelConstants.CONSOLE_NAME_TOKENS) ?? null
            }

            if(!child.geometry?.boundingBox || !this.shouldUseForCollision(child))
            {
                return
            }

            this.applyCollisionMaterialFixes(child)
            this.collisionMeshes.push(child)
            if(this.isWalkableGroundMesh(child))
            {
                this.groundMeshes.push(child)
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
                color: '#7e927d',
                roughness: 0.7,
                metalness: 0.05
            })
        )
        this.fallback.position.copy(this.rootPosition)
        this.fallback.position.y += 0.75
        this.fallback.castShadow = true
        this.fallback.receiveShadow = true
        this.fallback.userData.isRecyclageModelRoot = true
        this.fallback.visible = this.initialVisible
        this.scene.add(this.fallback)
        this.fallback.updateMatrixWorld(true)

        this.collisionMeshes = [this.fallback]
        this.collisionBoxes = [new THREE.Box3().setFromObject(this.fallback)]
        this.groundMeshes = [this.fallback]
        this.consoleObject = null
        this.computeBoundsDataFrom(this.fallback)
    }

    buildCollisionBoxes()
    {
        this.collisionBoxes = this.collisionBoxes ?? []
        this.collisionBoxes.length = 0
        const localBounds = new THREE.Box3()
        const worldBounds = new THREE.Box3()

        this.model?.traverse((child) =>
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
        return !this.hasNameInHierarchy(mesh, SceneRecyclageModelConstants.NON_COLLIDABLE_NAME_TOKENS)
    }

    isWalkableGroundMesh(mesh)
    {
        return this.hasNameInHierarchy(mesh, SceneRecyclageModelConstants.WALKABLE_GROUND_NAME_TOKENS)
    }

    applyCollisionMaterialFixes(mesh)
    {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]

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

    applyVisualMaterialOverrides(mesh)
    {
        const normalizedName = String(mesh.name || '').trim().toLowerCase()

        if(normalizedName === SceneRecyclageModelConstants.NANO_BOTS_TRANSPARENT_MESH_NAME)
        {
            this.applyGlassMaterial(mesh)
            return
        }

        if(normalizedName === SceneRecyclageModelConstants.VITRE_MESH_NAME)
        {
            this.applyGlassMaterial(mesh)
            return
        }

        if(SceneRecyclageModelConstants.POLYGONE_MATERIAL_MESH_NAMES.includes(normalizedName))
        {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            for(const material of materials)
            {
                if(!material)
                {
                    continue
                }

                material.roughness = SceneRecyclageModelConstants.POLYGONE_MATERIAL_ROUGHNESS
                material.metalness = SceneRecyclageModelConstants.POLYGONE_MATERIAL_METALNESS
                material.needsUpdate = true
            }
        }
    }

    applyGlassMaterial(mesh)
    {
        const glassMaterial = new THREE.MeshPhysicalMaterial({
            color: SceneRecyclageModelConstants.VITRE_COLOR,
            transparent: true,
            opacity: SceneRecyclageModelConstants.VITRE_OPACITY,
            roughness: SceneRecyclageModelConstants.VITRE_ROUGHNESS,
            metalness: 0,
            transmission: SceneRecyclageModelConstants.VITRE_TRANSMISSION,
            thickness: SceneRecyclageModelConstants.VITRE_THICKNESS,
            ior: SceneRecyclageModelConstants.VITRE_IOR,
            reflectivity: SceneRecyclageModelConstants.VITRE_REFLECTIVITY,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
            side: THREE.DoubleSide,
            depthWrite: false,
            envMapIntensity: 1.35
        })

        const previousMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        mesh.material = glassMaterial
        mesh.castShadow = false
        mesh.renderOrder = 1
        this.glassMaterials.push(glassMaterial)
        this.attachGlassPatternOverlay(mesh)

        for(const mat of previousMaterials)
        {
            mat?.dispose?.()
        }
    }

    createGlassPatternTexture()
    {
        const sourceTexture = this.resources.items.recyclageGlassPatternTexture
        if(!sourceTexture?.clone)
        {
            return null
        }

        const texture = sourceTexture.clone()
        texture.colorSpace = THREE.SRGBColorSpace
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.needsUpdate = true
        return texture
    }

    applyGlassTextureTransform()
    {
        if(!this.glassPatternTexture)
        {
            this.syncGlassPatternOpacity()
            return
        }

        this.glassPatternTexture.repeat.set(
            this.glassUvSettings.repeatX,
            this.glassUvSettings.repeatY
        )
        this.glassPatternTexture.offset.set(
            this.glassUvSettings.offsetX,
            this.glassUvSettings.offsetY
        )
        this.glassPatternTexture.needsUpdate = true
        this.syncGlassPatternOpacity()
    }

    syncGlassPatternOpacity()
    {
        for(const material of this.glassPatternOverlayMaterials)
        {
            material.opacity = this.glassUvSettings.patternOpacity
            material.needsUpdate = true
        }
    }

    attachGlassPatternOverlay(mesh)
    {
        if(!(mesh instanceof THREE.Mesh) || !this.glassPatternTexture)
        {
            return
        }

        const overlayMaterial = new THREE.MeshBasicMaterial({
            color: SceneRecyclageModelConstants.VITRE_PATTERN_TINT,
            map: this.glassPatternTexture,
            transparent: true,
            opacity: SceneRecyclageModelConstants.VITRE_PATTERN_OPACITY,
            side: THREE.DoubleSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
            toneMapped: false
        })
        const overlayMesh = new THREE.Mesh(mesh.geometry, overlayMaterial)
        overlayMesh.name = `${mesh.name || 'vitre'}_pattern_overlay`
        overlayMesh.renderOrder = 2
        overlayMesh.castShadow = false
        overlayMesh.receiveShadow = false
        overlayMesh.userData.isGlassPatternOverlay = true
        mesh.add(overlayMesh)
        this.glassPatternOverlayMaterials.push(overlayMaterial)
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled || !this.debugParentFolder)
        {
            return
        }

        this.debugFolder = this.debug.addFolder(SceneRecyclageModelConstants.VITRE_DEBUG_FOLDER_TITLE, {
            parent: this.debugParentFolder,
            expanded: false
        })

        this.addGlassUvBinding('Repeat X', 'repeatX', 0.01, 12, 0.01)
        this.addGlassUvBinding('Repeat Y', 'repeatY', 0.01, 12, 0.01)
        this.addGlassUvBinding('Offset X', 'offsetX', -4, 4, 0.001)
        this.addGlassUvBinding('Offset Y', 'offsetY', -4, 4, 0.001)
        this.addGlassUvBinding(
            'Opacité motif',
            'patternOpacity',
            SceneRecyclageModelConstants.VITRE_PATTERN_OPACITY_MIN,
            SceneRecyclageModelConstants.VITRE_PATTERN_OPACITY_MAX,
            0.001
        )
    }

    addGlassUvBinding(label, key, min, max, step)
    {
        this.debug.addBinding(this.debugFolder, this.glassUvSettings, key, {
            label,
            min,
            max,
            step
        })?.on?.('change', () =>
        {
            this.applyGlassTextureTransform()
        })
    }

    computeBoundsDataFrom(object3D)
    {
        this.worldBounds = new THREE.Box3().setFromObject(object3D)
        const center = this.worldBounds.getCenter(new THREE.Vector3())
        const size = this.worldBounds.getSize(new THREE.Vector3())
        const floorSurface = this.findFloorSurface()

        this.spawnPosition = new THREE.Vector3(
            floorSurface?.x ?? center.x,
            (floorSurface?.y ?? this.worldBounds.max.y) + 0.8,
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
        const candidates = this.groundMeshes?.length > 0 ? this.groundMeshes : this.collisionMeshes
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
        return Boolean(this.findAncestorByTokens(object, tokens))
    }

    findAncestorByTokens(object, tokens = [])
    {
        let current = object
        while(current)
        {
            const name = String(current?.name || '').toLowerCase()
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

    removeStaleRoots()
    {
        const staleRoots = []
        for(const child of this.scene.children)
        {
            if(child?.userData?.isRecyclageModelRoot)
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
        return this.groundMeshes?.length > 0 ? this.groundMeshes : (this.collisionMeshes ?? [])
    }

    getSpawnPosition()
    {
        return this.spawnPosition?.clone?.() ?? { x: 0, y: 2, z: 0 }
    }

    getBoundaryRadius()
    {
        return this.boundaryRadius ?? 48
    }

    getBoundaryBox()
    {
        return this.boundaryBox ? { ...this.boundaryBox } : null
    }

    getConsoleObject()
    {
        return this.consoleObject ?? null
    }

    setVisible(isVisible = true)
    {
        if(this.model)
        {
            this.model.visible = isVisible === true
        }

        if(this.fallback)
        {
            this.fallback.visible = isVisible === true
        }
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugFolder = null

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
        for(const material of this.glassMaterials)
        {
            material?.dispose?.()
        }
        this.glassMaterials = []
        for(const material of this.glassPatternOverlayMaterials)
        {
            material?.dispose?.()
        }
        this.glassPatternOverlayMaterials = []
        this.glassPatternTexture?.dispose?.()
        this.glassPatternTexture = null
        this.consoleObject = null
        this.spawnPosition = null
        this.worldBounds = null
        this.boundaryBox = null
    }
}
