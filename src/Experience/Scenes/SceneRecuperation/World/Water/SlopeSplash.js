import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import * as C from './SlopeSplash.constants.js'

export default class SlopeSplash
{
    constructor({ debugParentFolder = null, emitters = null } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug
        this.debugParentFolder = debugParentFolder

        this.emitters = Array.isArray(emitters) && emitters.length > 0
            ? emitters.map((emitter) => ({ ...emitter }))
            : C.DEFAULT_EMITTERS.map((emitter) => ({ ...emitter }))
        this.showLines = false

        // Tunables exposés au debug
        this.settings = {
            emitRate:  C.PARTICLE_EMIT_RATE,
            scaleXZ:   0.31,
            riseSpeed: 0.15,
            opacity:   C.PARTICLE_OPACITY
        }

        this.emitAccumulators = new Array(this.emitters.length).fill(0)
        this.colorDirty = false

        this.tmpMatrix     = new THREE.Matrix4()
        this.tmpPosition   = new THREE.Vector3()
        this.tmpQuaternion = new THREE.Quaternion()
        this.tmpScale      = new THREE.Vector3()
        this.tmpColor      = new THREE.Color()

        this.visuals = []

        this.createLineVisuals()
        this.createParticleMesh()
        this.createParticlePool()
        this.setDebug()
    }

    // ─────────────────────────────── Helpers d'émission ──────────────────────

    randomOnSegment(emitter)
    {
        const t = Math.random()
        return new THREE.Vector3(
            emitter.x1 + t * (emitter.x2 - emitter.x1),
            emitter.y + (Math.random() - 0.5) * C.PARTICLE_SPAWN_Y_JITTER * 2,
            emitter.z1 + t * (emitter.z2 - emitter.z1)
        )
    }

    // ─────────────────────────────── Visuels debug ───────────────────────────

    createLineVisuals()
    {
        for(let i = 0; i < this.emitters.length; i++)
        {
            const color = new THREE.Color(C.EMITTER_COLORS[i])

            const lineGeo = new THREE.BufferGeometry()
            lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
            const lineMat = new THREE.LineBasicMaterial({ color, depthTest: false })
            const line    = new THREE.Line(lineGeo, lineMat)
            line.renderOrder    = 999
            line.frustumCulled  = false

            const sphereGeo  = new THREE.SphereGeometry(C.ENDPOINT_SPHERE_RADIUS, 8, 6)
            const sphereMatA = new THREE.MeshBasicMaterial({ color, depthTest: false })
            const sphereMatB = new THREE.MeshBasicMaterial({ color, depthTest: false })
            const sphereA    = new THREE.Mesh(sphereGeo,         sphereMatA)
            const sphereB    = new THREE.Mesh(sphereGeo.clone(), sphereMatB)
            sphereA.renderOrder = 999
            sphereB.renderOrder = 999

            const group = new THREE.Group()
            group.add(line, sphereA, sphereB)
            group.visible = false
            this.scene.add(group)

            this.visuals.push({ group, line, sphereA, sphereB })
        }

        this.syncLineVisuals()
    }

    syncLineVisuals()
    {
        for(let i = 0; i < this.emitters.length; i++)
        {
            const e = this.emitters[i]
            const { group, line, sphereA, sphereB } = this.visuals[i]

            const pos = line.geometry.attributes.position.array
            pos[0] = e.x1; pos[1] = e.y; pos[2] = e.z1
            pos[3] = e.x2; pos[4] = e.y; pos[5] = e.z2
            line.geometry.attributes.position.needsUpdate = true
            line.geometry.computeBoundingSphere()

            sphereA.position.set(e.x1, e.y, e.z1)
            sphereB.position.set(e.x2, e.y, e.z2)

            group.visible = this.showLines
        }
    }

    copyValues()
    {
        const rows = this.emitters.map((e, i) =>
            `    { x1: ${e.x1.toFixed(2)}, z1: ${e.z1.toFixed(2)}, x2: ${e.x2.toFixed(2)}, z2: ${e.z2.toFixed(2)}, y: ${e.y.toFixed(2)} }, // ${C.EMITTER_LABELS[i]}`
        )
        const text = `export const SLOPE_SPLASH_EMITTERS = Object.freeze([\n${rows.join('\n')}\n])`
        navigator.clipboard?.writeText(text)
            ?.catch((err) => console.warn('[SlopeSplash] Copie échouée:', err))
    }

    // ─────────────────────────────── Particules ──────────────────────────────

