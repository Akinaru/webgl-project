import * as THREE from 'three'
import Experience from '../../../Experience.js'

const NON_COLLIDABLE_NAME_TOKENS = [
    'water',
    'cascade',
    'sphere',
    'sphère',
    'screen'
]
const FORCE_COLLIDABLE_NAME_TOKENS = ['tube-water', 'tube-join']
const WALKABLE_GROUND_NAME_TOKENS = ['sol', 'chemin', 'passerelle']
const CLICKABLE_MATERIAL_NAMES = new Set(['materiau0', 'materiau1', 'materiau2'])
const TUBE_WATER_NAME_TOKEN = 'tube-water'
const MODULE_ROTATION_TARGET_PATTERN = /^module-(?:angle|straight)(?:_instance)?(?:[_\s-].*)?$/i

export default class SceneRecuperationModel
{
    constructor({ debugParentFolder = null } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.debug = this.experience.debug
        this.debugParentFolder = debugParentFolder
        this.resource = this.resources.items.recuperationModel
        this.waterDistributionTexture = this.resources.items.recuperationWaterDistributionTexture ?? null
        this.runtimeMaterials = []
        this.debugFolder = null
        this.waterTextureState = {
            rotationDegrees: 0,
            flipX: false,
            flipY: false,
            edgeSoftness: 0.08
        }

        if(this.resource?.scene)
        {
            this.setModel()
        }
        else
        {
            this.setFallback()
        }

        this.setDebug()
    }

    setModel()
    {
        this.removeStaleRoots()
        this.disposeRuntimeMaterials()

        this.model = this.resource.scene.clone(true)
        this.model.name = '__recuperationModelRoot'
        this.model.userData.isRecuperationModelRoot = true
        this.model.position.set(0, 0, 0)
        this.model.scale.set(1, 1, 1)

        this.collisionMeshes = []
        this.collisionBoxes = []
        this.groundMeshes = []
        this.clickableMaterialMeshes = []
        this.tubeWaterMeshes = []
        this.tubeWaterRotationTargets = []
        this.waterSurfaceMeshes = []
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

            if(this.isWaterSurfaceMesh(child))
            {
                this.waterSurfaceMeshes.push(child)
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

        this.applyWaterSurfaceTexture()
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
        this.fallback.userData.isRecuperationModelRoot = true
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
        if(this.hasNameInHierarchy(mesh, FORCE_COLLIDABLE_NAME_TOKENS))
        {
            return true
        }

        return !this.hasNameInHierarchy(mesh, NON_COLLIDABLE_NAME_TOKENS)
    }

    refreshCollisionBoxes()
    {
        if(!this.model)
        {
            return
        }

        this.model.updateMatrixWorld(true)
        this.buildCollisionBoxes()
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

    isWaterSurfaceMesh(mesh)
    {
        return String(mesh?.name || '').toLowerCase().trim() === 'water'
    }

    applyWaterSurfaceTexture()
    {
        if(!(this.waterDistributionTexture instanceof THREE.Texture))
        {
            return
        }

        this.waterDistributionTexture.colorSpace = THREE.NoColorSpace
        this.waterDistributionTexture.flipY = false
        this.waterDistributionTexture.wrapS = THREE.ClampToEdgeWrapping
        this.waterDistributionTexture.wrapT = THREE.ClampToEdgeWrapping
        this.applyWaterSurfaceTextureTransform()
        this.waterDistributionTexture.needsUpdate = true

        for(const mesh of this.waterSurfaceMeshes ?? [])
        {
            const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const clonedMaterials = sourceMaterials.map((material) => this.createWaterSurfaceMaterial(material))
            mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0]
        }
    }

    createWaterSurfaceMaterial(baseMaterial)
    {
        const material = baseMaterial?.clone?.() ?? baseMaterial
        if(!material)
        {
            return material
        }

        material.userData = material.userData || {}
        material.userData.recuperationWaterMaskUniforms = {
            edgeSoftness: { value: this.waterTextureState.edgeSoftness }
        }

        material.alphaMap = this.waterDistributionTexture
        material.transparent = true
        material.alphaTest = 0.001
        material.depthWrite = false
        material.side = THREE.DoubleSide
        material.onBeforeCompile = (shader) =>
        {
            shader.uniforms.uRecuperationWaterMaskSoftness = material.userData.recuperationWaterMaskUniforms.edgeSoftness
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <alphamap_pars_fragment>',
                    `#include <alphamap_pars_fragment>
uniform float uRecuperationWaterMaskSoftness;`
                )
                .replace(
                    '#include <alphamap_fragment>',
                    `#include <alphamap_fragment>
#ifdef USE_ALPHAMAP
    float waterMaskAlpha = diffuseColor.a;
    float waterMaskSoftness = clamp(uRecuperationWaterMaskSoftness, 0.0001, 0.5);
    diffuseColor.a = smoothstep(
        0.5 - waterMaskSoftness,
        0.5 + waterMaskSoftness,
        waterMaskAlpha
    );
#endif`
                )
        }
        material.customProgramCacheKey = () =>
        {
            const parentKey = typeof baseMaterial?.customProgramCacheKey === 'function'
                ? baseMaterial.customProgramCacheKey()
                : ''
            return `${parentKey}__recuperationWaterMaskSoftnessV1`
        }
        material.needsUpdate = true

        this.runtimeMaterials.push(material)
        return material
    }

