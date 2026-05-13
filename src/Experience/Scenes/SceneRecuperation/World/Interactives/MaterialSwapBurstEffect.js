import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import * as MaterialSwapBurstEffectConstants from './MaterialSwapBurstEffect.constants.js'

const OFFSCREEN_POSITION = -9999

export default class MaterialSwapBurstEffect
{
    constructor({ targets = [] } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.targets = Array.isArray(targets) ? targets : []
        this.totalParticles = MaterialSwapBurstEffectConstants.MAX_BURSTS * MaterialSwapBurstEffectConstants.PARTICLES_PER_BURST
        this.nextBurstIndex = 0
        this.clockSeconds = 0
        this.tmpBounds = new THREE.Box3()
        this.tmpCenter = new THREE.Vector3()
        this.tmpSize = new THREE.Vector3()
        this.tmpColor = new THREE.Color()
        this.tmpVariantColor = new THREE.Color()
        this.tmpDirection = new THREE.Vector3()
        this.tmpTangent = new THREE.Vector3()
        this.tmpBitangent = new THREE.Vector3()
        this.upVector = new THREE.Vector3(0, 1, 0)

        this.setGeometry()
        this.setMaterial()
        this.setPoints()
        this.resetAttributes()
    }

    setGeometry()
    {
        this.geometry = new THREE.BufferGeometry()
        this.startPositions = new Float32Array(this.totalParticles * 3)
        this.velocities = new Float32Array(this.totalParticles * 3)
        this.colors = new Float32Array(this.totalParticles * 3)
        this.spawnTimes = new Float32Array(this.totalParticles)
        this.lifetimes = new Float32Array(this.totalParticles)
        this.sizes = new Float32Array(this.totalParticles)
        this.seeds = new Float32Array(this.totalParticles)

        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.startPositions, 3))
        this.geometry.setAttribute('aVelocity', new THREE.BufferAttribute(this.velocities, 3))
        this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3))
        this.geometry.setAttribute('aSpawnTime', new THREE.BufferAttribute(this.spawnTimes, 1))
        this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lifetimes, 1))
        this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1))
        this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 1))
        this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200)
    }

    setMaterial()
    {
        this.material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: {
                uTime: { value: 0 },
                uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
            },
            vertexShader: `
                attribute vec3 aVelocity;
                attribute vec3 aColor;
                attribute float aSpawnTime;
                attribute float aLife;
                attribute float aSize;
                attribute float aSeed;

                uniform float uTime;
                uniform float uPixelRatio;

                varying vec3 vColor;
                varying float vAlpha;
                varying float vSpark;

                void main()
                {
                    float age = uTime - aSpawnTime;
                    if(age < 0.0 || age > aLife)
                    {
                        vAlpha = 0.0;
                        vSpark = 0.0;
                        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                        gl_PointSize = 0.0;
                        return;
                    }

                    float lifeProgress = age / max(aLife, 0.0001);
                    float drag = 1.0 - (lifeProgress * 0.32);
                    vec3 displacedPosition = position + (aVelocity * age * drag);
                    displacedPosition.y += sin((lifeProgress * 3.14159265) + (aSeed * 6.2831853)) * 0.08;

                    vec4 mvPosition = modelViewMatrix * vec4(displacedPosition, 1.0);
                    gl_Position = projectionMatrix * mvPosition;

                    float perspectiveScale = clamp(1.0 / max(0.45, -mvPosition.z), 0.0, 4.0);
                    gl_PointSize = aSize * uPixelRatio * perspectiveScale * mix(1.15, 0.42, lifeProgress);

                    vColor = aColor;
                    vAlpha = smoothstep(0.0, 0.08, lifeProgress) * (1.0 - smoothstep(0.64, 1.0, lifeProgress));
                    vSpark = aSeed;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vAlpha;
                varying float vSpark;

                void main()
                {
                    vec2 centeredUv = (gl_PointCoord - 0.5) * 2.0;
                    float distanceToCenter = length(centeredUv);
                    if(distanceToCenter > 1.0)
                    {
                        discard;
                    }

                    float core = smoothstep(0.58, 0.0, distanceToCenter);
                    float halo = smoothstep(1.0, 0.18, distanceToCenter) * 0.95;
                    float ring = smoothstep(0.92, 0.62, distanceToCenter) * (1.0 - smoothstep(0.62, 0.34, distanceToCenter));
                    float streak = pow(max(0.0, 1.0 - abs(centeredUv.x * centeredUv.y * 5.0)), 6.0) * (0.22 + (vSpark * 0.28));
                    float alpha = (core + halo + ring + streak) * vAlpha;
                    vec3 color = mix(vColor, vec3(1.0), core * 0.34 + ring * 0.25 + streak * 0.18);

                    gl_FragColor = vec4(color, alpha);
                }
            `
        })
    }

    setPoints()
    {
        this.points = new THREE.Points(this.geometry, this.material)
        this.points.frustumCulled = false
        this.points.renderOrder = 12
        this.scene.add(this.points)
    }

    resetAttributes()
    {
        for(let index = 0; index < this.totalParticles; index++)
        {
            const offset = index * 3
            this.startPositions[offset] = OFFSCREEN_POSITION
            this.startPositions[offset + 1] = OFFSCREEN_POSITION
            this.startPositions[offset + 2] = OFFSCREEN_POSITION
            this.velocities[offset] = 0
            this.velocities[offset + 1] = 0
            this.velocities[offset + 2] = 0
            this.colors[offset] = 0
            this.colors[offset + 1] = 0
            this.colors[offset + 2] = 0
            this.spawnTimes[index] = -1000
            this.lifetimes[index] = 0
            this.sizes[index] = 0
            this.seeds[index] = 0
        }

        this.markAttributesDirty()
    }

    markAttributesDirty()
    {
        this.geometry.attributes.position.needsUpdate = true
        this.geometry.attributes.aVelocity.needsUpdate = true
        this.geometry.attributes.aColor.needsUpdate = true
        this.geometry.attributes.aSpawnTime.needsUpdate = true
        this.geometry.attributes.aLife.needsUpdate = true
        this.geometry.attributes.aSize.needsUpdate = true
        this.geometry.attributes.aSeed.needsUpdate = true
    }

    resolveTargetBounds()
    {
        if(this.targets.length === 0)
        {
            return null
        }

        let hasBounds = false
        const aggregateBounds = new THREE.Box3()

        for(const target of this.targets)
        {
            if(!(target instanceof THREE.Object3D))
            {
                continue
            }

            this.tmpBounds.setFromObject(target)
            if(this.tmpBounds.isEmpty())
            {
                continue
            }

            if(!hasBounds)
            {
                aggregateBounds.copy(this.tmpBounds)
                hasBounds = true
                continue
            }

            aggregateBounds.union(this.tmpBounds)
        }

        return hasBounds ? aggregateBounds.clone() : null
    }

    trigger({
        color = '#7ec6df'
    } = {})
    {
        const bounds = this.resolveTargetBounds()
        if(!bounds)
        {
            return
        }

        bounds.getCenter(this.tmpCenter)
        bounds.getSize(this.tmpSize)

        const radius = Math.max(
            MaterialSwapBurstEffectConstants.DEFAULT_BURST_RADIUS,
            Math.max(this.tmpSize.x, this.tmpSize.y, this.tmpSize.z) * 0.38
        )
        const centerY = bounds.min.y + (this.tmpSize.y * 0.45) + MaterialSwapBurstEffectConstants.HEIGHT_PADDING
        this.tmpCenter.y = centerY
        this.tmpColor.set(color)

        const burstStartIndex = this.nextBurstIndex * MaterialSwapBurstEffectConstants.PARTICLES_PER_BURST
        this.nextBurstIndex = (this.nextBurstIndex + 1) % MaterialSwapBurstEffectConstants.MAX_BURSTS

        for(let localIndex = 0; localIndex < MaterialSwapBurstEffectConstants.PARTICLES_PER_BURST; localIndex++)
        {
            const particleIndex = burstStartIndex + localIndex
            const positionOffset = particleIndex * 3
            const isSpark = localIndex >= Math.floor(MaterialSwapBurstEffectConstants.PARTICLES_PER_BURST * 0.66)
            const angle = Math.random() * Math.PI * 2
            const radialRatio = Math.pow(Math.random(), 0.6)
            const shellRadius = radius * (0.28 + (radialRatio * 0.72))
            const jitterRadius = radius * MaterialSwapBurstEffectConstants.POSITION_JITTER_RATIO
            const jitterX = (Math.random() - 0.5) * jitterRadius
            const jitterY = (Math.random() - 0.5) * jitterRadius * 0.35
            const jitterZ = (Math.random() - 0.5) * jitterRadius

            this.startPositions[positionOffset] = this.tmpCenter.x + (Math.cos(angle) * shellRadius * 0.42) + jitterX
            this.startPositions[positionOffset + 1] = this.tmpCenter.y + jitterY
            this.startPositions[positionOffset + 2] = this.tmpCenter.z + (Math.sin(angle) * shellRadius * 0.42) + jitterZ

            this.tmpDirection.set(Math.cos(angle), 0, Math.sin(angle)).normalize()
            this.tmpTangent.set(-this.tmpDirection.z, 0, this.tmpDirection.x)
            const swirl = (Math.random() - 0.5) * 1.3
            const lateralSpeed = THREE.MathUtils.lerp(
                MaterialSwapBurstEffectConstants.VELOCITY_MIN,
                MaterialSwapBurstEffectConstants.VELOCITY_MAX,
                Math.random()
            ) * (isSpark ? 1.24 : 0.92)
            const upwardSpeed = THREE.MathUtils.lerp(
                MaterialSwapBurstEffectConstants.UPWARD_VELOCITY_MIN,
                MaterialSwapBurstEffectConstants.UPWARD_VELOCITY_MAX,
                Math.random()
            ) * (isSpark ? 1.15 : 0.88)

            this.tmpBitangent.copy(this.upVector).multiplyScalar(upwardSpeed)
            this.tmpDirection.multiplyScalar(lateralSpeed)
            this.tmpTangent.multiplyScalar(swirl * lateralSpeed * 0.55)
            this.tmpDirection.add(this.tmpTangent).add(this.tmpBitangent)

            this.velocities[positionOffset] = this.tmpDirection.x
            this.velocities[positionOffset + 1] = this.tmpDirection.y
            this.velocities[positionOffset + 2] = this.tmpDirection.z

            this.tmpVariantColor.copy(this.tmpColor)
            this.tmpVariantColor.offsetHSL(
                (Math.random() - 0.5) * 0.08,
                THREE.MathUtils.lerp(0.02, 0.12, Math.random()),
                THREE.MathUtils.lerp(0.0, 0.18, Math.random())
            )
            if(isSpark && Math.random() < 0.28)
            {
                this.tmpVariantColor.lerp(new THREE.Color('#ffffff'), 0.42)
            }

            this.colors[positionOffset] = this.tmpVariantColor.r
            this.colors[positionOffset + 1] = this.tmpVariantColor.g
            this.colors[positionOffset + 2] = this.tmpVariantColor.b

            this.spawnTimes[particleIndex] = this.clockSeconds
            this.lifetimes[particleIndex] = THREE.MathUtils.lerp(
                MaterialSwapBurstEffectConstants.LIFETIME_MIN,
                MaterialSwapBurstEffectConstants.LIFETIME_MAX,
                Math.random()
            ) * (isSpark ? 0.88 : 1)
            this.sizes[particleIndex] = THREE.MathUtils.lerp(
                MaterialSwapBurstEffectConstants.SIZE_MIN,
                MaterialSwapBurstEffectConstants.SIZE_MAX,
                Math.random()
            ) * (isSpark ? MaterialSwapBurstEffectConstants.SPARKLE_SIZE_MULTIPLIER : 1)
            this.seeds[particleIndex] = Math.random()
        }

        this.markAttributesDirty()
    }

    update(deltaMs = this.experience.time.delta)
    {
        const deltaSeconds = Math.max(0, Math.min(0.1, Number(deltaMs || 0) * 0.001))
        this.clockSeconds += deltaSeconds

        if(this.material?.uniforms?.uTime)
        {
            this.material.uniforms.uTime.value = this.clockSeconds
            this.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2)
        }
    }

    destroy()
    {
        if(this.points)
        {
            this.scene.remove(this.points)
        }

        this.geometry?.dispose?.()
        this.material?.dispose?.()
        this.points = null
        this.geometry = null
        this.material = null
        this.targets = null
    }
}
