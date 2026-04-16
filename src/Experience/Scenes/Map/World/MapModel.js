import * as THREE from 'three'
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js'
import Experience from '../../../Experience.js'
import { applyStandardMaterialPatch } from './Shaders/Common/applyStandardMaterialPatch.js'
import { terrainWaterlineShaderChunks } from './Shaders/Terrain/waterlineShaderChunks.js'
import { planWaterMaskShaderChunks } from './Shaders/Water/planMaskShaderChunks.js'

// MapModel centralise le chargement de la map, les collisions, et les shaders eau (relief + plan).
const FORCE_DOUBLE_SIDE_COLLISION_TOKENS = ['buildingx', 'plantes']
const BLOOM_CONTOUR_AVOID_TOKENS = ['buildingx', 'plantes']
const PLAN_HEIGHT_TEXTURE_RESOLUTION = 256
const PLAN_NOISE_TEXTURE_RESOLUTION = 128

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
            minY: 1.20,
            deepY: 0.22,
            shallowColor: new THREE.Color('#050505'),
            deepColor: new THREE.Color('#000000')
        }
        this.planWaterMaskSettings = {
            waterLevel: 1.20,
            slopeFrequency: 14,
            noiseFrequency: 0.08,
            localTime: 0
        }
        this.planWaterMaskContext = null

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
        this.disposePlanWaterMaskContext()
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
        this.planWaterMaskContext = this.buildPlanWaterMaskContext()
        this.applyPlanWaterMask(this.planWaterMaskSettings)
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

            applyStandardMaterialPatch(shader, terrainWaterlineShaderChunks)
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

        const shallowColorUniform = this.ensureColorUniformValue(
            uniforms.shallowColor,
            this.terrainWaterlineSettings.shallowColor
        )
        const deepColorUniform = this.ensureColorUniformValue(
            uniforms.deepColor,
            this.terrainWaterlineSettings.deepColor
        )

        uniforms.minY.value = this.terrainWaterlineSettings.minY
        uniforms.deepY.value = this.terrainWaterlineSettings.deepY
        shallowColorUniform.copy(this.terrainWaterlineSettings.shallowColor)
        deepColorUniform.copy(this.terrainWaterlineSettings.deepColor)
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

    buildPlanBounds()
    {
        if(!Array.isArray(this.planMeshes) || this.planMeshes.length === 0)
        {
            return null
        }

        const bounds = new THREE.Box3()
        const meshBounds = new THREE.Box3()
        let hasBounds = false

        for(const mesh of this.planMeshes)
        {
            if(!(mesh instanceof THREE.Mesh))
            {
                continue
            }

            meshBounds.setFromObject(mesh)
            if(!hasBounds)
            {
                bounds.copy(meshBounds)
                hasBounds = true
                continue
            }

            bounds.union(meshBounds)
        }

        if(!hasBounds)
        {
            return null
        }

        const size = new THREE.Vector3()
        bounds.getSize(size)
        if(size.x <= 0.0001 || size.z <= 0.0001)
        {
            return null
        }

        return bounds
    }

    buildPlanWaterMaskContext(resolution = PLAN_HEIGHT_TEXTURE_RESOLUTION)
    {
        const planBounds = this.buildPlanBounds()
        if(!planBounds)
        {
            return null
        }

        const reliefBounds = new THREE.Box3()
        const meshBounds = new THREE.Box3()
        let hasRelief = false

        for(const reliefMesh of this.terrainTintMeshes)
        {
            if(!(reliefMesh instanceof THREE.Mesh))
            {
                continue
            }

            meshBounds.setFromObject(reliefMesh)
            if(!hasRelief)
            {
                reliefBounds.copy(meshBounds)
                hasRelief = true
                continue
            }

            reliefBounds.union(meshBounds)
        }

        if(!hasRelief)
        {
            return null
        }

        const minHeight = reliefBounds.min.y
        const maxHeight = reliefBounds.max.y
        const heightRange = Math.max(0.0001, maxHeight - minHeight)
        const planSize = new THREE.Vector3()
        planBounds.getSize(planSize)

        const heightData = new Uint8Array(resolution * resolution)
        const raycaster = new THREE.Raycaster()
        const rayOrigin = new THREE.Vector3()
        const rayDirection = new THREE.Vector3(0, -1, 0)
        const topY = maxHeight + 5

        for(let y = 0; y < resolution; y++)
        {
            const v = (y + 0.5) / resolution
            const worldZ = planBounds.min.z + (v * planSize.z)

            for(let x = 0; x < resolution; x++)
            {
                const u = (x + 0.5) / resolution
                const worldX = planBounds.min.x + (u * planSize.x)

                rayOrigin.set(worldX, topY, worldZ)
                raycaster.set(rayOrigin, rayDirection)

                const hit = raycaster.intersectObjects(this.terrainTintMeshes, false)[0]
                const sampledHeight = hit?.point?.y ?? minHeight
                const normalizedHeight = THREE.MathUtils.clamp((sampledHeight - minHeight) / heightRange, 0, 1)

                heightData[y * resolution + x] = Math.round(normalizedHeight * 255)
            }
        }

        const terrainDataPixels = new Uint8Array(resolution * resolution * 4)
        for(let index = 0; index < (resolution * resolution); index++)
        {
            const pixelOffset = index * 4
            terrainDataPixels[pixelOffset] = heightData[index]
            terrainDataPixels[pixelOffset + 1] = 0
            terrainDataPixels[pixelOffset + 2] = 0
            terrainDataPixels[pixelOffset + 3] = 255
        }

        const terrainDataTexture = new THREE.DataTexture(
            terrainDataPixels,
            resolution,
            resolution,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
        )
        terrainDataTexture.colorSpace = THREE.NoColorSpace
        terrainDataTexture.wrapS = THREE.ClampToEdgeWrapping
        terrainDataTexture.wrapT = THREE.ClampToEdgeWrapping
        terrainDataTexture.minFilter = THREE.LinearMipmapLinearFilter
        terrainDataTexture.magFilter = THREE.LinearFilter
        terrainDataTexture.generateMipmaps = true
        const maxAnisotropy = this.experience.renderer?.instance?.capabilities?.getMaxAnisotropy?.() ?? 1
        terrainDataTexture.anisotropy = Math.max(1, Math.min(8, maxAnisotropy))
        terrainDataTexture.needsUpdate = true
        const noiseTexture = this.buildPlanNoiseTexture(PLAN_NOISE_TEXTURE_RESOLUTION)

        return {
            bounds: new THREE.Vector4(
                planBounds.min.x,
                planBounds.min.z,
                planSize.x,
                planSize.z
            ),
            heightRange: new THREE.Vector2(minHeight, maxHeight),
            resolution,
            heightData,
            terrainDataPixels,
            terrainDataTexture,
            terrainDataTexelSize: new THREE.Vector2(1 / resolution, 1 / resolution),
            noiseTexture,
            lastTerrainDataWaterLevel: Number.NaN
        }
    }

    buildPlanNoiseTexture(resolution = PLAN_NOISE_TEXTURE_RESOLUTION)
    {
        const noiseGenerator = new ImprovedNoise()
        const pixels = new Uint8Array(resolution * resolution)
        const octaves = 4
        const persistence = 0.5
        const scale = 6
        let amplitudeSum = 0

        for(let octave = 0; octave < octaves; octave++)
        {
            amplitudeSum += Math.pow(persistence, octave)
        }

        for(let y = 0; y < resolution; y++)
        {
            for(let x = 0; x < resolution; x++)
            {
                const baseX = x / resolution
                const baseY = y / resolution
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
                pixels[(y * resolution) + x] = Math.round(normalized * 255)
            }
        }

        const noiseTexture = new THREE.DataTexture(
            pixels,
            resolution,
            resolution,
            THREE.RedFormat,
            THREE.UnsignedByteType
        )
        noiseTexture.colorSpace = THREE.NoColorSpace
        noiseTexture.wrapS = THREE.RepeatWrapping
        noiseTexture.wrapT = THREE.RepeatWrapping
        noiseTexture.minFilter = THREE.LinearMipmapLinearFilter
        noiseTexture.magFilter = THREE.LinearFilter
        noiseTexture.generateMipmaps = true
        const maxAnisotropy = this.experience.renderer?.instance?.capabilities?.getMaxAnisotropy?.() ?? 1
        noiseTexture.anisotropy = Math.max(1, Math.min(8, maxAnisotropy))
        noiseTexture.needsUpdate = true
        return noiseTexture
    }

    updatePlanTerrainDataTexture(waterLevel)
    {
        const context = this.planWaterMaskContext
        if(!context?.terrainDataTexture || !context?.terrainDataPixels || !context?.heightData)
        {
            return
        }

        if(
            Number.isFinite(context.lastTerrainDataWaterLevel) &&
            Math.abs(context.lastTerrainDataWaterLevel - waterLevel) < 0.0001
        )
        {
            return
        }

        const { resolution, heightRange, heightData, terrainDataPixels } = context
        const sampleCount = resolution * resolution
        const heightSpan = Math.max(0.0001, heightRange.y - heightRange.x)
        const waterLevel01 = THREE.MathUtils.clamp((waterLevel - heightRange.x) / heightSpan, 0, 1)

        const floodedMask = new Uint8Array(sampleCount)
        const shoreDistanceSteps = new Int16Array(sampleCount)
        shoreDistanceSteps.fill(-1)
        const queue = new Int32Array(sampleCount)
        let queueStart = 0
        let queueEnd = 0

        const isFloodedAt = (x, y) =>
        {
            const index = (y * resolution) + x
            return floodedMask[index] === 1
        }

        const isOutside = (x, y) => x < 0 || x >= resolution || y < 0 || y >= resolution
        const shoreOffsets = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1]
        ]

        for(let y = 0; y < resolution; y++)
        {
            for(let x = 0; x < resolution; x++)
            {
                const index = (y * resolution) + x
                const height01 = heightData[index] / 255
                floodedMask[index] = height01 <= waterLevel01 ? 1 : 0
            }
        }

        for(let y = 0; y < resolution; y++)
        {
            for(let x = 0; x < resolution; x++)
            {
                const index = (y * resolution) + x
                if(floodedMask[index] !== 1)
                {
                    continue
                }

                let isShore = false
                for(const [offsetX, offsetY] of shoreOffsets)
                {
                    const neighborX = x + offsetX
                    const neighborY = y + offsetY
                    if(isOutside(neighborX, neighborY) || !isFloodedAt(neighborX, neighborY))
                    {
                        isShore = true
                        break
                    }
                }

                if(!isShore)
                {
                    continue
                }

                shoreDistanceSteps[index] = 0
                queue[queueEnd++] = index
            }
        }

        const propagationOffsets = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1]
        ]

        while(queueStart < queueEnd)
        {
            const currentIndex = queue[queueStart++]
            const currentDistance = shoreDistanceSteps[currentIndex]
            const currentX = currentIndex % resolution
            const currentY = Math.floor(currentIndex / resolution)

            for(const [offsetX, offsetY] of propagationOffsets)
            {
                const neighborX = currentX + offsetX
                const neighborY = currentY + offsetY
                if(isOutside(neighborX, neighborY))
                {
                    continue
                }

                const neighborIndex = (neighborY * resolution) + neighborX
                if(floodedMask[neighborIndex] !== 1 || shoreDistanceSteps[neighborIndex] >= 0)
                {
                    continue
                }

                shoreDistanceSteps[neighborIndex] = currentDistance + 1
                queue[queueEnd++] = neighborIndex
            }
        }

        let maxDistance = 0
        for(let index = 0; index < sampleCount; index++)
        {
            if(floodedMask[index] !== 1)
            {
                continue
            }

            const distance = Math.max(0, shoreDistanceSteps[index])
            if(distance > maxDistance)
            {
                maxDistance = distance
            }
        }

        const distanceDenominator = Math.max(1, maxDistance)
        for(let index = 0; index < sampleCount; index++)
        {
            const pixelOffset = index * 4
            const isFlooded = floodedMask[index] === 1
            const distance = Math.max(0, shoreDistanceSteps[index])
            const distance01 = isFlooded
                ? THREE.MathUtils.clamp(distance / distanceDenominator, 0, 1)
                : 0

            terrainDataPixels[pixelOffset] = heightData[index]
            terrainDataPixels[pixelOffset + 1] = 0
            terrainDataPixels[pixelOffset + 2] = Math.round(distance01 * 255)
            terrainDataPixels[pixelOffset + 3] = 255
        }

        context.lastTerrainDataWaterLevel = waterLevel
        context.terrainDataTexture.needsUpdate = true
    }

    createPlanWaterMaskMaterial(baseMaterial)
    {
        if(!baseMaterial)
        {
            return baseMaterial
        }

        if(baseMaterial.userData?.isMapPlanWaterMaskMaterial)
        {
            this.updatePlanWaterMaskUniforms(baseMaterial)
            return baseMaterial
        }

        const material = baseMaterial.clone()
        material.userData = material.userData || {}
        material.userData.isMapPlanWaterMaskMaterial = true
        // Eau de debug visuelle: rendu mat sans reflets speculaires.
        if('roughness' in material)
        {
            material.roughness = 1
        }
        if('metalness' in material)
        {
            material.metalness = 0
        }
        if('envMapIntensity' in material)
        {
            material.envMapIntensity = 0
        }
        material.userData.mapPlanWaterMaskUniforms = {
            waterLevel: { value: this.planWaterMaskSettings.waterLevel },
            slopeFrequency: { value: this.planWaterMaskSettings.slopeFrequency },
            noiseFrequency: { value: this.planWaterMaskSettings.noiseFrequency },
            localTime: { value: this.planWaterMaskSettings.localTime },
            bounds: { value: new THREE.Vector4(0, 0, 1, 1) },
            heightRange: { value: new THREE.Vector2(0, 1) },
            terrainDataTexelSize: { value: new THREE.Vector2(1, 1) },
            terrainDataTexture: { value: null },
            noiseTexture: { value: null }
        }

        material.onBeforeCompile = (shader) =>
        {
            const uniforms = material.userData.mapPlanWaterMaskUniforms
            shader.uniforms.uMapPlanWaterLevel = uniforms.waterLevel
            shader.uniforms.uMapPlanSlopeFrequency = uniforms.slopeFrequency
            shader.uniforms.uMapPlanNoiseFrequency = uniforms.noiseFrequency
            shader.uniforms.uMapPlanLocalTime = uniforms.localTime
            shader.uniforms.uMapPlanBounds = uniforms.bounds
            shader.uniforms.uMapPlanHeightRange = uniforms.heightRange
            shader.uniforms.uMapPlanTerrainDataTexelSize = uniforms.terrainDataTexelSize
            shader.uniforms.uMapPlanTerrainDataTexture = uniforms.terrainDataTexture
            shader.uniforms.uMapPlanNoiseTexture = uniforms.noiseTexture

            applyStandardMaterialPatch(shader, planWaterMaskShaderChunks)
        }

        material.customProgramCacheKey = () =>
        {
            const parentKey = typeof baseMaterial.customProgramCacheKey === 'function'
                ? baseMaterial.customProgramCacheKey()
                : ''
            return `${parentKey}__mapPlanWaterMaskV1`
        }

        this.runtimeMaterials.push(material)
        this.updatePlanWaterMaskUniforms(material)
        material.needsUpdate = true
        return material
    }

    updatePlanWaterMaskUniforms(material)
    {
        const uniforms = material?.userData?.mapPlanWaterMaskUniforms
        if(!uniforms)
        {
            return
        }

        if(!this.planWaterMaskContext)
        {
            this.planWaterMaskContext = this.buildPlanWaterMaskContext()
        }

        if(!this.planWaterMaskContext)
        {
            return
        }

        this.updatePlanTerrainDataTexture(this.planWaterMaskSettings.waterLevel)

        const boundsUniform = this.ensureVector4UniformValue(
            uniforms.bounds,
            this.planWaterMaskContext.bounds
        )
        const heightRangeUniform = this.ensureVector2UniformValue(
            uniforms.heightRange,
            this.planWaterMaskContext.heightRange
        )
        const terrainDataTexelSizeUniform = this.ensureVector2UniformValue(
            uniforms.terrainDataTexelSize,
            this.planWaterMaskContext.terrainDataTexelSize
        )

        uniforms.waterLevel.value = this.planWaterMaskSettings.waterLevel
        uniforms.slopeFrequency.value = this.planWaterMaskSettings.slopeFrequency
        uniforms.noiseFrequency.value = this.planWaterMaskSettings.noiseFrequency
        uniforms.localTime.value = this.planWaterMaskSettings.localTime
        boundsUniform.copy(this.planWaterMaskContext.bounds)
        heightRangeUniform.copy(this.planWaterMaskContext.heightRange)
        terrainDataTexelSizeUniform.copy(this.planWaterMaskContext.terrainDataTexelSize)
        uniforms.terrainDataTexture.value = this.planWaterMaskContext.terrainDataTexture
        uniforms.noiseTexture.value = this.planWaterMaskContext.noiseTexture
    }

    ensureColorUniformValue(uniform, fallbackColor)
    {
        if(!uniform)
        {
            return fallbackColor.clone()
        }

        if(uniform.value instanceof THREE.Color)
        {
            return uniform.value
        }

        const value = uniform.value
        if(typeof value === 'string' || typeof value === 'number')
        {
            uniform.value = new THREE.Color(value)
            return uniform.value
        }

        if(value && typeof value === 'object')
        {
            uniform.value = new THREE.Color(
                Number.isFinite(value.r) ? value.r : fallbackColor.r,
                Number.isFinite(value.g) ? value.g : fallbackColor.g,
                Number.isFinite(value.b) ? value.b : fallbackColor.b
            )
            return uniform.value
        }

        uniform.value = fallbackColor.clone()
        return uniform.value
    }

    ensureVector2UniformValue(uniform, fallbackVector)
    {
        if(!uniform)
        {
            return fallbackVector.clone()
        }

        if(uniform.value instanceof THREE.Vector2)
        {
            return uniform.value
        }

        const value = uniform.value
        if(Array.isArray(value))
        {
            uniform.value = new THREE.Vector2(
                Number.isFinite(value[0]) ? value[0] : fallbackVector.x,
                Number.isFinite(value[1]) ? value[1] : fallbackVector.y
            )
            return uniform.value
        }

        if(value && typeof value === 'object')
        {
            uniform.value = new THREE.Vector2(
                Number.isFinite(value.x) ? value.x : fallbackVector.x,
                Number.isFinite(value.y) ? value.y : fallbackVector.y
            )
            return uniform.value
        }

        uniform.value = fallbackVector.clone()
        return uniform.value
    }

    ensureVector4UniformValue(uniform, fallbackVector)
    {
        if(!uniform)
        {
            return fallbackVector.clone()
        }

        if(uniform.value instanceof THREE.Vector4)
        {
            return uniform.value
        }

        const value = uniform.value
        if(Array.isArray(value))
        {
            uniform.value = new THREE.Vector4(
                Number.isFinite(value[0]) ? value[0] : fallbackVector.x,
                Number.isFinite(value[1]) ? value[1] : fallbackVector.y,
                Number.isFinite(value[2]) ? value[2] : fallbackVector.z,
                Number.isFinite(value[3]) ? value[3] : fallbackVector.w
            )
            return uniform.value
        }

        if(value && typeof value === 'object')
        {
            uniform.value = new THREE.Vector4(
                Number.isFinite(value.x) ? value.x : fallbackVector.x,
                Number.isFinite(value.y) ? value.y : fallbackVector.y,
                Number.isFinite(value.z) ? value.z : fallbackVector.z,
                Number.isFinite(value.w) ? value.w : fallbackVector.w
            )
            return uniform.value
        }

        uniform.value = fallbackVector.clone()
        return uniform.value
    }

    setPlanWaterMaskLocalTime(localTime = 0)
    {
        if(!this.planWaterMaskSettings)
        {
            return
        }

        const safeLocalTime = Number.isFinite(localTime) ? localTime : 0
        this.planWaterMaskSettings.localTime = safeLocalTime

        if(!Array.isArray(this.runtimeMaterials))
        {
            return
        }

        for(const material of this.runtimeMaterials)
        {
            const uniforms = material?.userData?.mapPlanWaterMaskUniforms
            if(!uniforms?.localTime)
            {
                continue
            }

            uniforms.localTime.value = safeLocalTime
        }
    }

    applyPlanWaterMask({ waterLevel, slopeFrequency, noiseFrequency, localTime } = {})
    {
        if(typeof waterLevel === 'number' && Number.isFinite(waterLevel))
        {
            this.planWaterMaskSettings.waterLevel = waterLevel
        }

        if(typeof slopeFrequency === 'number' && Number.isFinite(slopeFrequency))
        {
            this.planWaterMaskSettings.slopeFrequency = Math.max(0, slopeFrequency)
        }

        if(typeof noiseFrequency === 'number' && Number.isFinite(noiseFrequency))
        {
            this.planWaterMaskSettings.noiseFrequency = Math.max(0, noiseFrequency)
        }

        if(typeof localTime === 'number' && Number.isFinite(localTime))
        {
            this.planWaterMaskSettings.localTime = localTime
        }

        if(!this.planWaterMaskContext)
        {
            this.planWaterMaskContext = this.buildPlanWaterMaskContext()
        }

        if(!this.planWaterMaskContext)
        {
            return
        }

        this.updatePlanTerrainDataTexture(this.planWaterMaskSettings.waterLevel)

        for(const planMesh of this.planMeshes)
        {
            if(!planMesh)
            {
                continue
            }

            if(Array.isArray(planMesh.material))
            {
                planMesh.material = planMesh.material.map((material) => this.createPlanWaterMaskMaterial(material))
            }
            else
            {
                planMesh.material = this.createPlanWaterMaskMaterial(planMesh.material)
            }
        }

        for(const material of this.runtimeMaterials)
        {
            this.updatePlanWaterMaskUniforms(material)
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

    disposePlanWaterMaskContext()
    {
        this.planWaterMaskContext?.terrainDataTexture?.dispose?.()
        this.planWaterMaskContext?.noiseTexture?.dispose?.()
        this.planWaterMaskContext = null
    }

    setFallback()
    {
        this.disposePlanWaterMaskContext()
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
        if(this.isPlanMesh(mesh))
        {
            return false
        }

        const meshName = (mesh.name || '').toLowerCase()
        const isPalmTreePart = this.isPalmTreePart(mesh)

        if(!isPalmTreePart)
        {
            return true
        }

        const isTrunk = meshName.includes('tronc') || meshName.includes('trunk')
        return isTrunk
    }

    isPlanMesh(object)
    {
        let current = object
        while(current)
        {
            if(this.isPlanMeshName(current.name))
            {
                return true
            }
            current = current.parent
        }
        return false
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

    getGroundMeshes()
    {
        const meshes = this.collisionMeshes ?? []
        return meshes.filter((mesh) => this.isPlayerGroundSurface(mesh))
    }

    isPlayerGroundSurface(object)
    {
        return this.isBloomWalkableSurface(object)
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
        this.disposePlanWaterMaskContext()

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
        this.planWaterMaskSettings = null
        this.planWaterMaskContext = null
        this.runtimeMaterials = null
    }
}
