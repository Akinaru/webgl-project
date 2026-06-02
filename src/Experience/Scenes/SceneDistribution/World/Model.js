import * as THREE from 'three'
import Experience from '../../../Experience.js'
import * as SceneDistributionModelConstants from './Model.constants.js'

const ROOM_END_WINDOW_EXACT_NAMES = new Set(['room_end.1'])

export default class SceneDistributionModel
{
    constructor({
        debugParentFolder = null
    } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.resource = this.resources.items.distributionModel
        this.backgroundOverrideTexture = this.resources.items.distributionBackgroundResultTexture ?? null
        this.debug = this.experience.debug
        this.debugParentFolder = debugParentFolder
        this.debugFolder = null
        this.debugStats = {
            roomEndMeshCount: 0,
            roomEndMaterialCount: 0,
            backgroundMaterialCount: 0
        }
        this.vanneMeshes = []
        this.roomEndWindowMaterials = []
        this.backgroundMaterials = []
        this.backgroundMeshes = []
        this.visualSettings = {
            roomEndWindowColor: SceneDistributionModelConstants.ROOM_END_WINDOW_COLOR,
            roomEndWindowOpacity: SceneDistributionModelConstants.ROOM_END_WINDOW_OPACITY,
            roomEndWindowTransmission: SceneDistributionModelConstants.ROOM_END_WINDOW_TRANSMISSION,
            roomEndWindowRoughness: SceneDistributionModelConstants.ROOM_END_WINDOW_ROUGHNESS,
            roomEndWindowMetalness: SceneDistributionModelConstants.ROOM_END_WINDOW_METALNESS,
            roomEndWindowIor: SceneDistributionModelConstants.ROOM_END_WINDOW_IOR,
            roomEndWindowThickness: SceneDistributionModelConstants.ROOM_END_WINDOW_THICKNESS,
            roomEndWindowEnvIntensity: SceneDistributionModelConstants.ROOM_END_WINDOW_ENV_INTENSITY,
            roomEndWindowAttenuationDistance: SceneDistributionModelConstants.ROOM_END_WINDOW_ATTENUATION_DISTANCE,
            roomEndWindowAttenuationColor: SceneDistributionModelConstants.ROOM_END_WINDOW_ATTENUATION_COLOR,
            roomEndWindowDepthWrite: SceneDistributionModelConstants.ROOM_END_WINDOW_DEPTH_WRITE,
            backgroundColor: SceneDistributionModelConstants.BACKGROUND_DEFAULT_COLOR,
            backgroundOpacity: SceneDistributionModelConstants.BACKGROUND_DEFAULT_OPACITY,
            backgroundDepthWrite: SceneDistributionModelConstants.BACKGROUND_DEFAULT_DEPTH_WRITE,
            backgroundSide: SceneDistributionModelConstants.BACKGROUND_DEFAULT_SIDE,
            backgroundScale: SceneDistributionModelConstants.BACKGROUND_SCALE_MULTIPLIER,
            backgroundVisible: true,
            backgroundTextureEnabled: SceneDistributionModelConstants.BACKGROUND_TEXTURE_ENABLED,
            backgroundTextureOffsetX: SceneDistributionModelConstants.BACKGROUND_TEXTURE_OFFSET_X,
            backgroundTextureOffsetY: SceneDistributionModelConstants.BACKGROUND_TEXTURE_OFFSET_Y,
            backgroundTextureRepeatX: SceneDistributionModelConstants.BACKGROUND_TEXTURE_REPEAT_X,
            backgroundTextureRepeatY: SceneDistributionModelConstants.BACKGROUND_TEXTURE_REPEAT_Y,
            backgroundTextureRotation: SceneDistributionModelConstants.BACKGROUND_TEXTURE_ROTATION,
            backgroundTextureCenterX: SceneDistributionModelConstants.BACKGROUND_TEXTURE_CENTER_X,
            backgroundTextureCenterY: SceneDistributionModelConstants.BACKGROUND_TEXTURE_CENTER_Y
        }

        if(this.backgroundOverrideTexture)
        {
            this.backgroundOverrideTexture.flipY = true
            this.backgroundOverrideTexture.needsUpdate = true
            this.backgroundOverrideTexture.center.set(
                this.visualSettings.backgroundTextureCenterX,
                this.visualSettings.backgroundTextureCenterY
            )
            this.backgroundOverrideTexture.offset.set(
                this.visualSettings.backgroundTextureOffsetX,
                this.visualSettings.backgroundTextureOffsetY
            )
            this.backgroundOverrideTexture.repeat.set(
                this.visualSettings.backgroundTextureRepeatX,
                this.visualSettings.backgroundTextureRepeatY
            )
            this.backgroundOverrideTexture.rotation = this.visualSettings.backgroundTextureRotation
        }

        if(this.resource?.scene)
        {
            this.setModel()
            this.setupDebug()
            return
        }

        this.setFallback()
        this.setupDebug()
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
        this.backgroundMeshes = []

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
            child.userData.forceBidirectionalCollision = this.hasNameInHierarchy(
                child,
                SceneDistributionModelConstants.BIDIRECTIONAL_COLLISION_NAME_TOKENS
            )
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
        const isBackground = SceneDistributionModelConstants.BACKGROUND_OVERRIDE_ENABLED === true
            && SceneDistributionModelConstants.BACKGROUND_NAME_TOKENS.some((token) => meshName.includes(token))
        const isRoomEndWindow = SceneDistributionModelConstants.ROOM_END_WINDOW_OVERRIDE_ENABLED === true
            && this.hasExactNameInHierarchy(mesh, ROOM_END_WINDOW_EXACT_NAMES)
        const isTransparentTarget = SceneDistributionModelConstants.TRANSPARENT_EXACT_NAMES.has(meshName)
            || SceneDistributionModelConstants.TRANSPARENT_PREFIXES.some((prefix) => meshName.startsWith(prefix))

        if(!isTransparentTarget && !isBackground)
        {
            return
        }

        if(isBackground)
        {
            if(!mesh.userData.distributionBackgroundBaseScale)
            {
                mesh.userData.distributionBackgroundBaseScale = {
                    x: mesh.scale.x,
                    y: mesh.scale.y,
                    z: mesh.scale.z
                }
            }

            const { x, y, z } = mesh.userData.distributionBackgroundBaseScale
            mesh.scale.set(
                x * this.visualSettings.backgroundScale,
                y * this.visualSettings.backgroundScale,
                z * this.visualSettings.backgroundScale
            )
            mesh.visible = this.visualSettings.backgroundVisible
            this.backgroundMeshes.push(mesh)
        }

        const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]
        const nextMaterials = []
        let shouldReplaceMaterial = false

