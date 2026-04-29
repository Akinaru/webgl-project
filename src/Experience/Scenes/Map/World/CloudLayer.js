import * as THREE from 'three'
import Experience from '../../../Experience.js'
import {
    cloudsFragmentShader,
    cloudsVertexShader
} from './Shaders/Clouds/cloudsShader.js'

const DEFAULT_SUN_FALLBACK_POSITION = new THREE.Vector3(0, 140, 0)

export default class CloudLayer
{
    constructor({
        light = null,
        getFocusPosition = null
    } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug
        this.light = light
        this.getFocusPosition = typeof getFocusPosition === 'function'
            ? getFocusPosition
            : null

        this.state = {
            enabled: true,
            followPlayer: true,
            followStrength: 0.804,
            altitude: 24.8,
            size: 1386,
            windSpeed: 0.04,
            windAngle: 0.956,
            coverage: 0.446,
            softness: 0.014,
            density: 1.337,
            noiseScale: 0.02,
            detailScale: 3.391,
            detailStrength: 0.935,
            warpScale: 0,
            warpStrength: 1.402,
            opacity: 0.891,
            edgeFade: 0.257,
            sunGlowStrength: 0.995
        }

        this.cloudColor = new THREE.Color('#fffefd')
        this.shadowColor = new THREE.Color('#d9e3ef')

        this.focusPosition = new THREE.Vector3()
        this.anchorPosition = new THREE.Vector3()
        this.sunPosition = new THREE.Vector3()
        this.windDirection = new THREE.Vector2()

        this.setMesh()
        this.syncWindDirection()
        this.syncMaterialState()
        this.updateFocusPosition()
        this.updateAnchorPosition()
        this.updateSunState()
        this.setDebug()
    }

    setMesh()
    {
        this.geometry = new THREE.PlaneGeometry(1, 1, 1, 1)
        this.material = new THREE.ShaderMaterial({
            vertexShader: cloudsVertexShader,
            fragmentShader: cloudsFragmentShader,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: {
                uTime: { value: 0 },
                uCoverage: { value: this.state.coverage },
                uSoftness: { value: this.state.softness },
                uDensity: { value: this.state.density },
                uOpacity: { value: this.state.opacity },
                uNoiseScale: { value: this.state.noiseScale },
                uDetailScale: { value: this.state.detailScale },
                uDetailStrength: { value: this.state.detailStrength },
                uWarpScale: { value: this.state.warpScale },
                uWarpStrength: { value: this.state.warpStrength },
                uWindSpeed: { value: this.state.windSpeed },
                uWindDirection: { value: new THREE.Vector2(1, 0) },
                uEdgeFade: { value: this.state.edgeFade },
                uSunGlowStrength: { value: this.state.sunGlowStrength },
                uCloudColor: { value: this.cloudColor.clone() },
                uShadowColor: { value: this.shadowColor.clone() },
                uSunColor: { value: new THREE.Color('#fff1d8') },
                uSunPosition: { value: DEFAULT_SUN_FALLBACK_POSITION.clone() }
            }
        })

        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.mesh.name = '__mapCloudLayer'
        this.mesh.frustumCulled = false
        this.mesh.rotation.x = -Math.PI * 0.5
        this.mesh.renderOrder = 5
        this.scene.add(this.mesh)
    }

    syncWindDirection()
    {
        this.windDirection.set(
            Math.cos(this.state.windAngle),
            Math.sin(this.state.windAngle)
        )
    }

