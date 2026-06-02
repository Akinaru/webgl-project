import * as THREE from 'three'
import Experience from '../../../Experience.js'
import { applyStandardMaterialPatch } from './Shaders/Common/applyStandardMaterialPatch.js'
import { applyMatteWaterMaterial, stripSpecularReflectionsFromShader } from './Shaders/Common/disableSpecularReflections.js'
import { cascadeTubeShaderChunks } from '../../SceneRecuperation/World/Shaders/CascadeTubes/cascadeTubeShaderChunks.js'
import { cascadeSlopeShaderChunks } from '../../SceneRecuperation/World/Shaders/CascadeSlope/cascadeSlopeShaderChunks.js'
import * as CascadeConstants from '../../SceneRecuperation/World/Water/CascadeTubes.constants.js'

const MAIN_MESH_NAMES  = Object.freeze(['waterfall1', 'waterfall2', 'water-top', 'water-middle'])
const BOTTOM_MESH_NAME = 'water-bottom'
const ALL_MESH_NAMES   = Object.freeze([...MAIN_MESH_NAMES, BOTTOM_MESH_NAME])

const PARTICLE_COUNT   = 80
const SPLASH_COUNT     = 48
const GRAVITY          = 0.55

export default class MapFountain
{
    constructor({ mapModel = null, debugParentFolder = null } = {})
    {
        this.experience = new Experience()
        this.scene      = this.experience.scene
        this.debug      = this.experience.debug
        this.mapModel   = mapModel

        this.runtimeMaterials = []
        this.overlayMeshes    = []
        this.meshEntries      = []
        this.localTime        = 0
        this.emitAccumulator  = 0
        this.splashAccumulator = 0
        this.nextParticleIndex = 0
        this.nextSplashIndex   = 0
        this.emitCenter        = null

        this.tmpMatrix     = new THREE.Matrix4()
        this.tmpQuaternion = new THREE.Quaternion()
        this.tmpScale      = new THREE.Vector3()

        this.mainSettings   = this.createDefaultSettings()
        this.bottomSettings = this.createBottomSettings()

        this.particleSettings = {
            emitRate:     18,
            splashRate:   12,
            upSpeedMin:   0.35,
            upSpeedMax:   0.75,
            spread:       0.025,
            gravity:      GRAVITY,
            size:         0.009,
            color:        new THREE.Color('#a6ecff'),
            opacity:      0.78,
            splashSize:   0.013,
            splashColor:  new THREE.Color('#cdf5ff'),
            splashOpacity: 0.65
        }

        this.collectMeshes()
        this.applyMaterials()
        this.setupParticles()

        if(this.debug?.isDebugEnabled && debugParentFolder)
        {
            this.setDebug(debugParentFolder)
        }
    }

    // ─── Settings factory ────────────────────────────────────────────────────

    createDefaultSettings()
    {
        return {
            baseColor:                  new THREE.Color('#3b99d8'),
            foamColor:                  new THREE.Color('#9af6fe'),
            flowSpeed:                  0.35,
            flowScale:                  0.34,
            flowAngle:                  Math.PI,
            foamSpeed:                  0.61,
            foamNoiseFrequency:         4.7,
            foamThreshold:              0.76,
            foamIntensity:              1.63,
            foamOpacity:                0.76,
            foamBandAngle:              1.5708,
            opacity:                    1,
            overlayFoamColor:           new THREE.Color('#fdfdf7'),
            overlayFlowSpeed:           0.35,
            overlayFoamSpeed:           0,
            overlayFoamNoiseFrequency:  3.91,
            overlayFoamThreshold:       0.78,
            overlayFoamIntensity:       3,
            overlayFoamOpacity:         0.63,
            overlayFoamBandAngle:       1.5708,
            overlayDiameterScale:       1.087
        }
    }