    createParticleMesh()
    {
        this.particleGeometry = new THREE.SphereGeometry(1, 7, 5)

        this.particleMaterial = new THREE.MeshBasicMaterial({
            color:       0xffffff,
            transparent: true,
            opacity:     this.settings.opacity,
            depthWrite:  false,
            blending:    THREE.NormalBlending
        })

        this.particleMesh = new THREE.InstancedMesh(
            this.particleGeometry,
            this.particleMaterial,
            C.PARTICLE_COUNT
        )
        this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.particleMesh.frustumCulled = false
        this.particleMesh.renderOrder   = 10

        // Cache toutes les instances hors champ au départ
        const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0)
        for(let i = 0; i < C.PARTICLE_COUNT; i++)
        {
            this.particleMesh.setMatrixAt(i, hiddenMatrix)
        }
        this.particleMesh.instanceMatrix.needsUpdate = true

        // instanceColor pour le fade par particule
        this.particleMesh.instanceColor = new THREE.InstancedBufferAttribute(
            new Float32Array(C.PARTICLE_COUNT * 3), 3
        )
        const white = new THREE.Color(1, 1, 1)
        for(let i = 0; i < C.PARTICLE_COUNT; i++)
        {
            this.particleMesh.setColorAt(i, white)
        }
        this.particleMesh.instanceColor.needsUpdate = true

