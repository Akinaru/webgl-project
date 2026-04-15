import * as THREE from 'three'
import Experience from '../../../Experience.js'

const FORCE_DOUBLE_SIDE_COLLISION_TOKENS = ['buildingx', 'plantes']
const BLOOM_CONTOUR_AVOID_TOKENS = ['buildingx', 'plantes']

export default class MapModel
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.runtimeMaterials = []
        this.planMeshes = []
        this.terrainTintMeshes = []
        this.planVisible = false
        this.terrainWaterlineSettings = {
            minY: 1.09,
            deepY: -0.11,
            shallowColor: new THREE.Color('#2a98a5'),
            deepColor: new THREE.Color('#14576d')
        }

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
        this.disposeRuntimeMaterials()
        this.planMeshes = []
        this.terrainTintMeshes = []

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

            if(this.isPlanMeshName(child.name))
            {
                this.planMeshes.push(child)
            }

            if(this.isTerrainTintMesh(child))
            {
                this.terrainTintMeshes.push(child)
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

            this.applyCollisionMaterialFixes(child)
            this.collisionMeshes.push(child)
        })

        this.scene.add(this.model)
        this.model.updateMatrixWorld(true)
        this.applyTerrainWaterline(this.terrainWaterlineSettings)
        this.setPlanVisibility(this.planVisible)
        this.buildCollisionBoxes()
    }

    isPlanMeshName(name = '')
    {
        const normalized = String(name).trim().toLowerCase()
        return normalized === 'plan' || normalized.startsWith('plan.') || normalized.startsWith('plan_') || normalized.startsWith('plan-')
    }

    isTerrainTintMesh(mesh)
    {
        return this.hasNameInHierarchy(mesh, ['relief'])
    }

    createTerrainWaterlineMaterial(baseMaterial)
    {
        if(!baseMaterial)
        {
            return baseMaterial
        }

        if(baseMaterial.userData?.isMapWaterlineMaterial)
        {
            this.updateTerrainWaterlineUniforms(baseMaterial)
            return baseMaterial
        }

        const material = baseMaterial.clone()
        material.userData = material.userData || {}
        material.userData.isMapWaterlineMaterial = true
        material.userData.mapWaterlineUniforms = {
            minY: { value: this.terrainWaterlineSettings.minY },
            deepY: { value: this.terrainWaterlineSettings.deepY },
            shallowColor: { value: this.terrainWaterlineSettings.shallowColor.clone() },
            deepColor: { value: this.terrainWaterlineSettings.deepColor.clone() }
        }

        material.onBeforeCompile = (shader) =>
        {
            const uniforms = material.userData.mapWaterlineUniforms
            shader.uniforms.uMapWaterlineMinY = uniforms.minY
            shader.uniforms.uMapWaterlineDeepY = uniforms.deepY
            shader.uniforms.uMapWaterlineShallowColor = uniforms.shallowColor
            shader.uniforms.uMapWaterlineDeepColor = uniforms.deepColor

            shader.vertexShader = `
varying vec3 vMapWorldPosition;
` + shader.vertexShader

            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `#include <project_vertex>
vMapWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`
            )

            shader.fragmentShader = `
varying vec3 vMapWorldPosition;
uniform float uMapWaterlineMinY;
uniform float uMapWaterlineDeepY;
uniform vec3 uMapWaterlineShallowColor;
uniform vec3 uMapWaterlineDeepColor;
` + shader.fragmentShader

            shader.fragmentShader = shader.fragmentShader.replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                `float shallowMask = 1.0 - smoothstep(uMapWaterlineMinY - 0.18, uMapWaterlineMinY + 0.18, vMapWorldPosition.y);
float deepMask = 1.0 - smoothstep(uMapWaterlineDeepY - 0.18, uMapWaterlineDeepY + 0.18, vMapWorldPosition.y);
vec3 depthTint = mix(uMapWaterlineShallowColor, uMapWaterlineDeepColor, clamp(deepMask, 0.0, 1.0));
vec3 terrainColor = mix(diffuse, depthTint, clamp(shallowMask, 0.0, 1.0));
vec4 diffuseColor = vec4(terrainColor, opacity);`
            )
        }

        material.customProgramCacheKey = () =>
        {
            const parentKey = typeof baseMaterial.customProgramCacheKey === 'function'
                ? baseMaterial.customProgramCacheKey()
                : ''
            return `${parentKey}__mapWaterlineV2`
        }

        this.runtimeMaterials.push(material)
        this.updateTerrainWaterlineUniforms(material)
        material.needsUpdate = true
        return material
    }

    updateTerrainWaterlineUniforms(material)
    {
        const uniforms = material?.userData?.mapWaterlineUniforms
        if(!uniforms)
        {
            return
        }

        uniforms.minY.value = this.terrainWaterlineSettings.minY
        uniforms.deepY.value = this.terrainWaterlineSettings.deepY
        uniforms.shallowColor.value.copy(this.terrainWaterlineSettings.shallowColor)
        uniforms.deepColor.value.copy(this.terrainWaterlineSettings.deepColor)
    }

    applyTerrainWaterline({ minY, deepY, shallowColor, deepColor, color } = {})
    {
        if(typeof minY === 'number' && Number.isFinite(minY))
        {
            this.terrainWaterlineSettings.minY = minY
        }

        if(typeof deepY === 'number' && Number.isFinite(deepY))
        {
            this.terrainWaterlineSettings.deepY = deepY
        }

        if(this.terrainWaterlineSettings.deepY > this.terrainWaterlineSettings.minY)
        {
            this.terrainWaterlineSettings.deepY = this.terrainWaterlineSettings.minY
        }

        if(color instanceof THREE.Color)
        {
            this.terrainWaterlineSettings.shallowColor.copy(color)
        }
        else if(typeof color === 'string')
        {
            this.terrainWaterlineSettings.shallowColor.set(color)
        }
        else if(color && typeof color === 'object')
        {
            this.terrainWaterlineSettings.shallowColor.setRGB(
                color.r ?? this.terrainWaterlineSettings.shallowColor.r,
                color.g ?? this.terrainWaterlineSettings.shallowColor.g,
                color.b ?? this.terrainWaterlineSettings.shallowColor.b
            )
        }

        if(shallowColor instanceof THREE.Color)
        {
            this.terrainWaterlineSettings.shallowColor.copy(shallowColor)
        }
        else if(typeof shallowColor === 'string')
        {
            this.terrainWaterlineSettings.shallowColor.set(shallowColor)
        }
        else if(shallowColor && typeof shallowColor === 'object')
        {
            this.terrainWaterlineSettings.shallowColor.setRGB(
                shallowColor.r ?? this.terrainWaterlineSettings.shallowColor.r,
                shallowColor.g ?? this.terrainWaterlineSettings.shallowColor.g,
                shallowColor.b ?? this.terrainWaterlineSettings.shallowColor.b
            )
        }

        if(deepColor instanceof THREE.Color)
        {
            this.terrainWaterlineSettings.deepColor.copy(deepColor)
        }
        else if(typeof deepColor === 'string')
        {
            this.terrainWaterlineSettings.deepColor.set(deepColor)
        }
        else if(deepColor && typeof deepColor === 'object')
        {
            this.terrainWaterlineSettings.deepColor.setRGB(
                deepColor.r ?? this.terrainWaterlineSettings.deepColor.r,
                deepColor.g ?? this.terrainWaterlineSettings.deepColor.g,
                deepColor.b ?? this.terrainWaterlineSettings.deepColor.b
            )
        }

        for(const mesh of this.terrainTintMeshes)
        {
            if(!mesh)
            {
                continue
            }

            if(Array.isArray(mesh.material))
            {
                mesh.material = mesh.material.map((material) => this.createTerrainWaterlineMaterial(material))
            }
            else
            {
                mesh.material = this.createTerrainWaterlineMaterial(mesh.material)
            }
        }

        for(const material of this.runtimeMaterials)
        {
            this.updateTerrainWaterlineUniforms(material)
        }
    }

    setPlanVisibility(visible)
    {
        this.planVisible = Boolean(visible)
        for(const planMesh of this.planMeshes)
        {
            if(!planMesh)
            {
                continue
            }

            planMesh.visible = this.planVisible
        }
    }

    disposeRuntimeMaterials()
    {
        if(!Array.isArray(this.runtimeMaterials))
        {
            this.runtimeMaterials = []
            return
        }

        for(const material of this.runtimeMaterials)
        {
            material?.dispose?.()
        }

        this.runtimeMaterials.length = 0
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

    applyCollisionMaterialFixes(mesh)
    {
        if(!this.shouldForceDoubleSide(mesh))
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

            material.side = THREE.DoubleSide
            material.needsUpdate = true
        }
    }

    shouldForceDoubleSide(object)
    {
        return this.hasNameInHierarchy(object, FORCE_DOUBLE_SIDE_COLLISION_TOKENS)
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
        const seenContourRoots = new Set()

        this.model.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            const isWater = this.hasNameInHierarchy(child, ['water', 'eau'])
            const isFountain = this.hasNameInHierarchy(child, ['fontaine', 'fountain'])
            const contourRoot = this.findAncestorByTokens(child, BLOOM_CONTOUR_AVOID_TOKENS)
            const isContourObstacle = Boolean(contourRoot)

            if(!isWater && !isFountain && !isContourObstacle)
            {
                return
            }

            if(isContourObstacle)
            {
                if(seenContourRoots.has(contourRoot.uuid))
                {
                    return
                }

                seenContourRoots.add(contourRoot.uuid)
            }

            const zoneObject = isContourObstacle ? contourRoot : child
            bounds.setFromObject(zoneObject)
            bounds.getCenter(center)
            bounds.getSize(size)

            const radius = isContourObstacle
                ? ((Math.max(size.x, size.z) * 0.5) + 1.2)
                : ((Math.max(size.x, size.z) * 0.5) + (isFountain ? 0.9 : 0.7))
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
        this.disposeRuntimeMaterials()

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
        this.planMeshes = null
        this.terrainTintMeshes = null
        this.runtimeMaterials = null
    }
}