    syncMaterialState()
    {
        if(!this.material)
        {
            return
        }

        this.material.uniforms.uCoverage.value = this.state.coverage
        this.material.uniforms.uSoftness.value = this.state.softness
        this.material.uniforms.uDensity.value = this.state.density
        this.material.uniforms.uOpacity.value = this.state.opacity
        this.material.uniforms.uNoiseScale.value = this.state.noiseScale
        this.material.uniforms.uDetailScale.value = this.state.detailScale
        this.material.uniforms.uDetailStrength.value = this.state.detailStrength
        this.material.uniforms.uWarpScale.value = this.state.warpScale
        this.material.uniforms.uWarpStrength.value = this.state.warpStrength
        this.material.uniforms.uWindSpeed.value = this.state.windSpeed
        this.material.uniforms.uEdgeFade.value = this.state.edgeFade
        this.material.uniforms.uSunGlowStrength.value = this.state.sunGlowStrength
        this.material.uniforms.uWindDirection.value.copy(this.windDirection)
        this.material.uniforms.uCloudColor.value.copy(this.cloudColor)
        this.material.uniforms.uShadowColor.value.copy(this.shadowColor)

        if(this.mesh)
        {
            this.mesh.visible = Boolean(this.state.enabled)
            this.mesh.scale.set(this.state.size, this.state.size, 1)
            this.mesh.position.y = this.state.altitude
        }
    }

    updateFocusPosition()
    {
        const providedFocus = this.getFocusPosition?.()
        if(providedFocus && Number.isFinite(providedFocus.x) && Number.isFinite(providedFocus.y) && Number.isFinite(providedFocus.z))
        {
            this.focusPosition.copy(providedFocus)
            return
        }

        this.focusPosition.set(0, 0, 0)
    }

    updateAnchorPosition()
    {
        if(!this.mesh)
        {
            return
        }

        if(this.state.followPlayer)
        {
            this.anchorPosition.set(
                this.focusPosition.x * this.state.followStrength,
                this.state.altitude,
                this.focusPosition.z * this.state.followStrength
            )
        }
        else
        {
            this.anchorPosition.set(0, this.state.altitude, 0)
        }

        this.mesh.position.copy(this.anchorPosition)
    }

    updateSunState()
    {
        if(this.light?.sunLight?.position)
        {
            this.sunPosition.copy(this.light.sunLight.position)
        }
        else
        {
            this.sunPosition.copy(DEFAULT_SUN_FALLBACK_POSITION)
        }

        this.material.uniforms.uSunPosition.value.copy(this.sunPosition)

        if(this.light?.sunColor instanceof THREE.Color)
        {
            this.material.uniforms.uSunColor.value.copy(this.light.sunColor)
        }
    }