        for(const material of materials)
        {
            if(!material)
            {
                nextMaterials.push(material)
                continue
            }

            let runtimeMaterial = material
            if(isTransparentTarget && !isRoomEndWindow)
            {
                runtimeMaterial.transparent = true
                runtimeMaterial.opacity = SceneDistributionModelConstants.TRANSPARENT_OPACITY
                runtimeMaterial.depthWrite = false
            }

            if(isRoomEndWindow)
            {
                runtimeMaterial = new THREE.MeshPhysicalMaterial({
                    color: new THREE.Color(this.visualSettings.roomEndWindowColor),
                    map: material.map ?? null,
                    alphaMap: material.alphaMap ?? null,
                    transparent: false,
                    opacity: 1,
                    transmission: this.visualSettings.roomEndWindowTransmission * this.visualSettings.roomEndWindowOpacity,
                    roughness: this.visualSettings.roomEndWindowRoughness,
                    metalness: this.visualSettings.roomEndWindowMetalness,
                    ior: this.visualSettings.roomEndWindowIor,
                    thickness: this.visualSettings.roomEndWindowThickness,
                    attenuationDistance: this.visualSettings.roomEndWindowAttenuationDistance,
                    attenuationColor: new THREE.Color(this.visualSettings.roomEndWindowAttenuationColor),
                    envMapIntensity: this.visualSettings.roomEndWindowEnvIntensity,
                    side: THREE.DoubleSide,
                    depthWrite: this.visualSettings.roomEndWindowDepthWrite,
                    depthTest: true
                })
                runtimeMaterial.name = `${material.name || mesh.name || 'room_end1'}_window`
                runtimeMaterial.userData.distributionRole = 'roomEndWindow'
                this.roomEndWindowMaterials.push(runtimeMaterial)
                material.dispose?.()
                shouldReplaceMaterial = true
            }

            if(isBackground)
            {
                runtimeMaterial = new THREE.MeshBasicMaterial({
                    color: runtimeMaterial.color?.clone?.() ?? new THREE.Color(this.visualSettings.backgroundColor),
                    map: this.backgroundOverrideTexture ?? runtimeMaterial.map ?? null,
                    alphaMap: runtimeMaterial.alphaMap ?? null,
                    transparent: this.visualSettings.backgroundOpacity < 1,
                    opacity: this.visualSettings.backgroundOpacity,
                    side: this.resolveBackgroundSide(this.visualSettings.backgroundSide),
                    depthWrite: this.visualSettings.backgroundDepthWrite,
                    depthTest: true
                })
                runtimeMaterial.name = `${material.name || mesh.name || 'background'}_unlit`
                runtimeMaterial.userData.distributionRole = 'backgroundUnlit'
                this.backgroundMaterials.push(runtimeMaterial)
                material.dispose?.()
                shouldReplaceMaterial = true
            }

            runtimeMaterial.needsUpdate = true
            nextMaterials.push(runtimeMaterial)
        }