    applyWaterSurfaceTextureTransform()
    {
        if(!(this.waterDistributionTexture instanceof THREE.Texture))
        {
            return
        }

        const repeatX = this.waterTextureState.flipX ? -1 : 1
        const repeatY = this.waterTextureState.flipY ? -1 : 1

        this.waterDistributionTexture.center.set(0.5, 0.5)
        this.waterDistributionTexture.repeat.set(repeatX, repeatY)
        this.waterDistributionTexture.offset.set(
            this.waterTextureState.flipX ? 1 : 0,
            this.waterTextureState.flipY ? 1 : 0
        )
        this.waterDistributionTexture.rotation = THREE.MathUtils.degToRad(this.waterTextureState.rotationDegrees)
        this.waterDistributionTexture.needsUpdate = true
    }

    applyWaterSurfaceMaterialSettings()
    {
        for(const material of this.runtimeMaterials ?? [])
        {
            const uniforms = material?.userData?.recuperationWaterMaskUniforms
            if(!uniforms?.edgeSoftness)
            {
                continue
            }

            uniforms.edgeSoftness.value = this.waterTextureState.edgeSoftness
            material.needsUpdate = true
        }
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('Eau surface', {
            parent: this.debugParentFolder || this.debug.ui,
            expanded: false
        })

        this.debug.addBinding(this.debugFolder, this.waterTextureState, 'rotationDegrees', {
            label: 'rotation',
            options: {
                '0°': 0,
                '90°': 90,
                '180°': 180,
                '270°': 270
            }
        }).on('change', () =>
        {
            this.applyWaterSurfaceTextureTransform()
        })

        this.debug.addBinding(this.debugFolder, this.waterTextureState, 'flipX', {
            label: 'flipX'
        }).on('change', () =>
        {
            this.applyWaterSurfaceTextureTransform()
        })

        this.debug.addBinding(this.debugFolder, this.waterTextureState, 'flipY', {
            label: 'flipY'
        }).on('change', () =>
        {
            this.applyWaterSurfaceTextureTransform()
        })

        this.debug.addBinding(this.debugFolder, this.waterTextureState, 'edgeSoftness', {
            label: 'softness',
            min: 0.001,
            max: 0.35,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWaterSurfaceMaterialSettings()
        })
    }

    getTubeWaterRotationTargetFromObject(object)
    {
        let current = object
        while(current)
        {
            const name = String(current.name || '').toLowerCase()
            if(MODULE_ROTATION_TARGET_PATTERN.test(name))
            {
                return current
            }

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
            if(child?.userData?.isRecuperationModelRoot)
            {
                staleRoots.push(child)
            }
        }

        for(const staleRoot of staleRoots)
        {
            this.scene.remove(staleRoot)
        }
    }

    disposeRuntimeMaterials()
    {
        for(const material of this.runtimeMaterials ?? [])
        {
            material?.dispose?.()
        }

        this.runtimeMaterials = []
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

    getBoundaryRadius()
    {
        return this.boundaryRadius ?? 48
    }

    destroy()
    {
        this.disposeRuntimeMaterials()
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
        this.waterSurfaceMeshes = null
        this.worldBounds = null
    }
}
