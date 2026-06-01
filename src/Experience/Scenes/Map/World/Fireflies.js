import * as THREE from 'three'
import Experience from '../../../Experience.js'
import * as FirefliesConstants from './Fireflies.constants.js'
import {
    firefliesFragmentShader,
    firefliesVertexShader
} from './Shaders/Fireflies/firefliesShader.js'

export default class MapFireflies
{
    constructor({
        getFocusPosition = null,
        getFog = null
    } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug
        this.getFocusPosition = typeof getFocusPosition === 'function' ? getFocusPosition : null
        this.getFog = typeof getFog === 'function' ? getFog : null
        this.settings = {
            enabled: true,
            count: FirefliesConstants.MAP_FIREFLIES_DEFAULT_COUNT,
            size: FirefliesConstants.MAP_FIREFLIES_DEFAULT_SIZE,
            radiusMultiplier: FirefliesConstants.MAP_FIREFLIES_RADIUS_MULTIPLIER,
            yOffset: FirefliesConstants.MAP_FIREFLIES_Y_OFFSET,
            heightMin: FirefliesConstants.MAP_FIREFLIES_HEIGHT_MIN,
            heightMax: FirefliesConstants.MAP_FIREFLIES_HEIGHT_MAX,
            respawnMargin: FirefliesConstants.MAP_FIREFLIES_RESPAWN_MARGIN,
            timeScale: FirefliesConstants.MAP_FIREFLIES_TIME_SCALE,
            scaleTimeBoost: FirefliesConstants.MAP_FIREFLIES_SCALE_TIME_BOOST,
            swayXAmplitude: FirefliesConstants.MAP_FIREFLIES_SWAY_X_AMPLITUDE,
            swayZAmplitude: FirefliesConstants.MAP_FIREFLIES_SWAY_Z_AMPLITUDE,
            swayYAmplitude: FirefliesConstants.MAP_FIREFLIES_SWAY_Y_AMPLITUDE,
            swayXSpeed: FirefliesConstants.MAP_FIREFLIES_SWAY_X_SPEED,
            swayZSpeed: FirefliesConstants.MAP_FIREFLIES_SWAY_Z_SPEED,
            swayYSpeed: FirefliesConstants.MAP_FIREFLIES_SWAY_Y_SPEED,
            haloIntensity: FirefliesConstants.MAP_FIREFLIES_HALO_INTENSITY,
            color: new THREE.Color(FirefliesConstants.MAP_FIREFLIES_COLOR)
        }
        this.debugState = {
            radius: 0,
            activeCount: 0
        }
        this.uniforms = {
            uTime: { value: 0 },
            uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
            uSize: { value: this.settings.size },
            uColor: { value: this.settings.color.clone() },
            uFogNear: { value: 5 },
            uFogFar: { value: 35 },
            uTimeScale: { value: this.settings.timeScale },
            uScaleTimeBoost: { value: this.settings.scaleTimeBoost },
            uSwayXAmplitude: { value: this.settings.swayXAmplitude },
            uSwayZAmplitude: { value: this.settings.swayZAmplitude },
            uSwayYAmplitude: { value: this.settings.swayYAmplitude },
            uSwayXSpeed: { value: this.settings.swayXSpeed },
            uSwayZSpeed: { value: this.settings.swayZSpeed },
            uSwayYSpeed: { value: this.settings.swayYSpeed },
            uHaloIntensity: { value: this.settings.haloIntensity }
        }
        this.focusPosition = new THREE.Vector3()
        this.lastBuildRadius = 0
        this.positionsArray = null
        this.scalesArray = null
        this.phasesArray = null
        this.tmpRespawnVector = new THREE.Vector3()
        this.geometry = null
        this.material = null
        this.points = null

        this.setUp()
    }

