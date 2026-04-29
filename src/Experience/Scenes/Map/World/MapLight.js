import * as THREE from 'three'
import Experience from '../../../Experience.js'

const SHADOW_MAP_SIZE_OPTIONS = {
    '512': 512,
    '1024': 1024,
    '2048': 2048,
    '4096': 4096
}

const SUN_VISUAL_CORE_SCALE = 0.06
const SUN_VISUAL_HALO_SCALE = 0.24
const SUN_VISUAL_MIN_CORE_SIZE = 1.8
const SUN_VISUAL_MIN_HALO_SIZE = 8
const SUN_VISUAL_HALO_OPACITY = 0.85

export default class MapLight
{
    constructor({
        environment = null,
        getFocusPosition = null,
        debugParentFolder = null
    } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug
        this.environment = environment
        this.debugParentFolder = debugParentFolder
        this.getFocusPosition = typeof getFocusPosition === 'function'
            ? getFocusPosition
            : null

        this.state = {
            useCycle: false,
            cycleSpeed: 0.035,
            distance: 52,
            phi: 0.383,
            theta: 0.068,
            phiAmplitude: 0.581,
            thetaAmplitude: 1.161,

            ambientIntensity: 0.42,
            hemiIntensity: 0.45,
            sunIntensity: 1.435,

            castShadow: true,
            shadowAmplitude: 56.3,
            shadowNear: 9.9,
            shadowDepth: 118.2,
            shadowBias: -0.0005,
            shadowNormalBias: 0.03,
            shadowRadius: 1.96,
            shadowMapSize: 2048,

            showDirectionHelper: false,
            showShadowCameraHelper: false
        }

        this.ambientColor = new THREE.Color('#ffffff')
        this.skyColor = new THREE.Color('#55daff')
        this.groundColor = new THREE.Color('#d6fdff')
        this.sunColor = new THREE.Color('#fff3ac')

        this.spherical = new THREE.Spherical(
            this.state.distance,
            this.state.phi,
            this.state.theta
        )
        this.direction = new THREE.Vector3()
        this.focusPosition = new THREE.Vector3(0, 0, 0)
        this.tempFocusPosition = new THREE.Vector3()
        this.debugBindings = []

        this.setLights()
        this.setSunVisual()
        this.updateCoordinates()
        this.updateFocusPosition()
        this.sunLight.position.setFromSpherical(this.spherical).add(this.focusPosition)
        this.sunTarget.position.copy(this.focusPosition)
        this.updateSunVisual()
        this.updateShadow()
        this.setHelpers()
        this.applyHelpersVisibility()
        this.setDebug()
    }

    setLights()
    {
        this.ambientLight = new THREE.AmbientLight(this.ambientColor, this.state.ambientIntensity)
        this.scene.add(this.ambientLight)

        this.hemiLight = new THREE.HemisphereLight(
            this.skyColor,
            this.groundColor,
            this.state.hemiIntensity
        )
        this.scene.add(this.hemiLight)

        this.sunLight = new THREE.DirectionalLight(this.sunColor, this.state.sunIntensity)
        this.sunLight.castShadow = this.state.castShadow
        this.scene.add(this.sunLight)

        this.sunTarget = new THREE.Object3D()
        this.sunTarget.name = '__mapSunTarget'
        this.scene.add(this.sunTarget)
        this.sunLight.target = this.sunTarget
    }

    setSunVisual()
    {
        this.sunVisual = new THREE.Group()
        this.sunVisual.name = '__mapSunVisual'

        this.sunCoreGeometry = new THREE.SphereGeometry(1, 24, 24)
        this.sunCoreMaterial = new THREE.MeshBasicMaterial({
            color: this.sunColor,
            toneMapped: false
        })
        this.sunCore = new THREE.Mesh(this.sunCoreGeometry, this.sunCoreMaterial)
        this.sunVisual.add(this.sunCore)

        this.sunHaloTexture = this.createSunHaloTexture()
        this.sunHaloMaterial = new THREE.SpriteMaterial({
            map: this.sunHaloTexture,
            color: this.sunColor,
            transparent: true,
            opacity: SUN_VISUAL_HALO_OPACITY,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false
        })
        this.sunHalo = new THREE.Sprite(this.sunHaloMaterial)
        this.sunVisual.add(this.sunHalo)

        this.scene.add(this.sunVisual)
        this.updateSunVisualAppearance()
    }

