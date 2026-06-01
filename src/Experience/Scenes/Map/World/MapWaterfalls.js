import * as THREE from 'three'
import Experience from '../../../Experience.js'
import { applyStandardMaterialPatch } from './Shaders/Common/applyStandardMaterialPatch.js'
import { applyMatteWaterMaterial, stripSpecularReflectionsFromShader } from './Shaders/Common/disableSpecularReflections.js'
import { cascadeTubeShaderChunks } from '../../SceneRecuperation/World/Shaders/CascadeTubes/cascadeTubeShaderChunks.js'

const WATER_SURFACE_NAME_TOKENS = Object.freeze([
    'waterfall1',
    'waterfall2',
    'water-top',
    'water-middle',
    'water-bottom'
])

const BASE_COLOR = '#1F9CD2'
const FOAM_COLOR = '#9AF6FE'
const OVERLAY_FOAM_COLOR = '#FDFDF7'
const FLOW_SCALE = 0.34
const FLOW_SPEED = 0.35
const FOAM_SPEED = 0.61
const FOAM_NOISE_FREQUENCY = 7.43
const FOAM_THRESHOLD = 0.76
const FOAM_INTENSITY = 1.63
const FOAM_OPACITY = 0.76
const FOAM_BAND_ANGLE = 1.5708
const OVERLAY_FOAM_THRESHOLD = 0.78
const OVERLAY_FOAM_INTENSITY = 3
const OVERLAY_FOAM_OPACITY = 0.63
const OVERLAY_DIAMETER_SCALE = 1.08
const PARTICLE_COUNT = 120
const SPLASH_COUNT = 72
const PARTICLE_EMIT_RATE = 22
const SPLASH_EMIT_RATE = 14

export default class MapWaterfalls
{
    constructor({ mapModel = null } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.mapModel = mapModel
        this.runtimeMaterials = []
        this.overlayMeshes = []
        this.surfaceEntries = this.collectSurfaceEntries()
        this.emitters = this.createEmitters()
        this.localTime = 0
        this.emitAccumulator = 0
        this.splashAccumulator = 0
        this.tmpMatrix = new THREE.Matrix4()
        this.tmpQuaternion = new THREE.Quaternion()
        this.tmpScale = new THREE.Vector3()
        this.tmpColor = new THREE.Color()

        this.setParticleSystems()
        this.applyMaterials()
        this.resetParticles()
        this.resetSplashes()
    }