    update()
    {
        this.syncWindDirection()
        this.syncMaterialState()
        this.updateFocusPosition()
        this.updateAnchorPosition()
        this.updateSunState()

        this.material.uniforms.uTime.value = this.experience.time.elapsed * 0.001
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('☁️ Clouds', { expanded: false })
        this.placementFolder = this.debug.addFolder('Placement', {
            parent: this.debugFolder,
            expanded: false
        })
        this.motionFolder = this.debug.addFolder('Motion', {
            parent: this.debugFolder,
            expanded: false
        })
        this.shapeFolder = this.debug.addFolder('Shape', {
            parent: this.debugFolder,
            expanded: false
        })
        this.colorFolder = this.debug.addFolder('Color', {
            parent: this.debugFolder,
            expanded: false
        })

        this.debug.addBinding(this.debugFolder, this.state, 'enabled', {
            label: 'enabled'
        }).on('change', () =>
        {
            this.syncMaterialState()
        })

        this.debug.addBinding(this.placementFolder, this.state, 'followPlayer', {
            label: 'followPlayer'
        }).on('change', () =>
        {
            this.updateAnchorPosition()
        })
        this.debug.addBinding(this.placementFolder, this.state, 'followStrength', {
            label: 'followStrength',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.updateAnchorPosition()
        })
        this.debug.addBinding(this.placementFolder, this.state, 'altitude', {
            label: 'altitude',
            min: 10,
            max: 180,
            step: 0.1
        }).on('change', () =>
        {
            this.syncMaterialState()
            this.updateAnchorPosition()
        })
        this.debug.addBinding(this.placementFolder, this.state, 'size', {
            label: 'size',
            min: 120,
            max: 1400,
            step: 1
        }).on('change', () =>
        {
            this.syncMaterialState()
        })

        this.debug.addBinding(this.motionFolder, this.state, 'windSpeed', {
            label: 'windSpeed',
            min: 0,
            max: 3,
            step: 0.001
        }).on('change', () =>
        {
            this.syncMaterialState()
        })
        this.debug.addBinding(this.motionFolder, this.state, 'windAngle', {
            label: 'windAngle',
            min: -Math.PI,
            max: Math.PI,
            step: 0.001
        }).on('change', () =>
        {
            this.syncWindDirection()
            this.syncMaterialState()
        })
        this.debug.addBinding(this.motionFolder, this.state, 'warpScale', {
            label: 'warpScale',
            min: 0,
            max: 4,
            step: 0.001
        }).on('change', () =>
        {
            this.syncMaterialState()
        })
        this.debug.addBinding(this.motionFolder, this.state, 'warpStrength', {
            label: 'warpStrength',
            min: 0,
            max: 3,
            step: 0.001
        }).on('change', () =>
        {
            this.syncMaterialState()
        })

        this.debug.addBinding(this.shapeFolder, this.state, 'coverage', {
            label: 'coverage',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.syncMaterialState()
        })
        this.debug.addBinding(this.shapeFolder, this.state, 'softness', {
            label: 'softness',
            min: 0.001,
            max: 0.4,
            step: 0.001
        }).on('change', () =>
        {
            this.syncMaterialState()
        })
        this.debug.addBinding(this.shapeFolder, this.state, 'density', {
            label: 'density',
            min: 0,
            max: 1.5,
            step: 0.001
        }).on('change', () =>
        {
            this.syncMaterialState()
        })
        this.debug.addBinding(this.shapeFolder, this.state, 'noiseScale', {
            label: 'noiseScale',
            min: 0.0001,
            max: 0.02,
            step: 0.0001
        }).on('change', () =>
        {
            this.syncMaterialState()
        })
        this.debug.addBinding(this.shapeFolder, this.state, 'detailScale', {
            label: 'detailScale',
            min: 0,
            max: 8,
            step: 0.001
        }).on('change', () =>
        {
            this.syncMaterialState()
        })
        this.debug.addBinding(this.shapeFolder, this.state, 'detailStrength', {
            label: 'detailStrength',
            min: 0,
            max: 2,
            step: 0.001
        }).on('change', () =>
        {
            this.syncMaterialState()
        })
        this.debug.addBinding(this.shapeFolder, this.state, 'edgeFade', {
            label: 'edgeFade',
            min: 0.02,
            max: 0.8,
            step: 0.001
        }).on('change', () =>
        {
            this.syncMaterialState()
        })

        this.debug.addBinding(this.colorFolder, this.state, 'opacity', {
            label: 'opacity',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.syncMaterialState()
        })
        this.debug.addBinding(this.colorFolder, this.state, 'sunGlowStrength', {
            label: 'sunGlow',
            min: 0,
            max: 1.5,
            step: 0.001
        }).on('change', () =>
        {
            this.syncMaterialState()
        })
        this.debug.addColorBinding(this.colorFolder, this, 'cloudColor', {
            label: 'cloudColor'
        }).on('change', () =>
        {
            this.syncMaterialState()
        })
        this.debug.addColorBinding(this.colorFolder, this, 'shadowColor', {
            label: 'shadowColor'
        }).on('change', () =>
        {
            this.syncMaterialState()
        })
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugFolder = null
        this.placementFolder = null
        this.motionFolder = null
        this.shapeFolder = null
        this.colorFolder = null

        if(this.mesh)
        {
            this.scene.remove(this.mesh)
            this.geometry?.dispose?.()
            this.material?.dispose?.()
            this.mesh = null
            this.geometry = null
            this.material = null
        }
    }
}