        this.scene.add(this.particleMesh)
    }

    createParticlePool()
    {
        this.nextParticleIndex = 0
        this.particles = Array.from({ length: C.PARTICLE_COUNT }, () => ({
            active:      false,
            position:    new THREE.Vector3(),
            velocity:    new THREE.Vector3(),
            life:        0,
            maxLife:     0,
            baseXZScale: 0,
            baseYScale:  0
        }))
    }

    spawnParticle(emitterIndex)
    {
        const index   = this.nextParticleIndex
        const particle = this.particles[index]
        this.nextParticleIndex = (this.nextParticleIndex + 1) % C.PARTICLE_COUNT

        const emitter = this.emitters[emitterIndex]

        particle.active   = true
        particle.life     = 0
        particle.maxLife  = THREE.MathUtils.lerp(
            C.PARTICLE_LIFE_MIN, C.PARTICLE_LIFE_MAX, Math.random()
        )

        const scaleXZ = THREE.MathUtils.lerp(
            this.settings.scaleXZ * 0.7,
            this.settings.scaleXZ * 1.3,
            Math.random()
        )
        const emitterScaleMultiplier = Number.isFinite(emitter?.scaleMultiplier) ? emitter.scaleMultiplier : 1
        const effectiveScaleXZ = scaleXZ * emitterScaleMultiplier

        particle.baseXZScale = effectiveScaleXZ
        particle.baseYScale  = effectiveScaleXZ * C.PARTICLE_SCALE_Y_RATIO

        particle.position.copy(this.randomOnSegment(emitter))

        const riseSpeed = this.settings.riseSpeed * THREE.MathUtils.lerp(0.7, 1.3, Math.random())
        const driftAngle = Math.random() * Math.PI * 2
        const driftAmt = Math.random() * C.PARTICLE_DRIFT_MAX

        particle.velocity.set(
            Math.cos(driftAngle) * driftAmt,
            riseSpeed,
            Math.sin(driftAngle) * driftAmt
        )

        // Légère variation de teinte : blanc pur → légèrement bleuté ou grisé
        const brightness = THREE.MathUtils.lerp(
            C.PARTICLE_BRIGHTNESS_MIN, C.PARTICLE_BRIGHTNESS_MAX, Math.random()
        )
        const blueShift = Math.random() * C.PARTICLE_BLUE_SHIFT_MAX
        this.tmpColor.setRGB(brightness, brightness, Math.min(1, brightness + blueShift))
        this.particleMesh.setColorAt(index, this.tmpColor)
        this.colorDirty = true
    }

    updateParticles(deltaSeconds)
    {
        let matrixDirty = false

        for(let i = 0; i < C.PARTICLE_COUNT; i++)
        {
            const p = this.particles[i]

            if(!p.active)
            {
                continue
            }

            p.life += deltaSeconds
            if(p.life >= p.maxLife)
            {
                p.active = false
                this.tmpMatrix.makeScale(0, 0, 0)
                this.particleMesh.setMatrixAt(i, this.tmpMatrix)
                matrixDirty = true
                continue
            }

            const progress = p.life / p.maxLife

            // Déplacement avec légère traînée
            p.velocity.y *= 0.992
            p.velocity.x *= 0.980
            p.velocity.z *= 0.980
            p.position.addScaledVector(p.velocity, deltaSeconds)

            // Scale: croît sur 20%, plein sur 20-75%, rétrécit sur 75-100%
            let scaleT
            if(progress < 0.20)
            {
                scaleT = progress / 0.20
            }
            else if(progress < 0.75)
            {
                scaleT = 1.0
            }
            else
            {
                scaleT = 1.0 - (progress - 0.75) / 0.25
            }

            const xzScale = scaleT * p.baseXZScale
            const yScale  = scaleT * p.baseYScale
            this.tmpScale.set(xzScale, yScale, xzScale)
            this.tmpPosition.copy(p.position)
            this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, this.tmpScale)
            this.particleMesh.setMatrixAt(i, this.tmpMatrix)
            matrixDirty = true
        }

        if(matrixDirty) this.particleMesh.instanceMatrix.needsUpdate = true
        if(this.colorDirty)
        {
            this.particleMesh.instanceColor.needsUpdate = true
            this.colorDirty = false
        }
    }

    // ─────────────────────────────── Loop ────────────────────────────────────

    update(deltaMs = this.experience.time.delta)
    {
        const deltaSeconds = Math.max(0.001, Math.min(0.05, (deltaMs || 16.67) * 0.001))

        // Emission continue sur chaque ligne
        for(let ei = 0; ei < this.emitters.length; ei++)
        {
            this.emitAccumulators[ei] += deltaSeconds * this.settings.emitRate
            while(this.emitAccumulators[ei] >= 1)
            {
                this.spawnParticle(ei)
                this.emitAccumulators[ei] -= 1
            }
        }

        this.updateParticles(deltaSeconds)
    }

    // ─────────────────────────────── Debug ───────────────────────────────────

    setDebug()
    {
        if(!this.debug?.isDebugEnabled) return

        this.debugFolder = this.debug.addFolder('Splash pentes', {
            parent: this.debugParentFolder || this.debug.ui,
            expanded: false
        })

        // ── Visuels lignes ──
        this.debug.addBinding(this.debugFolder, this, 'showLines', {
            label: 'Afficher lignes',
            export: false
        })?.on('change', () => this.syncLineVisuals())

        const PROPS = [
            { key: 'x1', label: 'Début X',   isY: false },
            { key: 'z1', label: 'Début Z',   isY: false },
            { key: 'x2', label: 'Fin X',     isY: false },
            { key: 'z2', label: 'Fin Z',     isY: false },
            { key: 'y',  label: 'Hauteur Y', isY: true  }
        ]

        for(let i = 0; i < this.emitters.length; i++)
        {
            const emitter = this.emitters[i]
            const sub = this.debug.addFolder(C.EMITTER_LABELS[i], {
                parent: this.debugFolder,
                expanded: false
            })
            for(const prop of PROPS)
            {
                this.debug.addBinding(sub, emitter, prop.key, {
                    label: prop.label,
                    min:   prop.isY ? C.DEBUG_Y_MIN     : C.DEBUG_COORD_MIN,
                    max:   prop.isY ? C.DEBUG_Y_MAX     : C.DEBUG_COORD_MAX,
                    step:  C.DEBUG_STEP,
                    export: false
                })?.on('change', () => this.syncLineVisuals())
            }
        }

        this.debug.addButton(this.debugFolder, {
            title: 'Copier les 4 valeurs',
            onClick: () => this.copyValues()
        })

        // ── Réglages particules ──
        const particleFolder = this.debug.addFolder('Particules brume', {
            parent: this.debugFolder,
            expanded: false
        })

        this.debug.addBinding(particleFolder, this.settings, 'emitRate', {
            label: 'Taux émission / pente',
            min: 1, max: 20, step: 0.5, export: false
        })
        this.debug.addBinding(particleFolder, this.settings, 'scaleXZ', {
            label: 'Taille',
            min: 0.04, max: 0.50, step: 0.01, export: false
        })
        this.debug.addBinding(particleFolder, this.settings, 'riseSpeed', {
            label: 'Vitesse montée',
            min: 0.02, max: 0.60, step: 0.01, export: false
        })
        this.debug.addBinding(particleFolder, this.settings, 'opacity', {
            label: 'Opacité',
            min: 0.02, max: 0.60, step: 0.01, export: false
        })?.on('change', () =>
        {
            this.particleMaterial.opacity = this.settings.opacity
        })
    }

    // ─────────────────────────────── Nettoyage ───────────────────────────────

    destroy()
    {
        // Lignes debug
        for(const { group, line, sphereA, sphereB } of this.visuals)
        {
            this.scene.remove(group)
            line.geometry.dispose()
            line.material.dispose()
            sphereA.geometry.dispose()
            sphereA.material.dispose()
            sphereB.geometry.dispose()
            sphereB.material.dispose()
        }
        this.visuals = []

        // Maillage particules
        if(this.particleMesh)
        {
            this.scene.remove(this.particleMesh)
            this.particleGeometry.dispose()
            this.particleMaterial.dispose()
            this.particleMesh = null
        }

        this.debugFolder?.dispose?.()
    }
}