    collectSurfaceEntries()
    {
        const root = this.mapModel?.model
        if(!root)
        {
            return []
        }

        const entries = []
        root.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            const name = String(child.name || '').trim().toLowerCase()
            if(!WATER_SURFACE_NAME_TOKENS.includes(name))
            {
                return
            }

            entries.push({
                mesh: child,
                normalizedName: name
            })
        })

        return entries
    }

    createEmitters()
    {
        const emitters = []
        const bounds = new THREE.Box3()
        const center = new THREE.Vector3()
        const size = new THREE.Vector3()

        for(const entry of this.surfaceEntries)
        {
            if(!entry.normalizedName.startsWith('waterfall'))
            {
                continue
            }

            bounds.setFromObject(entry.mesh)
            if(bounds.isEmpty())
            {
                continue
            }

            bounds.getCenter(center)
            bounds.getSize(size)
            emitters.push({
                x: center.x,
                y: bounds.min.y + 0.03,
                z: center.z,
                width: Math.max(size.x, 0.12),
                depth: Math.max(size.z, 0.12)
            })
        }

        return emitters
    }

    setParticleSystems()
    {
        this.particleGeometry = new THREE.SphereGeometry(0.011, 7, 5)
        this.particleMaterial = new THREE.MeshBasicMaterial({
            color: '#a6ecff',
            transparent: true,
            opacity: 0.78,
            depthWrite: false
        })
        this.particleMesh = new THREE.InstancedMesh(this.particleGeometry, this.particleMaterial, PARTICLE_COUNT)
        this.particleMesh.frustumCulled = false
        this.particleMesh.renderOrder = 12
        this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.scene.add(this.particleMesh)
        this.particles = Array.from({ length: PARTICLE_COUNT }, () => ({
            active: false,
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            life: 0,
            maxLife: 0
        }))
        this.nextParticleIndex = 0

        this.splashGeometry = new THREE.SphereGeometry(0.013, 7, 5)
        this.splashMaterial = new THREE.MeshBasicMaterial({
            color: '#dcfbff',
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        })
        this.splashMesh = new THREE.InstancedMesh(this.splashGeometry, this.splashMaterial, SPLASH_COUNT)
        this.splashMesh.frustumCulled = false
        this.splashMesh.renderOrder = 13
        this.splashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.scene.add(this.splashMesh)
        this.splashes = Array.from({ length: SPLASH_COUNT }, () => ({
            active: false,
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            life: 0,
            maxLife: 0
        }))
        this.nextSplashIndex = 0
    }

    applyMaterials()
    {
        for(const entry of this.surfaceEntries)
        {
            const sourceMaterials = Array.isArray(entry.mesh.material) ? entry.mesh.material : [entry.mesh.material]
            const patchedMaterials = sourceMaterials.map((material) => this.createWaterMaterial(material, entry, false))
            entry.mesh.material = Array.isArray(entry.mesh.material) ? patchedMaterials : patchedMaterials[0]
            this.attachFoamOverlay(entry.mesh, sourceMaterials, entry)
        }
    }

    createWaterMaterial(baseMaterial, entry, isOverlay)
    {
        const material = baseMaterial?.clone?.() ?? baseMaterial
        if(!material)
        {
            return material
        }

        const worldPosition = new THREE.Vector3()
        entry.mesh.getWorldPosition(worldPosition)
        const patternOffset = new THREE.Vector2(0, Math.abs(Math.sin(worldPosition.x * 3.7 + worldPosition.z * 1.9)) * 5)
        const noiseSeed = new THREE.Vector2(
            Math.abs(Math.sin(worldPosition.x * 2.3 + worldPosition.y * 1.1)) * 4 + 0.13,
            Math.abs(Math.sin(worldPosition.z * 2.7 + worldPosition.y * 0.7)) * 4 + 0.29
        )
        const flowAngle = entry.normalizedName.startsWith('waterfall') ? Math.PI * 0.5 : 0

        material.transparent = true
        material.side = THREE.DoubleSide
        material.depthWrite = !isOverlay
        applyMatteWaterMaterial(material)
        material.userData = material.userData || {}
        material.userData.mapWaterfallUniforms = {
            localTime: { value: this.localTime },
            baseColor: { value: new THREE.Color(isOverlay ? '#000000' : BASE_COLOR) },
            foamColor: { value: new THREE.Color(isOverlay ? OVERLAY_FOAM_COLOR : FOAM_COLOR) },
            flowSpeed: { value: FLOW_SPEED },
            flowScale: { value: FLOW_SCALE },
            flowAngle: { value: flowAngle },
            foamSpeed: { value: isOverlay ? 0 : FOAM_SPEED },
            foamNoiseFrequency: { value: isOverlay ? 4.43 : FOAM_NOISE_FREQUENCY },
            foamThreshold: { value: isOverlay ? OVERLAY_FOAM_THRESHOLD : FOAM_THRESHOLD },
            foamIntensity: { value: isOverlay ? OVERLAY_FOAM_INTENSITY : FOAM_INTENSITY },
            opacity: { value: isOverlay ? 0 : 1 },
            foamOpacity: { value: isOverlay ? OVERLAY_FOAM_OPACITY : FOAM_OPACITY },
            foamBandAngle: { value: FOAM_BAND_ANGLE },
            foamOnly: { value: isOverlay ? 1 : 0 },
            patternOffset: { value: patternOffset },
            noiseSeed: { value: noiseSeed },
            seamOffset: { value: 0 }
        }

        material.onBeforeCompile = (shader) =>
        {
            const uniforms = material.userData.mapWaterfallUniforms
            shader.uniforms.uCascadeTime = uniforms.localTime
            shader.uniforms.uCascadeBaseColor = uniforms.baseColor
            shader.uniforms.uCascadeFoamColor = uniforms.foamColor
            shader.uniforms.uCascadeFlowSpeed = uniforms.flowSpeed
            shader.uniforms.uCascadeFlowScale = uniforms.flowScale
            shader.uniforms.uCascadeFlowAngle = uniforms.flowAngle
            shader.uniforms.uCascadeFoamSpeed = uniforms.foamSpeed
            shader.uniforms.uCascadeFoamNoiseFrequency = uniforms.foamNoiseFrequency
            shader.uniforms.uCascadeFoamThreshold = uniforms.foamThreshold
            shader.uniforms.uCascadeFoamIntensity = uniforms.foamIntensity
            shader.uniforms.uCascadeOpacity = uniforms.opacity
            shader.uniforms.uCascadeFoamOpacity = uniforms.foamOpacity
            shader.uniforms.uCascadeFoamBandAngle = uniforms.foamBandAngle
            shader.uniforms.uCascadeFoamOnly = uniforms.foamOnly
            shader.uniforms.uCascadePatternOffset = uniforms.patternOffset
            shader.uniforms.uCascadeNoiseSeed = uniforms.noiseSeed
            shader.uniforms.uCascadeSeamOffset = uniforms.seamOffset

            applyStandardMaterialPatch(shader, cascadeTubeShaderChunks)
            stripSpecularReflectionsFromShader(shader)
        }

        material.customProgramCacheKey = () => `map-waterfall-${entry.normalizedName}-${isOverlay ? 'overlay' : 'main'}-${material.uuid}`
        material.needsUpdate = true
        this.runtimeMaterials.push(material)
        return material
    }

    attachFoamOverlay(mesh, sourceMaterials, entry)
    {
        const overlayMaterials = sourceMaterials.map((material) => this.createWaterMaterial(material, entry, true))
        const overlayMesh = new THREE.Mesh(mesh.geometry, Array.isArray(mesh.material) ? overlayMaterials : overlayMaterials[0])
        overlayMesh.name = `${mesh.name || 'mapWater'}_foamOverlay`
        overlayMesh.scale.set(OVERLAY_DIAMETER_SCALE, 1, OVERLAY_DIAMETER_SCALE)
        overlayMesh.renderOrder = (mesh.renderOrder || 0) + 1
        overlayMesh.matrixAutoUpdate = false
        overlayMesh.frustumCulled = mesh.frustumCulled
        overlayMesh.visible = mesh.visible
        overlayMesh.castShadow = false
        overlayMesh.receiveShadow = false
        overlayMesh.updateMatrix()
        mesh.add(overlayMesh)
        this.overlayMeshes.push(overlayMesh)
    }

    resetParticles()
    {
        const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
        for(let index = 0; index < PARTICLE_COUNT; index++)
        {
            this.particleMesh.setMatrixAt(index, hidden)
        }
        this.particleMesh.instanceMatrix.needsUpdate = true
    }

    resetSplashes()
    {
        const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
        for(let index = 0; index < SPLASH_COUNT; index++)
        {
            this.splashMesh.setMatrixAt(index, hidden)
        }
        this.splashMesh.instanceMatrix.needsUpdate = true
    }

    spawnParticle()
    {
        if(this.emitters.length === 0)
        {
            return
        }

        const emitter = this.emitters[Math.floor(Math.random() * this.emitters.length)]
        const particle = this.particles[this.nextParticleIndex]
        this.nextParticleIndex = (this.nextParticleIndex + 1) % PARTICLE_COUNT

        particle.active = true
        particle.life = 0
        particle.maxLife = THREE.MathUtils.randFloat(0.55, 1.05)
        particle.position.set(
            emitter.x + THREE.MathUtils.randFloatSpread(emitter.width),
            emitter.y + THREE.MathUtils.randFloat(-0.03, 0.06),
            emitter.z + THREE.MathUtils.randFloatSpread(emitter.depth)
        )
        particle.velocity.set(
            THREE.MathUtils.randFloatSpread(0.06),
            THREE.MathUtils.randFloat(0.12, 0.3),
            THREE.MathUtils.randFloatSpread(0.06)
        )
    }

    spawnSplash()
    {
        if(this.emitters.length === 0)
        {
            return
        }

        const emitter = this.emitters[Math.floor(Math.random() * this.emitters.length)]
        const splash = this.splashes[this.nextSplashIndex]
        this.nextSplashIndex = (this.nextSplashIndex + 1) % SPLASH_COUNT

        splash.active = true
        splash.life = 0
        splash.maxLife = THREE.MathUtils.randFloat(0.24, 0.5)
        splash.position.set(
            emitter.x + THREE.MathUtils.randFloatSpread(emitter.width * 0.7),
            emitter.y,
            emitter.z + THREE.MathUtils.randFloatSpread(emitter.depth * 0.7)
        )
        splash.velocity.set(
            THREE.MathUtils.randFloatSpread(0.18),
            THREE.MathUtils.randFloat(0.18, 0.42),
            THREE.MathUtils.randFloatSpread(0.18)
        )
    }

    updateParticles(deltaSeconds)
    {
        let dirty = false
        const hidden = new THREE.Matrix4().makeScale(0, 0, 0)

        for(let index = 0; index < this.particles.length; index++)
        {
            const particle = this.particles[index]
            if(!particle.active)
            {
                continue
            }

            particle.life += deltaSeconds
            if(particle.life >= particle.maxLife)
            {
                particle.active = false
                this.particleMesh.setMatrixAt(index, hidden)
                dirty = true
                continue
            }

            particle.velocity.y *= 0.985
            particle.position.addScaledVector(particle.velocity, deltaSeconds)
            const alpha = 1 - (particle.life / particle.maxLife)
            const scale = THREE.MathUtils.lerp(0.01, 0.032, alpha)
            this.tmpScale.set(scale, scale * 1.4, scale)
            this.tmpMatrix.compose(particle.position, this.tmpQuaternion.identity(), this.tmpScale)
            this.particleMesh.setMatrixAt(index, this.tmpMatrix)
            dirty = true
        }

        if(dirty)
        {
            this.particleMesh.instanceMatrix.needsUpdate = true
        }
    }

    updateSplashes(deltaSeconds)
    {
        let dirty = false
        const hidden = new THREE.Matrix4().makeScale(0, 0, 0)

        for(let index = 0; index < this.splashes.length; index++)
        {
            const splash = this.splashes[index]
            if(!splash.active)
            {
                continue
            }

            splash.life += deltaSeconds
            if(splash.life >= splash.maxLife)
            {
                splash.active = false
                this.splashMesh.setMatrixAt(index, hidden)
                dirty = true
                continue
            }

            splash.velocity.y -= deltaSeconds * 0.65
            splash.position.addScaledVector(splash.velocity, deltaSeconds)
            const alpha = 1 - (splash.life / splash.maxLife)
            const scale = THREE.MathUtils.lerp(0.016, 0.004, 1 - alpha)
            this.tmpScale.set(scale, scale, scale)
            this.tmpMatrix.compose(splash.position, this.tmpQuaternion.identity(), this.tmpScale)
            this.splashMesh.setMatrixAt(index, this.tmpMatrix)
            dirty = true
        }

        if(dirty)
        {
            this.splashMesh.instanceMatrix.needsUpdate = true
        }
    }

    update(delta = this.experience.time.delta)
    {
        this.localTime = this.experience.time.elapsed * 0.001
        const deltaSeconds = Math.min(50, delta) * 0.001

        for(const material of this.runtimeMaterials)
        {
            const uniforms = material?.userData?.mapWaterfallUniforms
            if(uniforms)
            {
                uniforms.localTime.value = this.localTime
            }
        }

        if(this.emitters.length > 0)
        {
            this.emitAccumulator += deltaSeconds * PARTICLE_EMIT_RATE
            while(this.emitAccumulator >= 1)
            {
                this.emitAccumulator -= 1
                this.spawnParticle()
            }

            this.splashAccumulator += deltaSeconds * SPLASH_EMIT_RATE
            while(this.splashAccumulator >= 1)
            {
                this.splashAccumulator -= 1
                this.spawnSplash()
            }
        }

        this.updateParticles(deltaSeconds)
        this.updateSplashes(deltaSeconds)
    }

    destroy()
    {
        for(const material of this.runtimeMaterials)
        {
            material.dispose?.()
        }
        this.runtimeMaterials = []

        for(const overlayMesh of this.overlayMeshes)
        {
            overlayMesh.parent?.remove?.(overlayMesh)
        }
        this.overlayMeshes = []

        this.scene.remove(this.particleMesh)
        this.scene.remove(this.splashMesh)
        this.particleGeometry?.dispose?.()
        this.particleMaterial?.dispose?.()
        this.splashGeometry?.dispose?.()
        this.splashMaterial?.dispose?.()
    }
}