    createSunHaloTexture()
    {
        const canvas = document.createElement('canvas')
        canvas.width = 128
        canvas.height = 128

        const context = canvas.getContext('2d')
        if(!context)
        {
            const fallbackTexture = new THREE.Texture(canvas)
            fallbackTexture.needsUpdate = true
            return fallbackTexture
        }

        const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64)
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
        gradient.addColorStop(0.2, 'rgba(255, 244, 214, 0.95)')
        gradient.addColorStop(0.45, 'rgba(255, 226, 154, 0.5)')
        gradient.addColorStop(1, 'rgba(255, 214, 120, 0)')

        context.fillStyle = gradient
        context.fillRect(0, 0, canvas.width, canvas.height)

        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        return texture
    }

    setHelpers()
    {
        this.directionHelper = new THREE.Group()
        this.directionHelper.visible = false

        const directionPoint = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.25, 1),
            new THREE.MeshBasicMaterial({
                color: '#ffffff',
                wireframe: true
            })
        )
        this.directionHelper.add(directionPoint)

        const directionLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, 5)
            ]),
            new THREE.LineBasicMaterial({
                color: '#ffffff'
            })
        )
        this.directionHelper.add(directionLine)
        this.scene.add(this.directionHelper)

        this.shadowHelper = new THREE.CameraHelper(this.sunLight.shadow.camera)
        this.shadowHelper.visible = false
        this.scene.add(this.shadowHelper)
    }

    applyLightColorsAndIntensity()
    {
        this.ambientLight.intensity = this.state.ambientIntensity
        this.hemiLight.intensity = this.state.hemiIntensity
        this.sunLight.intensity = this.state.sunIntensity

        this.ambientLight.color.copy(this.ambientColor)
        this.hemiLight.color.copy(this.skyColor)
        this.hemiLight.groundColor.copy(this.groundColor)
        this.sunLight.color.copy(this.sunColor)
        this.updateSunVisualAppearance()
    }

    updateSunVisualAppearance()
    {
        if(this.sunCoreMaterial)
        {
            this.sunCoreMaterial.color.copy(this.sunColor)
        }

        if(this.sunHaloMaterial)
        {
            this.sunHaloMaterial.color.copy(this.sunColor)
            this.sunHaloMaterial.opacity = SUN_VISUAL_HALO_OPACITY
        }
    }

    sanitizeShadowState()
    {
        this.state.castShadow = Boolean(this.state.castShadow)
        this.state.shadowAmplitude = Math.max(1, Number(this.state.shadowAmplitude) || 58)
        this.state.shadowNear = Math.max(0.1, Number(this.state.shadowNear) || 1)
        this.state.shadowDepth = Math.max(1, Number(this.state.shadowDepth) || 160)
        this.state.shadowRadius = Math.max(0, Number(this.state.shadowRadius) || 0)
        this.state.shadowNormalBias = Number.isFinite(this.state.shadowNormalBias)
            ? this.state.shadowNormalBias
            : 0
        this.state.shadowBias = Number.isFinite(this.state.shadowBias)
            ? this.state.shadowBias
            : 0
        this.state.distance = Math.max(2, Number(this.state.distance) || 52)

        const shadowMapSize = Number(this.state.shadowMapSize)
        this.state.shadowMapSize = Object.values(SHADOW_MAP_SIZE_OPTIONS).includes(shadowMapSize)
            ? shadowMapSize
            : 2048
    }

    updateShadow()
    {
        this.sanitizeShadowState()

        this.sunLight.castShadow = this.state.castShadow
        this.sunLight.shadow.camera.top = this.state.shadowAmplitude
        this.sunLight.shadow.camera.right = this.state.shadowAmplitude
        this.sunLight.shadow.camera.bottom = -this.state.shadowAmplitude
        this.sunLight.shadow.camera.left = -this.state.shadowAmplitude
        this.sunLight.shadow.camera.near = this.state.shadowNear
        this.sunLight.shadow.camera.far = this.state.shadowNear + this.state.shadowDepth
        this.sunLight.shadow.bias = this.state.shadowBias
        this.sunLight.shadow.normalBias = this.state.shadowNormalBias
        this.sunLight.shadow.radius = this.state.shadowRadius
        this.sunLight.shadow.mapSize.set(this.state.shadowMapSize, this.state.shadowMapSize)
        this.sunLight.shadow.camera.updateProjectionMatrix()
        this.sunLight.shadow.needsUpdate = true

        this.applyHelpersVisibility()
        this.updateHelpers()
    }

    updateCoordinates()
    {
        if(this.state.useCycle)
        {
            const elapsedSeconds = this.experience.time.elapsed * 0.001
            const progress = elapsedSeconds * this.state.cycleSpeed
            this.spherical.theta = this.state.theta + (Math.sin(-progress * Math.PI * 2) * this.state.thetaAmplitude)
            this.spherical.phi = this.state.phi + ((Math.cos(-progress * Math.PI * 2) * 0.5) * this.state.phiAmplitude)
        }
        else
        {
            this.spherical.theta = this.state.theta
            this.spherical.phi = this.state.phi
        }

        this.spherical.radius = this.state.distance
        this.spherical.phi = THREE.MathUtils.clamp(this.spherical.phi, 0.01, Math.PI - 0.01)
        this.direction.setFromSpherical(this.spherical).normalize()
    }

    updateFocusPosition()
    {
        const providedFocus = this.getFocusPosition?.()
        if(providedFocus && Number.isFinite(providedFocus.x) && Number.isFinite(providedFocus.y) && Number.isFinite(providedFocus.z))
        {
            this.tempFocusPosition.copy(providedFocus)
            this.focusPosition.copy(this.tempFocusPosition)
            return
        }

        this.focusPosition.set(0, 0, 0)
    }

    updateHelpers()
    {
        if(this.directionHelper?.visible)
        {
            this.directionHelper.position.copy(this.direction).multiplyScalar(5).add(this.focusPosition)
            this.directionHelper.lookAt(this.focusPosition)
        }

        this.shadowHelper?.update?.()
    }

    applyHelpersVisibility()
    {
        if(this.directionHelper)
        {
            this.directionHelper.visible = Boolean(this.state.showDirectionHelper)
        }

        if(this.shadowHelper)
        {
            this.shadowHelper.visible = Boolean(this.state.showShadowCameraHelper)
        }
    }

    refreshDebugBindings()
    {
        for(const binding of this.debugBindings)
        {
            binding?.refresh?.()
        }
    }

    registerDebugBinding(binding)
    {
        if(binding && typeof binding.refresh === 'function')
        {
            this.debugBindings.push(binding)
        }
        return binding
    }

    update()
    {
        this.applyLightColorsAndIntensity()
        this.updateFocusPosition()
        this.updateCoordinates()

        this.sunLight.position.setFromSpherical(this.spherical).add(this.focusPosition)
        this.sunTarget.position.copy(this.focusPosition)
        this.sunTarget.updateMatrixWorld(true)
        this.updateSunVisual()

        this.updateHelpers()
    }

    updateSunVisual()
    {
        if(!this.sunVisual)
        {
            return
        }

        const coreScale = Math.max(SUN_VISUAL_MIN_CORE_SIZE, this.state.distance * SUN_VISUAL_CORE_SCALE)
        const haloScale = Math.max(SUN_VISUAL_MIN_HALO_SIZE, this.state.distance * SUN_VISUAL_HALO_SCALE)

        this.sunVisual.position.copy(this.sunLight.position)
        this.sunCore.scale.setScalar(coreScale)
        this.sunHalo.scale.setScalar(haloScale)
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('☀️ Light', {
            parent: this.debugParentFolder || this.debug.ui,
            expanded: false
        })
        this.sunFolder = this.debug.addFolder('Sun', {
            parent: this.debugFolder,
            expanded: false
        })
        this.shadowFolder = this.debug.addFolder('Shadows', {
            parent: this.debugFolder,
            expanded: false
        })
        this.helpersFolder = this.debug.addFolder('Helpers', {
            parent: this.debugFolder,
            expanded: false
        })

        this.registerDebugBinding(this.debug.addBinding(this.debugFolder, this.state, 'useCycle', {
            label: 'useCycle'
        }))
        this.registerDebugBinding(this.debug.addBinding(this.debugFolder, this.state, 'cycleSpeed', {
            label: 'cycleSpeed',
            min: 0,
            max: 0.5,
            step: 0.001
        }))
        this.registerDebugBinding(this.debug.addBinding(this.debugFolder, this.state, 'distance', {
            label: 'distance',
            min: 2,
            max: 300,
            step: 0.1
        }))

        this.registerDebugBinding(this.debug.addBinding(this.sunFolder, this.state, 'phi', {
            label: 'phi',
            min: 0.01,
            max: Math.PI - 0.01,
            step: 0.001
        }))
        this.registerDebugBinding(this.debug.addBinding(this.sunFolder, this.state, 'theta', {
            label: 'theta',
            min: -Math.PI,
            max: Math.PI,
            step: 0.001
        }))
        this.registerDebugBinding(this.debug.addBinding(this.sunFolder, this.state, 'phiAmplitude', {
            label: 'phiAmplitude',
            min: 0,
            max: Math.PI,
            step: 0.001
        }))
        this.registerDebugBinding(this.debug.addBinding(this.sunFolder, this.state, 'thetaAmplitude', {
            label: 'thetaAmplitude',
            min: 0,
            max: Math.PI * 2,
            step: 0.001
        }))
        this.registerDebugBinding(this.debug.addBinding(this.sunFolder, this.state, 'sunIntensity', {
            label: 'sunIntensity',
            min: 0,
            max: 6,
            step: 0.001
        }))

        this.registerDebugBinding(this.debug.addBinding(this.debugFolder, this.state, 'ambientIntensity', {
            label: 'ambient',
            min: 0,
            max: 3,
            step: 0.001
        }))
        this.registerDebugBinding(this.debug.addBinding(this.debugFolder, this.state, 'hemiIntensity', {
            label: 'hemi',
            min: 0,
            max: 3,
            step: 0.001
        }))

        this.registerDebugBinding(this.debug.addColorBinding(this.debugFolder, this, 'ambientColor', { label: 'ambientColor' }))
        this.registerDebugBinding(this.debug.addColorBinding(this.debugFolder, this, 'skyColor', { label: 'skyColor' }))
        this.registerDebugBinding(this.debug.addColorBinding(this.debugFolder, this, 'groundColor', { label: 'groundColor' }))
        this.registerDebugBinding(this.debug.addColorBinding(this.debugFolder, this, 'sunColor', { label: 'sunColor' }))
        if(this.environment?.backgroundColor)
        {
            this.registerDebugBinding(this.debug.addColorBinding(this.debugFolder, this.environment, 'backgroundColor', {
                label: 'skyBgColor'
            }))
        }

        this.registerDebugBinding(this.debug.addBinding(this.shadowFolder, this.state, 'castShadow', {
            label: 'enabled'
        }).on('change', () =>
        {
            this.updateShadow()
        }))
        this.registerDebugBinding(this.debug.addBinding(this.shadowFolder, this.state, 'shadowAmplitude', {
            label: 'amplitude',
            min: 1,
            max: 300,
            step: 0.1
        }).on('change', () =>
        {
            this.updateShadow()
        }))
        this.registerDebugBinding(this.debug.addBinding(this.shadowFolder, this.state, 'shadowNear', {
            label: 'near',
            min: 0.1,
            max: 50,
            step: 0.1
        }).on('change', () =>
        {
            this.updateShadow()
        }))
        this.registerDebugBinding(this.debug.addBinding(this.shadowFolder, this.state, 'shadowDepth', {
            label: 'depth',
            min: 1,
            max: 600,
            step: 0.1
        }).on('change', () =>
        {
            this.updateShadow()
        }))
        this.registerDebugBinding(this.debug.addBinding(this.shadowFolder, this.state, 'shadowMapSize', {
            label: 'mapSize',
            options: SHADOW_MAP_SIZE_OPTIONS
        }).on('change', () =>
        {
            this.updateShadow()
        }))
        this.registerDebugBinding(this.debug.addBinding(this.shadowFolder, this.state, 'shadowBias', {
            label: 'bias',
            min: -0.02,
            max: 0.02,
            step: 0.00001
        }).on('change', () =>
        {
            this.updateShadow()
        }))
        this.registerDebugBinding(this.debug.addBinding(this.shadowFolder, this.state, 'shadowNormalBias', {
            label: 'normalBias',
            min: -0.3,
            max: 0.3,
            step: 0.0001
        }).on('change', () =>
        {
            this.updateShadow()
        }))
        this.registerDebugBinding(this.debug.addBinding(this.shadowFolder, this.state, 'shadowRadius', {
            label: 'radius',
            min: 0,
            max: 10,
            step: 0.01
        }).on('change', () =>
        {
            this.updateShadow()
        }))

        this.registerDebugBinding(this.debug.addBinding(this.helpersFolder, this.state, 'showDirectionHelper', {
            label: 'directionHelper'
        }).on('change', () =>
        {
            this.applyHelpersVisibility()
        }))
        this.registerDebugBinding(this.debug.addBinding(this.helpersFolder, this.state, 'showShadowCameraHelper', {
            label: 'shadowHelper'
        }).on('change', () =>
        {
            this.applyHelpersVisibility()
        }))
    }

    destroy()
    {
        this.debugFolder?.dispose?.()

        if(this.directionHelper)
        {
            this.scene.remove(this.directionHelper)
            this.directionHelper.traverse((child) =>
            {
                child.geometry?.dispose?.()
                child.material?.dispose?.()
            })
            this.directionHelper = null
        }

        if(this.shadowHelper)
        {
            this.scene.remove(this.shadowHelper)
            this.shadowHelper.dispose?.()
            this.shadowHelper = null
        }

        if(this.ambientLight)
        {
            this.scene.remove(this.ambientLight)
            this.ambientLight = null
        }

        if(this.hemiLight)
        {
            this.scene.remove(this.hemiLight)
            this.hemiLight = null
        }

        if(this.sunLight)
        {
            this.scene.remove(this.sunLight)
            this.sunLight = null
        }

        if(this.sunVisual)
        {
            this.scene.remove(this.sunVisual)
            this.sunCoreGeometry?.dispose?.()
            this.sunCoreMaterial?.dispose?.()
            this.sunHaloMaterial?.dispose?.()
            this.sunHaloTexture?.dispose?.()
            this.sunVisual = null
            this.sunCore = null
            this.sunHalo = null
            this.sunCoreGeometry = null
            this.sunCoreMaterial = null
            this.sunHaloMaterial = null
            this.sunHaloTexture = null
        }

        if(this.sunTarget)
        {
            this.scene.remove(this.sunTarget)
            this.sunTarget = null
        }

        this.debugBindings.length = 0
    }
}