        if(shouldReplaceMaterial)
        {
            mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0]
        }

        if(isBackground)
        {
            mesh.castShadow = false
            mesh.receiveShadow = false
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

    hasExactNameInHierarchy(object, exactNames = new Set())
    {
        if(!(exactNames instanceof Set) || exactNames.size === 0)
        {
            return false
        }

        let current = object
        while(current)
        {
            const name = String(current.name || '').toLowerCase().trim()
            if(exactNames.has(name))
            {
                return true
            }
            current = current.parent
        }

        return false
    }

    isPalmTreePart(object)
    {
        return this.hasNameInHierarchy(object, SceneDistributionModelConstants.PALM_TREE_NAME_TOKENS)
    }

    resolveBackgroundSide(sideToken)
    {
        if(sideToken === 'front')
        {
            return THREE.FrontSide
        }

        if(sideToken === 'double')
        {
            return THREE.DoubleSide
        }

        return THREE.BackSide
    }

    applyVisualSettings()
    {
        const root = this.model ?? this.fallback
        this.roomEndWindowMaterials = []
        this.backgroundMaterials = []
        this.backgroundMeshes = []
        this.debugStats.roomEndMeshCount = 0

        root?.traverse?.((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            if(SceneDistributionModelConstants.ROOM_END_WINDOW_OVERRIDE_ENABLED === true && this.hasExactNameInHierarchy(child, ROOM_END_WINDOW_EXACT_NAMES))
            {
                this.debugStats.roomEndMeshCount++
            }

            if(child.userData?.distributionBackgroundBaseScale)
            {
                this.backgroundMeshes.push(child)
            }

            const materials = Array.isArray(child.material)
                ? child.material
                : [child.material]

            for(const material of materials)
            {
                if(!material)
                {
                    continue
                }

                if(material.userData?.distributionRole === 'roomEndWindow' || material.name?.endsWith?.('_window'))
                {
                    this.roomEndWindowMaterials.push(material)
                }
                else if(material.userData?.distributionRole === 'backgroundUnlit' || material.name?.endsWith?.('_unlit'))
                {
                    this.backgroundMaterials.push(material)
                }
            }
        })

        this.debugStats.roomEndMaterialCount = this.roomEndWindowMaterials.length
        this.debugStats.backgroundMaterialCount = this.backgroundMaterials.length

        for(const material of this.roomEndWindowMaterials)
        {
            if(!material)
            {
                continue
            }

            material.color.set(this.visualSettings.roomEndWindowColor)
            material.transparent = false
            material.opacity = 1
            material.transmission = this.visualSettings.roomEndWindowTransmission * this.visualSettings.roomEndWindowOpacity
            material.roughness = this.visualSettings.roomEndWindowRoughness
            material.metalness = this.visualSettings.roomEndWindowMetalness
            material.ior = this.visualSettings.roomEndWindowIor
            material.thickness = this.visualSettings.roomEndWindowThickness
            material.envMapIntensity = this.visualSettings.roomEndWindowEnvIntensity
            material.attenuationDistance = this.visualSettings.roomEndWindowAttenuationDistance
            material.attenuationColor.set(this.visualSettings.roomEndWindowAttenuationColor)
            material.depthWrite = this.visualSettings.roomEndWindowDepthWrite
            material.needsUpdate = true
        }

        if(this.backgroundOverrideTexture)
        {
            this.backgroundOverrideTexture.center.set(
                this.visualSettings.backgroundTextureCenterX,
                this.visualSettings.backgroundTextureCenterY
            )
            this.backgroundOverrideTexture.offset.set(
                this.visualSettings.backgroundTextureOffsetX,
                this.visualSettings.backgroundTextureOffsetY
            )
            this.backgroundOverrideTexture.repeat.set(
                this.visualSettings.backgroundTextureRepeatX,
                this.visualSettings.backgroundTextureRepeatY
            )
            this.backgroundOverrideTexture.rotation = this.visualSettings.backgroundTextureRotation
            this.backgroundOverrideTexture.needsUpdate = true
        }

        for(const mesh of this.backgroundMeshes)
        {
            if(!mesh?.userData?.distributionBackgroundBaseScale)
            {
                continue
            }

            const { x, y, z } = mesh.userData.distributionBackgroundBaseScale
            mesh.scale.set(
                x * this.visualSettings.backgroundScale,
                y * this.visualSettings.backgroundScale,
                z * this.visualSettings.backgroundScale
            )
            mesh.visible = this.visualSettings.backgroundVisible
            mesh.updateMatrixWorld?.(true)
        }

        const backgroundSide = this.resolveBackgroundSide(this.visualSettings.backgroundSide)
        for(const material of this.backgroundMaterials)
        {
            if(!material)
            {
                continue
            }

            material.color.set(this.visualSettings.backgroundColor)
            material.opacity = this.visualSettings.backgroundOpacity
            material.transparent = this.visualSettings.backgroundOpacity < 1
            material.depthWrite = this.visualSettings.backgroundDepthWrite
            material.depthTest = true
            material.side = backgroundSide
            material.map = this.visualSettings.backgroundTextureEnabled
                ? (this.backgroundOverrideTexture ?? material.map ?? null)
                : null
            material.needsUpdate = true
        }
    }

    setupDebug()
    {
        if(!this.debug?.isDebugEnabled || this.debugFolder)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('Distribution vitre/background', {
            parent: this.debugParentFolder || this.debug.ui,
            expanded: false
        })

        const statsFolder = this.debug.addFolder('Stats', {
            parent: this.debugFolder,
            expanded: false
        })
        const windowFolder = this.debug.addFolder('Vitre room_end1', {
            parent: this.debugFolder,
            expanded: false
        })
        const backgroundFolder = this.debug.addFolder('Background', {
            parent: this.debugFolder,
            expanded: false
        })
        const backgroundTextureFolder = this.debug.addFolder('Background texture', {
            parent: backgroundFolder,
            expanded: false
        })

        this.debug.addBinding(statsFolder, this.debugStats, 'roomEndMeshCount', { label: 'room_end1 meshes', readonly: true })
        this.debug.addBinding(statsFolder, this.debugStats, 'roomEndMaterialCount', { label: 'room_end1 materials', readonly: true })
        this.debug.addBinding(statsFolder, this.debugStats, 'backgroundMaterialCount', { label: 'background materials', readonly: true })

        this.debug.addBinding(windowFolder, this.visualSettings, 'roomEndWindowColor', { label: 'couleur', view: 'color' }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(windowFolder, this.visualSettings, 'roomEndWindowOpacity', { label: 'opacite visuelle', min: 0, max: 1, step: 0.01 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(windowFolder, this.visualSettings, 'roomEndWindowTransmission', { label: 'transmission', min: 0, max: 1, step: 0.01 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(windowFolder, this.visualSettings, 'roomEndWindowRoughness', { label: 'flou', min: 0, max: 1, step: 0.01 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(windowFolder, this.visualSettings, 'roomEndWindowMetalness', { label: 'metal', min: 0, max: 1, step: 0.01 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(windowFolder, this.visualSettings, 'roomEndWindowIor', { label: 'ior', min: 1, max: 2.4, step: 0.01 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(windowFolder, this.visualSettings, 'roomEndWindowThickness', { label: 'epaisseur', min: 0, max: 1, step: 0.005 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(windowFolder, this.visualSettings, 'roomEndWindowEnvIntensity', { label: 'reflection', min: 0, max: 3, step: 0.01 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(windowFolder, this.visualSettings, 'roomEndWindowAttenuationDistance', { label: 'attenuation dist', min: 0, max: 3, step: 0.01 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(windowFolder, this.visualSettings, 'roomEndWindowAttenuationColor', { label: 'attenuation color', view: 'color' }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(windowFolder, this.visualSettings, 'roomEndWindowDepthWrite', { label: 'depthWrite' }).on('change', () => this.applyVisualSettings())

        this.debug.addBinding(backgroundFolder, this.visualSettings, 'backgroundVisible', { label: 'visible' }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(backgroundFolder, this.visualSettings, 'backgroundScale', { label: 'scale', min: 0.1, max: 12, step: 0.05 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(backgroundFolder, this.visualSettings, 'backgroundColor', { label: 'couleur', view: 'color' }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(backgroundFolder, this.visualSettings, 'backgroundOpacity', { label: 'opacite', min: 0, max: 1, step: 0.01 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(backgroundFolder, this.visualSettings, 'backgroundDepthWrite', { label: 'depthWrite' }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(backgroundFolder, this.visualSettings, 'backgroundSide', {
            label: 'background side',
            options: {
                Back: 'back',
                Front: 'front',
                Double: 'double'
            }
        }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(backgroundTextureFolder, this.visualSettings, 'backgroundTextureEnabled', { label: 'texture active' }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(backgroundTextureFolder, this.visualSettings, 'backgroundTextureOffsetX', { label: 'offset x', min: -1, max: 1, step: 0.001 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(backgroundTextureFolder, this.visualSettings, 'backgroundTextureOffsetY', { label: 'offset y', min: -1, max: 1, step: 0.001 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(backgroundTextureFolder, this.visualSettings, 'backgroundTextureRepeatX', { label: 'repeat x', min: -4, max: 4, step: 0.001 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(backgroundTextureFolder, this.visualSettings, 'backgroundTextureRepeatY', { label: 'repeat y', min: -4, max: 4, step: 0.001 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(backgroundTextureFolder, this.visualSettings, 'backgroundTextureRotation', { label: 'rotation', min: -3.1416, max: 3.1416, step: 0.001 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(backgroundTextureFolder, this.visualSettings, 'backgroundTextureCenterX', { label: 'center x', min: 0, max: 1, step: 0.001 }).on('change', () => this.applyVisualSettings())
        this.debug.addBinding(backgroundTextureFolder, this.visualSettings, 'backgroundTextureCenterY', { label: 'center y', min: 0, max: 1, step: 0.001 }).on('change', () => this.applyVisualSettings())

        this.applyVisualSettings()
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
        this.vanneMeshes = null
        this.tubeWaterMeshes = null
        this.roomEndWindowMaterials = null
        this.backgroundMaterials = null
        this.spawnPosition = null
        this.worldBounds = null
        this.boundaryBox = null
    }
}