    setUp()
    {
        this.geometry = new THREE.BufferGeometry()
        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: firefliesVertexShader,
            fragmentShader: firefliesFragmentShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        })

        this.points = new THREE.Points(this.geometry, this.material)
        this.points.name = '__mapFireflies'
        this.points.frustumCulled = false
        this.scene.add(this.points)

        this.rebuild()
        this.syncFogUniforms()
    }

    getTargetRadius()
    {
        const fogFar = this.getFog?.()?.settings?.far ?? 35
        return THREE.MathUtils.clamp(
            fogFar * this.settings.radiusMultiplier,
            FirefliesConstants.MAP_FIREFLIES_RADIUS_MIN,
            FirefliesConstants.MAP_FIREFLIES_RADIUS_MAX
        )
    }

    rebuild()
    {
        const count = THREE.MathUtils.clamp(
            Math.round(this.settings.count),
            FirefliesConstants.MAP_FIREFLIES_MIN_COUNT,
            FirefliesConstants.MAP_FIREFLIES_MAX_COUNT
        )
        const radius = this.getTargetRadius()
        this.positionsArray = new Float32Array(count * 3)
        this.scalesArray = new Float32Array(count)
        this.phasesArray = new Float32Array(count)

        const focusPosition = this.getFocusPosition?.()
        if(focusPosition)
        {
            this.focusPosition.copy(focusPosition)
        }

        for(let index = 0; index < count; index++)
        {
            this.respawnFirefly(index, radius)
            this.scalesArray[index] = THREE.MathUtils.lerp(
                FirefliesConstants.MAP_FIREFLIES_SCALE_MIN,
                FirefliesConstants.MAP_FIREFLIES_SCALE_MAX,
                Math.random()
            )
            this.phasesArray[index] = Math.random()
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positionsArray, 3))
        this.geometry.setAttribute('aScale', new THREE.BufferAttribute(this.scalesArray, 1))
        this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(this.phasesArray, 1))
        this.lastBuildRadius = radius
        this.debugState.radius = radius
        this.debugState.activeCount = count
    }

    respawnFirefly(index, radius, { edgeOnly = false } = {})
    {
        const minDistance = edgeOnly
            ? radius * Math.max(0.15, 1 - this.settings.respawnMargin)
            : 0
        const angle = Math.random() * Math.PI * 2
        const distance = edgeOnly
            ? THREE.MathUtils.lerp(minDistance, radius, Math.random())
            : Math.sqrt(Math.random()) * radius

        this.tmpRespawnVector.set(
            this.focusPosition.x + (Math.cos(angle) * distance),
            this.focusPosition.y + this.settings.yOffset + THREE.MathUtils.lerp(this.settings.heightMin, this.settings.heightMax, Math.random()),
            this.focusPosition.z + (Math.sin(angle) * distance)
        )

        this.positionsArray[index * 3 + 0] = this.tmpRespawnVector.x
        this.positionsArray[index * 3 + 1] = this.tmpRespawnVector.y
        this.positionsArray[index * 3 + 2] = this.tmpRespawnVector.z
    }

    syncFogUniforms()
    {
        const fogSettings = this.getFog?.()?.settings
        this.uniforms.uFogNear.value = fogSettings?.near ?? 5
        this.uniforms.uFogFar.value = fogSettings?.far ?? 35
    }

    setDebug({ parentFolder = null } = {})
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder?.dispose?.()

        this.debugFolder = this.debug.addFolder('Lucioles', {
            parent: parentFolder || this.debug.ui,
            expanded: false
        })

        const rebuild = () => this.rebuild()
        const runtimeFolder = this.debug.addFolder('Runtime', {
            parent: this.debugFolder,
            expanded: false
        })
        const spawnFolder = this.debug.addFolder('Spawn', {
            parent: this.debugFolder,
            expanded: false
        })
        const movementFolder = this.debug.addFolder('Movement', {
            parent: this.debugFolder,
            expanded: false
        })
        const renderFolder = this.debug.addFolder('Render', {
            parent: this.debugFolder,
            expanded: false
        })

        this.debug.addBinding(runtimeFolder, this.settings, 'enabled', {
            label: 'Actives'
        })
        this.debug.addBinding(runtimeFolder, this.debugState, 'activeCount', {
            label: 'Nombre actif',
            readonly: true
        })
        this.debug.addBinding(runtimeFolder, this.debugState, 'radius', {
            label: 'Rayon actuel',
            readonly: true,
            format: (value) => Number(value || 0).toFixed(3)
        })
        this.debug.addButton(runtimeFolder, {
            title: 'Rebuild',
            onClick: rebuild
        })

        this.debug.addBinding(spawnFolder, this.settings, 'count', {
            label: 'Nombre',
            min: FirefliesConstants.MAP_FIREFLIES_MIN_COUNT,
            max: FirefliesConstants.MAP_FIREFLIES_MAX_COUNT,
            step: 1
        })?.on?.('change', rebuild)
        this.debug.addBinding(spawnFolder, this.settings, 'radiusMultiplier', {
            label: 'Rayon fog',
            min: 0.2,
            max: 1,
            step: 0.01
        })?.on?.('change', rebuild)
        this.debug.addBinding(spawnFolder, this.settings, 'yOffset', {
            label: 'Offset Y',
            min: -4,
            max: 4,
            step: 0.01
        })?.on?.('change', rebuild)
        this.debug.addBinding(spawnFolder, this.settings, 'heightMin', {
            label: 'Hauteur min',
            min: 0,
            max: 6,
            step: 0.01
        })?.on?.('change', rebuild)
        this.debug.addBinding(spawnFolder, this.settings, 'heightMax', {
            label: 'Hauteur max',
            min: 0.1,
            max: 8,
            step: 0.01
        })?.on?.('change', rebuild)
        this.debug.addBinding(spawnFolder, this.settings, 'respawnMargin', {
            label: 'Marge respawn',
            min: 0.05,
            max: 0.45,
            step: 0.01
        })

        const syncMotion = () =>
        {
            this.uniforms.uTimeScale.value = this.settings.timeScale
            this.uniforms.uScaleTimeBoost.value = this.settings.scaleTimeBoost
            this.uniforms.uSwayXAmplitude.value = this.settings.swayXAmplitude
            this.uniforms.uSwayZAmplitude.value = this.settings.swayZAmplitude
            this.uniforms.uSwayYAmplitude.value = this.settings.swayYAmplitude
            this.uniforms.uSwayXSpeed.value = this.settings.swayXSpeed
            this.uniforms.uSwayZSpeed.value = this.settings.swayZSpeed
            this.uniforms.uSwayYSpeed.value = this.settings.swayYSpeed
        }

        this.debug.addBinding(movementFolder, this.settings, 'timeScale', {
            label: 'Time scale',
            min: 0,
            max: 2,
            step: 0.01
        })?.on?.('change', syncMotion)
        this.debug.addBinding(movementFolder, this.settings, 'scaleTimeBoost', {
            label: 'Scale boost',
            min: 0,
            max: 2,
            step: 0.01
        })?.on?.('change', syncMotion)
        this.debug.addBinding(movementFolder, this.settings, 'swayXAmplitude', {
            label: 'Sway X amp',
            min: 0,
            max: 1,
            step: 0.01
        })?.on?.('change', syncMotion)
        this.debug.addBinding(movementFolder, this.settings, 'swayZAmplitude', {
            label: 'Sway Z amp',
            min: 0,
            max: 1,
            step: 0.01
        })?.on?.('change', syncMotion)
        this.debug.addBinding(movementFolder, this.settings, 'swayYAmplitude', {
            label: 'Sway Y amp',
            min: 0,
            max: 1,
            step: 0.01
        })?.on?.('change', syncMotion)
        this.debug.addBinding(movementFolder, this.settings, 'swayXSpeed', {
            label: 'Sway X speed',
            min: 0,
            max: 4,
            step: 0.01
        })?.on?.('change', syncMotion)
        this.debug.addBinding(movementFolder, this.settings, 'swayZSpeed', {
            label: 'Sway Z speed',
            min: 0,
            max: 4,
            step: 0.01
        })?.on?.('change', syncMotion)
        this.debug.addBinding(movementFolder, this.settings, 'swayYSpeed', {
            label: 'Sway Y speed',
            min: 0,
            max: 4,
            step: 0.01
        })?.on?.('change', syncMotion)

        this.debug.addBinding(renderFolder, this.settings, 'size', {
            label: 'Taille',
            min: FirefliesConstants.MAP_FIREFLIES_MIN_SIZE,
            max: FirefliesConstants.MAP_FIREFLIES_MAX_SIZE,
            step: 1
        })
        this.debug.addBinding(renderFolder, this.settings, 'haloIntensity', {
            label: 'Halo',
            min: 0,
            max: 2,
            step: 0.01
        })?.on?.('change', () =>
        {
            this.uniforms.uHaloIntensity.value = this.settings.haloIntensity
        })
        this.debug.addThreeColorBinding(renderFolder, this.settings, 'color', {
            label: 'Couleur'
        })
    }

    update(deltaMs = this.experience.time.delta)
    {
        if(!this.points || !this.material)
        {
            return
        }

        this.points.visible = this.settings.enabled === true
        if(this.settings.enabled !== true)
        {
            return
        }

        const targetPosition = this.getFocusPosition?.()
        if(targetPosition)
        {
            this.focusPosition.copy(targetPosition)
        }

        this.uniforms.uTime.value += Math.max(0, deltaMs || 0) * 0.001
        this.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2)
        this.uniforms.uSize.value = this.settings.size
        this.uniforms.uColor.value.copy(this.settings.color)
        this.uniforms.uHaloIntensity.value = this.settings.haloIntensity
        this.syncFogUniforms()

        const targetRadius = this.getTargetRadius()
        if(Math.abs(targetRadius - this.lastBuildRadius) >= FirefliesConstants.MAP_FIREFLIES_REBUILD_RADIUS_THRESHOLD)
        {
            this.rebuild()
            return
        }

        const positionAttribute = this.geometry?.getAttribute?.('position')
        if(positionAttribute && targetPosition)
        {
            const maxDistance = targetRadius
            const maxDistanceSq = maxDistance * maxDistance
            let hasRespawned = false

            for(let index = 0; index < this.positionsArray.length / 3; index++)
            {
                const dx = this.positionsArray[index * 3 + 0] - this.focusPosition.x
                const dz = this.positionsArray[index * 3 + 2] - this.focusPosition.z
                const distanceSq = (dx * dx) + (dz * dz)
                if(distanceSq <= maxDistanceSq)
                {
                    continue
                }

                this.respawnFirefly(index, targetRadius, { edgeOnly: true })
                hasRespawned = true
            }

            if(hasRespawned)
            {
                positionAttribute.needsUpdate = true
                this.geometry.computeBoundingSphere()
            }
        }
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.scene.remove(this.points)
        this.geometry?.dispose?.()
        this.material?.dispose?.()
        this.points = null
        this.geometry = null
        this.material = null
    }
}
