import * as THREE from 'three'
import Experience from '../../../Experience.js'
import * as SceneRecyclageWorldConstants from './World.constants.js'

export default class UnderwaterParticles
{
    constructor({ debugParentFolder = null } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug

        this.settings = {
            count: SceneRecyclageWorldConstants.UNDERWATER_PARTICLES_COUNT,
            areaHalf: SceneRecyclageWorldConstants.UNDERWATER_PARTICLES_AREA_HALF,
            height: SceneRecyclageWorldConstants.UNDERWATER_PARTICLES_HEIGHT,
            minY: SceneRecyclageWorldConstants.UNDERWATER_PARTICLES_MIN_Y,
            speed: SceneRecyclageWorldConstants.UNDERWATER_PARTICLES_SPEED,
            size: SceneRecyclageWorldConstants.UNDERWATER_PARTICLES_SIZE
        }

        this.positionsArray = null
        this.phasesArray = null
        this.geometry = null
        this.material = null
        this.points = null

        this.build()

        if(this.debug?.isDebugEnabled && debugParentFolder)
        {
            this.setDebug(debugParentFolder)
        }
    }

    build()
    {
        const count = this.settings.count
        this.positionsArray = new Float32Array(count * 3)
        this.phasesArray = new Float32Array(count)

        for(let i = 0; i < count; i++)
        {
            this.positionsArray[i * 3 + 0] = (Math.random() - 0.5) * this.settings.areaHalf * 2
            this.positionsArray[i * 3 + 1] = this.settings.minY + Math.random() * this.settings.height
            this.positionsArray[i * 3 + 2] = (Math.random() - 0.5) * this.settings.areaHalf * 2
            this.phasesArray[i] = Math.random()
        }

        this.geometry = new THREE.BufferGeometry()
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positionsArray, 3))
        this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(this.phasesArray, 1))

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uSize: { value: this.settings.size },
                uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }
            },
            vertexShader: `
                uniform float uTime;
                uniform float uSize;
                uniform float uPixelRatio;
                attribute float aPhase;
                varying float vAlpha;

                void main() {
                    vec3 pos = position;
                    pos.x += sin(uTime * 0.7 + aPhase * 6.28318) * 0.06;
                    pos.z += cos(uTime * 0.5 + aPhase * 3.14159) * 0.06;

                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    gl_PointSize = uSize * uPixelRatio * (1.0 / -mvPosition.z);
                    vAlpha = 0.25 + aPhase * 0.45;
                }
            `,
            fragmentShader: `
                varying float vAlpha;

                void main() {
                    float d = length(gl_PointCoord - vec2(0.5));
                    if(d > 0.5) discard;
                    float alpha = vAlpha * (1.0 - smoothstep(0.25, 0.5, d));
                    gl_FragColor = vec4(0.55, 0.85, 1.0, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        })

        this.points = new THREE.Points(this.geometry, this.material)
        this.points.name = '__recyclageUnderwaterParticles'
        this.points.frustumCulled = false
        this.scene.add(this.points)
    }

    update(deltaMs = 16.67)
    {
        if(!this.points || !this.material || !this.positionsArray)
        {
            return
        }

        const deltaSeconds = Math.max(0, deltaMs * 0.001)
        const maxY = this.settings.minY + this.settings.height
        const count = this.settings.count
        const speed = this.settings.speed

        for(let i = 0; i < count; i++)
        {
            this.positionsArray[i * 3 + 1] += speed * deltaSeconds

            if(this.positionsArray[i * 3 + 1] > maxY)
            {
                this.positionsArray[i * 3 + 1] = this.settings.minY
                this.positionsArray[i * 3 + 0] = (Math.random() - 0.5) * this.settings.areaHalf * 2
                this.positionsArray[i * 3 + 2] = (Math.random() - 0.5) * this.settings.areaHalf * 2
            }
        }

        this.geometry.attributes.position.needsUpdate = true
        this.material.uniforms.uTime.value += deltaSeconds
        this.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2)
    }

    setDebug(parentFolder)
    {
        const debug = this.debug
        const applySize = () =>
        {
            if(this.material)
            {
                this.material.uniforms.uSize.value = this.settings.size
            }
        }

        this.debugFolder = debug.addFolder('Particules underwater', {
            parent: parentFolder,
            expanded: false
        })

        debug.addBinding(this.debugFolder, this.settings, 'speed', {
            label: 'Vitesse montée',
            min: 0,
            max: 0.5,
            step: 0.001
        })

        debug.addBinding(this.debugFolder, this.settings, 'size', {
            label: 'Taille',
            min: 1,
            max: 100,
            step: 1
        })?.on?.('change', applySize)
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugFolder = null

        if(this.points)
        {
            this.scene.remove(this.points)
        }

        this.geometry?.dispose?.()
        this.material?.dispose?.()
        this.points = null
        this.geometry = null
        this.material = null
        this.positionsArray = null
        this.phasesArray = null
    }
}