    createBottomSettings()
    {
        return {
            baseColor:                  new THREE.Color('#3b99d8'),
            foamColor:                  new THREE.Color('#9af6fe'),
            flowSpeed:                  0.1,
            flowScale:                  0.13,
            flowAngle:                  Math.PI,
            foamSpeed:                  -0.26,
            foamNoiseFrequency:         7.43,
            foamThreshold:              0.76,
            foamIntensity:              2.05,
            foamOpacity:                0.76,
            foamBandAngle:              1.5708,
            opacity:                    1,
            overlayFoamColor:           new THREE.Color('#fdfdf7'),
            overlayFlowSpeed:           0.35,
            overlayFoamSpeed:           -1.74,
            overlayFoamNoiseFrequency:  4.43,
            overlayFoamThreshold:       0.78,
            overlayFoamIntensity:       3,
            overlayFoamOpacity:         0.63,
            overlayFoamBandAngle:       -0.1362,
            overlayDiameterScale:       1.087
        }
    }

    getSettingsForName(name)
    {
        return name === BOTTOM_MESH_NAME ? this.bottomSettings : this.mainSettings
    }

    // ─── Mesh collection ─────────────────────────────────────────────────────

    collectMeshes()
    {
        const root = this.mapModel?.model
        if(!root)
        {
            return
        }

        const bounds = new THREE.Box3()

        root.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            const name = String(child.name || '').trim().toLowerCase()
            if(!ALL_MESH_NAMES.includes(name))
            {
                return
            }

            const isVertical = name.startsWith('waterfall')
            const flowAngleOffset = isVertical ? Math.PI : 0

            this.meshEntries.push({ mesh: child, name, flowAngleOffset })

            // Use water-top center as particle emit source
            if(name === 'water-top' && !this.emitCenter)
            {
                bounds.setFromObject(child)
                if(!bounds.isEmpty())
                {
                    this.emitCenter = bounds.getCenter(new THREE.Vector3())
                    this.emitCenter.y = bounds.max.y + 0.05
                }
            }
        })
    }

    // ─── Material creation ───────────────────────────────────────────────────

    buildUniforms(mesh, settings, flowAngleOffset, isOverlay)
    {
        const wp = new THREE.Vector3()
        mesh.getWorldPosition(wp)

        const va = isOverlay ? 2.37 : 1.91
        const vb = isOverlay ? 5.41 : 2.17
        const vc = isOverlay ? 7.89 : 4.63

        const patternOffset = new THREE.Vector2(
            0,
            Math.abs(Math.sin(wp.z * 39.35 + wp.y * 11.14 + wp.x * 5.91 + va)) * 5
        )
        const noiseSeed = new THREE.Vector2(
            Math.abs(Math.sin(wp.x * 31.34 + wp.z * 17.42 + wp.y * 9.14 + vb)) * 4 + 0.13,
            Math.abs(Math.sin(wp.x * 7.73  + wp.z * 27.91 + wp.y * 21.55 + vc)) * 4 + 0.29
        )
        const flowOff  = Math.sin(wp.x * 4.14 + wp.z * 2.91 + wp.y * 1.73 + 1.57) * CascadeConstants.FLOW_SPEED_VARIATION_AMPLITUDE
        const foamOff  = Math.sin(wp.x * 2.52 + wp.z * 5.20 + wp.y * 1.17 + 2.67) * CascadeConstants.FOAM_SPEED_VARIATION_AMPLITUDE

        const s = isOverlay
            ? { baseColor: new THREE.Color(0x000000), foamColor: settings.overlayFoamColor.clone(),
                flowSpeed: settings.overlayFlowSpeed, foamSpeed: settings.overlayFoamSpeed,
                foamNoiseFrequency: settings.overlayFoamNoiseFrequency, foamThreshold: settings.overlayFoamThreshold,
                foamIntensity: settings.overlayFoamIntensity, foamOpacity: settings.overlayFoamOpacity,
                foamBandAngle: settings.overlayFoamBandAngle, opacity: 0 }
            : { baseColor: settings.baseColor.clone(), foamColor: settings.foamColor.clone(),
                flowSpeed: settings.flowSpeed, foamSpeed: settings.foamSpeed,
                foamNoiseFrequency: settings.foamNoiseFrequency, foamThreshold: settings.foamThreshold,
                foamIntensity: settings.foamIntensity, foamOpacity: settings.foamOpacity,
                foamBandAngle: settings.foamBandAngle, opacity: settings.opacity }

        return {
            localTime:          { value: this.localTime },
            baseColor:          { value: s.baseColor },
            foamColor:          { value: s.foamColor },
            flowSpeed:          { value: s.flowSpeed + flowOff },
            flowScale:          { value: settings.flowScale },
            flowAngle:          { value: settings.flowAngle + flowAngleOffset },
            flowAngleOffset:    { value: flowAngleOffset },
            foamSpeed:          { value: s.foamSpeed + foamOff },
            foamNoiseFrequency: { value: s.foamNoiseFrequency },
            foamThreshold:      { value: s.foamThreshold },
            foamIntensity:      { value: s.foamIntensity },
            opacity:            { value: s.opacity },
            foamOpacity:        { value: s.foamOpacity },
            foamBandAngle:      { value: s.foamBandAngle },
            flowSpeedOffset:    { value: flowOff },
            foamSpeedOffset:    { value: foamOff },
            foamOnly:           { value: isOverlay ? 1 : 0 },
            patternOffset:      { value: patternOffset },
            noiseSeed:          { value: noiseSeed },
            seamOffset:         { value: 0 },
            isOverlay,
            settingsRef: settings
        }
    }

    createMaterial(baseMaterial, mesh, settings, flowAngleOffset, isOverlay, useSlope = false)
    {
        const material = baseMaterial?.clone?.() ?? baseMaterial
        if(!material)
        {
            return material
        }

        material.transparent = true
        material.side        = THREE.DoubleSide
        material.depthWrite  = !isOverlay
        applyMatteWaterMaterial(material)
        material.userData = material.userData || {}

        const u = this.buildUniforms(mesh, settings, flowAngleOffset, isOverlay)
        material.userData.mapFountainUniforms = u

        material.onBeforeCompile = (shader) =>
        {
            shader.uniforms.uCascadeTime               = u.localTime
            shader.uniforms.uCascadeBaseColor          = u.baseColor
            shader.uniforms.uCascadeFoamColor          = u.foamColor
            shader.uniforms.uCascadeFlowSpeed          = u.flowSpeed
            shader.uniforms.uCascadeFlowScale          = u.flowScale
            shader.uniforms.uCascadeFlowAngle          = u.flowAngle
            shader.uniforms.uCascadeFoamSpeed          = u.foamSpeed
            shader.uniforms.uCascadeFoamNoiseFrequency = u.foamNoiseFrequency
            shader.uniforms.uCascadeFoamThreshold      = u.foamThreshold
            shader.uniforms.uCascadeFoamIntensity      = u.foamIntensity
            shader.uniforms.uCascadeOpacity            = u.opacity
            shader.uniforms.uCascadeFoamOpacity        = u.foamOpacity
            shader.uniforms.uCascadeFoamBandAngle      = u.foamBandAngle
            shader.uniforms.uCascadeFoamOnly           = u.foamOnly
            shader.uniforms.uCascadePatternOffset      = u.patternOffset
            shader.uniforms.uCascadeNoiseSeed          = u.noiseSeed
            shader.uniforms.uCascadeSeamOffset         = u.seamOffset
            applyStandardMaterialPatch(shader, useSlope ? cascadeSlopeShaderChunks : cascadeTubeShaderChunks)
            stripSpecularReflectionsFromShader(shader)
        }

        material.customProgramCacheKey = () => `mapFountainV2_${useSlope ? 'slope' : 'tube'}_${isOverlay ? 'ov' : 'mn'}_${material.uuid}`
        material.needsUpdate = true
        this.runtimeMaterials.push(material)
        return material
    }

    applyMaterials()
    {
        for(const entry of this.meshEntries)
        {
            const { mesh, name, flowAngleOffset } = entry
            const settings  = this.getSettingsForName(name)
            const useSlope  = name === BOTTOM_MESH_NAME
            const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material]

            const patched = src.map((m) => this.createMaterial(m, mesh, settings, flowAngleOffset, false, useSlope))
            mesh.material = Array.isArray(mesh.material) ? patched : patched[0]

            const overlayMats = src.map((m) => this.createMaterial(m, mesh, settings, flowAngleOffset, true, useSlope))
            const overlayMesh = new THREE.Mesh(
                mesh.geometry,
                Array.isArray(mesh.material) ? overlayMats : overlayMats[0]
            )
            overlayMesh.name            = `${name}_foamOverlay`
            overlayMesh.scale.set(settings.overlayDiameterScale, 1, settings.overlayDiameterScale)
            overlayMesh.renderOrder     = (mesh.renderOrder || 0) + 1
            overlayMesh.matrixAutoUpdate = false
            overlayMesh.frustumCulled   = mesh.frustumCulled
            overlayMesh.visible         = mesh.visible
            overlayMesh.castShadow      = false
            overlayMesh.receiveShadow   = false
            overlayMesh.updateMatrix()
            mesh.add(overlayMesh)
            this.overlayMeshes.push({ mesh: overlayMesh, settingsRef: settings })
        }
    }

    // ─── Sync uniforms ───────────────────────────────────────────────────────

    syncUniforms()
    {
        for(const material of this.runtimeMaterials)
        {
            const u = material?.userData?.mapFountainUniforms
            if(!u)
            {
                continue
            }

            const s     = u.settingsRef
            const isOv  = Boolean(u.isOverlay)
            const flowOff = u.flowSpeedOffset?.value ?? 0
            const foamOff = u.foamSpeedOffset?.value ?? 0

            u.baseColor.value.copy(isOv ? new THREE.Color(0x000000) : s.baseColor)
            u.foamColor.value.copy(isOv ? s.overlayFoamColor : s.foamColor)
            u.flowSpeed.value          = (isOv ? s.overlayFlowSpeed : s.flowSpeed) + flowOff
            u.flowScale.value          = s.flowScale
            u.flowAngle.value          = s.flowAngle + (u.flowAngleOffset?.value ?? 0)
            u.foamSpeed.value          = (isOv ? s.overlayFoamSpeed : s.foamSpeed) + foamOff
            u.foamNoiseFrequency.value = isOv ? s.overlayFoamNoiseFrequency : s.foamNoiseFrequency
            u.foamThreshold.value      = isOv ? s.overlayFoamThreshold     : s.foamThreshold
            u.foamIntensity.value      = isOv ? s.overlayFoamIntensity      : s.foamIntensity
            u.foamOpacity.value        = isOv ? s.overlayFoamOpacity        : s.foamOpacity
            u.foamBandAngle.value      = isOv ? s.overlayFoamBandAngle      : s.foamBandAngle
            u.opacity.value            = isOv ? 0                           : s.opacity
        }

        for(const entry of this.overlayMeshes)
        {
            const scale = entry.settingsRef.overlayDiameterScale
            entry.mesh.scale.set(scale, 1, scale)
            entry.mesh.updateMatrix()
        }
    }

    // ─── Particles ───────────────────────────────────────────────────────────

    setupParticles()
    {
        const ps = this.particleSettings

        this.particleGeometry = new THREE.SphereGeometry(ps.size, 6, 4)
        this.particleMaterial = new THREE.MeshBasicMaterial({
            color: ps.color,
            transparent: true,
            opacity: ps.opacity,
            depthWrite: false
        })
        this.particleMesh = new THREE.InstancedMesh(this.particleGeometry, this.particleMaterial, PARTICLE_COUNT)
        this.particleMesh.frustumCulled = false
        this.particleMesh.renderOrder   = 12
        this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.scene.add(this.particleMesh)

        this.particles = Array.from({ length: PARTICLE_COUNT }, () => ({
            active: false,
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            life: 0,
            maxLife: 0
        }))

        this.splashGeometry = new THREE.SphereGeometry(ps.splashSize, 6, 4)
        this.splashMaterial = new THREE.MeshBasicMaterial({
            color: ps.splashColor,
            transparent: true,
            opacity: ps.splashOpacity,
            depthWrite: false
        })
        this.splashMesh = new THREE.InstancedMesh(this.splashGeometry, this.splashMaterial, SPLASH_COUNT)
        this.splashMesh.frustumCulled = false
        this.splashMesh.renderOrder   = 12
        this.splashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.scene.add(this.splashMesh)

        this.splashes = Array.from({ length: SPLASH_COUNT }, () => ({
            active: false,
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            life: 0,
            maxLife: 0
        }))

        const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
        for(let i = 0; i < PARTICLE_COUNT; i++)
        {
            this.particleMesh.setMatrixAt(i, hidden)
        }
        for(let i = 0; i < SPLASH_COUNT; i++)
        {
            this.splashMesh.setMatrixAt(i, hidden)
        }
        this.particleMesh.instanceMatrix.needsUpdate = true
        this.splashMesh.instanceMatrix.needsUpdate   = true
    }

    syncParticleMaterials()
    {
        const ps = this.particleSettings
        this.particleMaterial.color.copy(ps.color)
        this.particleMaterial.opacity = ps.opacity
        this.splashMaterial.color.copy(ps.splashColor)
        this.splashMaterial.opacity = ps.splashOpacity
    }

    spawnParticle()
    {
        if(!this.emitCenter)
        {
            return
        }

        const ps  = this.particleSettings
        const p   = this.particles[this.nextParticleIndex]
        this.nextParticleIndex = (this.nextParticleIndex + 1) % PARTICLE_COUNT

        p.active  = true
        p.life    = 0
        p.maxLife = THREE.MathUtils.randFloat(0.55, 1.1)
        p.position.set(
            this.emitCenter.x + THREE.MathUtils.randFloatSpread(ps.spread * 2),
            this.emitCenter.y,
            this.emitCenter.z + THREE.MathUtils.randFloatSpread(ps.spread * 2)
        )
        p.velocity.set(
            THREE.MathUtils.randFloatSpread(ps.spread * 1.5),
            THREE.MathUtils.randFloat(ps.upSpeedMin, ps.upSpeedMax),
            THREE.MathUtils.randFloatSpread(ps.spread * 1.5)
        )
    }

    spawnSplash()
    {
        if(!this.emitCenter)
        {
            return
        }

        const ps = this.particleSettings
        const s  = this.splashes[this.nextSplashIndex]
        this.nextSplashIndex = (this.nextSplashIndex + 1) % SPLASH_COUNT

        s.active  = true
        s.life    = 0
        s.maxLife = THREE.MathUtils.randFloat(0.22, 0.48)
        s.position.set(
            this.emitCenter.x + THREE.MathUtils.randFloatSpread(ps.spread * 4),
            this.emitCenter.y - 0.02,
            this.emitCenter.z + THREE.MathUtils.randFloatSpread(ps.spread * 4)
        )
        s.velocity.set(
            THREE.MathUtils.randFloatSpread(0.14),
            THREE.MathUtils.randFloat(0.14, 0.36),
            THREE.MathUtils.randFloatSpread(0.14)
        )
    }

    updateParticles(dt)
    {
        const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
        let dirty = false

        for(let i = 0; i < this.particles.length; i++)
        {
            const p = this.particles[i]
            if(!p.active)
            {
                continue
            }

            p.life += dt
            if(p.life >= p.maxLife)
            {
                p.active = false
                this.particleMesh.setMatrixAt(i, hidden)
                dirty = true
                continue
            }

            p.velocity.y -= this.particleSettings.gravity * dt
            p.position.addScaledVector(p.velocity, dt)

            const alpha = 1 - (p.life / p.maxLife)
            const scale = THREE.MathUtils.lerp(0.006, 0.022, alpha)
            this.tmpScale.set(scale, scale * 1.3, scale)
            this.tmpMatrix.compose(p.position, this.tmpQuaternion.identity(), this.tmpScale)
            this.particleMesh.setMatrixAt(i, this.tmpMatrix)
            dirty = true
        }

        if(dirty)
        {
            this.particleMesh.instanceMatrix.needsUpdate = true
        }
    }

    updateSplashes(dt)
    {
        const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
        let dirty = false

        for(let i = 0; i < this.splashes.length; i++)
        {
            const s = this.splashes[i]
            if(!s.active)
            {
                continue
            }

            s.life += dt
            if(s.life >= s.maxLife)
            {
                s.active = false
                this.splashMesh.setMatrixAt(i, hidden)
                dirty = true
                continue
            }

            s.velocity.y -= this.particleSettings.gravity * 0.8 * dt
            s.position.addScaledVector(s.velocity, dt)

            const alpha = 1 - (s.life / s.maxLife)
            const scale = THREE.MathUtils.lerp(0.018, 0.004, 1 - alpha)
            this.tmpScale.set(scale, scale, scale)
            this.tmpMatrix.compose(s.position, this.tmpQuaternion.identity(), this.tmpScale)
            this.splashMesh.setMatrixAt(i, this.tmpMatrix)
            dirty = true
        }

        if(dirty)
        {
            this.splashMesh.instanceMatrix.needsUpdate = true
        }
    }

    // ─── Debug ───────────────────────────────────────────────────────────────

    buildSurfaceDebugFolders(parent, settings, label)
    {
        const d    = this.debug
        const sync = () => this.syncUniforms()

        const folder = d.addFolder(label, { parent, expanded: false })
        const inner  = d.addFolder('Mousse intérieure', { parent: folder, expanded: false })
        const outer  = d.addFolder('Mousse extérieure',  { parent: folder, expanded: false })

        d.addThreeColorBinding(folder, settings, 'baseColor',  { label: 'Couleur eau'  })?.on?.('change', sync)
        d.addThreeColorBinding(folder, settings, 'foamColor',  { label: 'Couleur mousse' })?.on?.('change', sync)
        d.addBinding(folder, settings, 'flowSpeed',  { label: 'Vitesse flux',      min: -4,      max: 4,      step: 0.01  })?.on?.('change', sync)
        d.addBinding(folder, settings, 'flowScale',  { label: 'Echelle motif',     min: 0.02,    max: 2,      step: 0.01  })?.on?.('change', sync)
        d.addBinding(folder, settings, 'flowAngle',  { label: 'Angle flux',        min: -3.1416, max: 3.1416, step: 0.001 })?.on?.('change', sync)
        d.addBinding(folder, settings, 'opacity',    { label: 'Opacite',           min: 0,       max: 1,      step: 0.01  })?.on?.('change', sync)

        d.addBinding(inner, settings, 'foamSpeed',           { label: 'Vitesse mousse',    min: -4,      max: 4,      step: 0.01  })?.on?.('change', sync)
        d.addBinding(inner, settings, 'foamBandAngle',       { label: 'Angle bandes',      min: -3.1416, max: 3.1416, step: 0.001 })?.on?.('change', sync)
        d.addBinding(inner, settings, 'foamNoiseFrequency',  { label: 'Frequence bruit',   min: 0,       max: 12,     step: 0.01  })?.on?.('change', sync)
        d.addBinding(inner, settings, 'foamThreshold',       { label: 'Largeur mousse',    min: 0,       max: 1,      step: 0.01  })?.on?.('change', sync)
        d.addBinding(inner, settings, 'foamIntensity',       { label: 'Intensite mousse',  min: 0,       max: 3,      step: 0.01  })?.on?.('change', sync)
        d.addBinding(inner, settings, 'foamOpacity',         { label: 'Opacite mousse',    min: 0,       max: 1,      step: 0.01  })?.on?.('change', sync)

        d.addThreeColorBinding(outer, settings, 'overlayFoamColor',      { label: 'Couleur mousse overlay' })?.on?.('change', sync)
        d.addBinding(outer, settings, 'overlayFlowSpeed',        { label: 'Vitesse flux overlay',    min: -4,      max: 4,      step: 0.01  })?.on?.('change', sync)
        d.addBinding(outer, settings, 'overlayFoamSpeed',        { label: 'Vitesse mousse overlay',  min: -4,      max: 4,      step: 0.01  })?.on?.('change', sync)
        d.addBinding(outer, settings, 'overlayFoamBandAngle',    { label: 'Angle bandes overlay',    min: -3.1416, max: 3.1416, step: 0.001 })?.on?.('change', sync)
        d.addBinding(outer, settings, 'overlayFoamNoiseFrequency',{ label: 'Bruit mousse overlay',  min: 0,       max: 12,     step: 0.01  })?.on?.('change', sync)
        d.addBinding(outer, settings, 'overlayFoamThreshold',    { label: 'Largeur mousse overlay',  min: 0,       max: 1,      step: 0.01  })?.on?.('change', sync)
        d.addBinding(outer, settings, 'overlayFoamIntensity',    { label: 'Intensite mousse overlay',min: 0,       max: 3,      step: 0.01  })?.on?.('change', sync)
        d.addBinding(outer, settings, 'overlayFoamOpacity',      { label: 'Opacite mousse overlay',  min: 0,       max: 1,      step: 0.01  })?.on?.('change', sync)
        d.addBinding(outer, settings, 'overlayDiameterScale',    { label: 'Diametre overlay',         min: 1,       max: 1.5,    step: 0.001 })?.on?.('change', sync)
    }

    setDebug(parentFolder)
    {
        const d  = this.debug
        const ps = this.particleSettings

        this.debugFolder = d.addFolder('Fontaine', { parent: parentFolder, expanded: false })

        this.buildSurfaceDebugFolders(this.debugFolder, this.mainSettings,   'Surfaces (main)')
        this.buildSurfaceDebugFolders(this.debugFolder, this.bottomSettings, 'water-bottom')

        // Particles
        const pf = d.addFolder('Particules', { parent: this.debugFolder, expanded: false })
        const syncP = () => this.syncParticleMaterials()

        d.addThreeColorBinding(pf, ps, 'color',        { label: 'Couleur gouttes' })?.on?.('change', syncP)
        d.addBinding(pf, ps, 'opacity',      { label: 'Opacite gouttes',  min: 0,   max: 1,   step: 0.01 })?.on?.('change', syncP)
        d.addBinding(pf, ps, 'emitRate',     { label: 'Taux emission',    min: 0,   max: 60,  step: 1    })
        d.addBinding(pf, ps, 'upSpeedMin',   { label: 'Vitesse min',      min: 0,   max: 2,   step: 0.01 })
        d.addBinding(pf, ps, 'upSpeedMax',   { label: 'Vitesse max',      min: 0,   max: 2,   step: 0.01 })
        d.addBinding(pf, ps, 'spread',       { label: 'Dispersion',       min: 0,   max: 0.2, step: 0.001 })
        d.addBinding(pf, ps, 'gravity',      { label: 'Gravite',          min: 0,   max: 2,   step: 0.01 })

        d.addThreeColorBinding(pf, ps, 'splashColor',  { label: 'Couleur splash' })?.on?.('change', syncP)
        d.addBinding(pf, ps, 'splashOpacity', { label: 'Opacite splash',   min: 0,  max: 1,   step: 0.01 })?.on?.('change', syncP)
        d.addBinding(pf, ps, 'splashRate',    { label: 'Taux splash',      min: 0,  max: 40,  step: 1    })
    }

    // ─── Update / Destroy ────────────────────────────────────────────────────

    update(delta = this.experience.time.delta)
    {
        this.localTime += Math.max(0, Number.isFinite(delta) ? delta : 16.67) * 0.001
        const dt = Math.min(50, Number.isFinite(delta) ? delta : 16.67) * 0.001

        for(const material of this.runtimeMaterials)
        {
            const u = material?.userData?.mapFountainUniforms
            if(u)
            {
                u.localTime.value = this.localTime
            }
        }

        if(this.emitCenter)
        {
            this.emitAccumulator += dt * this.particleSettings.emitRate
            while(this.emitAccumulator >= 1)
            {
                this.emitAccumulator -= 1
                this.spawnParticle()
            }

            this.splashAccumulator += dt * this.particleSettings.splashRate
            while(this.splashAccumulator >= 1)
            {
                this.splashAccumulator -= 1
                this.spawnSplash()
            }
        }

        this.updateParticles(dt)
        this.updateSplashes(dt)
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugFolder = null

        for(const entry of this.overlayMeshes)
        {
            entry.mesh.parent?.remove?.(entry.mesh)
        }

        for(const material of this.runtimeMaterials)
        {
            material.dispose()
        }

        this.scene.remove(this.particleMesh)
        this.scene.remove(this.splashMesh)
        this.particleGeometry?.dispose?.()
        this.particleMaterial?.dispose?.()
        this.splashGeometry?.dispose?.()
        this.splashMaterial?.dispose?.()

        this.runtimeMaterials = []
        this.overlayMeshes    = []
        this.meshEntries      = []
        this.mapModel         = null
    }
}
