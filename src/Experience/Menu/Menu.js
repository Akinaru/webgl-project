import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import EventEnum from '../Enum/EventEnum.js'
import PauseMenu from './PauseMenu.js'
import * as MenuConstants from './Menu.constants.js'

export default class Menu
{
    constructor(experience)
    {
        this.experience = experience
        this.debug = this.experience.debug
        this.hasStartedFlow = false
        this.isInitialized = false
        this.hasResolved = false
        this.isDestroyed = false
        this.loadingRafId = 0
        this.loadingWaveIntervalId = 0
        this.loadingWavePhase = 0
        this.resourcesReadyEventName = `${EventEnum.READY}.menu`
        this.audioEnabled = true
        this.resolveStartPromise = null
        this.startPromise = new Promise((resolve) =>
        {
        this.resolveStartPromise = resolve
        })

        this.bootScreen = document.querySelector('#bootScreen')
        this.bootHome = document.querySelector('#bootHome')
        this.bootLogoViewer = document.querySelector('#bootLogoViewer')
        this.btnStartExperience = document.querySelector('#btnStartExperience')
        this.bootAudioToggle = document.querySelector('#bootAudioToggle')
        this.bootLoadingValue = document.querySelector('#bootLoadingValue')
        this.bootLoadingFill = document.querySelector('#bootLoadingFill')
        this.transitionOverlay = document.querySelector('#sceneTransition')
        this.transitionLabel = this.transitionOverlay?.querySelector?.('[data-scene-transition-label]') ?? null
        this.transitionValue = this.transitionOverlay?.querySelector?.('[data-scene-transition-value]') ?? null
        this.transitionFill = this.transitionOverlay?.querySelector?.('[data-scene-transition-fill]') ?? null

        this.hasUI = Boolean(this.bootScreen && this.btnStartExperience && this.bootAudioToggle)
        this.bootLogoRafId = 0
        this.bootLogoScene = null
        this.bootLogoCamera = null
        this.bootLogoRenderer = null
        this.bootLogoRoot = null
        this.bootLogoDirectionalLight = null
        this.bootLogoRimLight = null
        this.bootLogoClock = new THREE.Clock()
        this.debugMenuFolder = null
        this.debugBootLogoFolder = null
        this.bootLogoSettings = {
            viewerWidth: 680,
            viewerHeight: 295,
            viewerOffsetY: -32,
            gap: 8,
            cameraX: 0,
            cameraY: 0,
            cameraZ: 6.55,
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0,
            positionX: 0,
            positionY: -1.5,
            positionZ: 0,
            scale: 2.15,
            ambientIntensity: 1.65,
            lightIntensity: 2.4,
            lightX: 3.6,
            lightY: 4.4,
            lightZ: 6.2,
            rimIntensity: 1.35,
            rimX: -4.8,
            rimY: 1.8,
            rimZ: 3.5,
            swayAmplitudeY: 0,
            swaySpeedY: 0.72,
            swayAmplitudeX: 0,
            swaySpeedX: 0.48,
            floatAmplitude: 0,
            floatSpeed: 1.1,
            lightPulseAmplitude: 0,
            lightPulseSpeed: 0.9
        }
        this.bootLogoAmbientLight = null

        this.pauseMenu = new PauseMenu({
            experience: this.experience,
            isEnabled: () => this.hasResolved && !this.isDestroyed
        })

        this.handleWindowResize = () =>
        {
            this.resizeBootLogoViewer()
        }

        this.handleStartExperience = () =>
        {
            const audioEnabled = this.bootAudioToggle?.checked !== false

            this.experience?.sound?.setEnabled?.(audioEnabled)

            if(audioEnabled)
            {
                this.experience?.sound?.unlock?.()
                this.experience?.sound?.playMenuClick?.({
                    force: true
                })
            }

            this.focusGameCanvas({
                requestPointerLock: true
            })
            this.launch(audioEnabled)
        }

        this.handleBootAudioToggleChange = (event) =>
        {
            const audioEnabled = Boolean(event?.target?.checked)
            this.setAudioPreference(audioEnabled)

            if(audioEnabled)
            {
                this.experience?.sound?.unlock?.()
            }
        }
    }

    start()
    {
        if(this.isInitialized)
        {
            return this.startPromise
        }

        this.isInitialized = true
        this.applyAudioPreference(this.readStoredAudioPreference())
        this.pauseMenu?.start?.()
        this.initBootLogoViewer()
        this.setDebug()

        if(!this.hasUI)
        {
            this.experience?.resources?.startLoading?.()
            this.resolveStart({ audioEnabled: this.audioEnabled })
            this.focusGameCanvas()
            return this.startPromise
        }

        this.bindEvents()
        return this.startPromise
    }

    bindEvents()
    {
        this.btnStartExperience.addEventListener('click', this.handleStartExperience)
        this.bootAudioToggle.addEventListener('change', this.handleBootAudioToggleChange)
        window.addEventListener('resize', this.handleWindowResize)
    }

    resolveStart(payload)
    {
        if(this.hasResolved)
        {
            return
        }

        this.hasResolved = true
        this.resolveStartPromise?.(payload)
    }

    focusGameCanvas({ requestPointerLock = false } = {})
    {
        const canvas = this.experience?.canvas
        if(!(canvas instanceof HTMLElement))
        {
            return
        }

        if(!canvas.hasAttribute('tabindex'))
        {
            canvas.setAttribute('tabindex', '0')
        }

        canvas.focus({ preventScroll: true })

        if(
            requestPointerLock &&
            !this.pauseMenu?.isOpen?.() &&
            !this.experience?.inputs?.isPointerLocked?.(canvas)
        )
        {
            this.experience?.inputs?.requestPointerLock?.(canvas)
        }
    }

    readStoredAudioPreference()
    {
        try
        {
            const raw = window.localStorage.getItem(MenuConstants.AUDIO_STORAGE_KEY)
            return raw === null ? true : raw === '1'
        }
        catch(error)
        {
            return true
        }
    }

    setAudioPreference(audioEnabled)
    {
        this.applyAudioPreference(audioEnabled)
    }

    applyAudioPreference(audioEnabled)
    {
        this.audioEnabled = Boolean(audioEnabled)
        this.experience.audioEnabled = this.audioEnabled
        this.experience?.sound?.setEnabled?.(this.audioEnabled)
        if(this.bootAudioToggle)
        {
            this.bootAudioToggle.checked = this.audioEnabled
        }
        document.documentElement.dataset.audio = this.audioEnabled ? 'enabled' : 'muted'

        try
        {
            window.localStorage.setItem(MenuConstants.AUDIO_STORAGE_KEY, this.audioEnabled ? '1' : '0')
        }
        catch(error)
        {
            // LocalStorage peut etre indisponible selon le contexte navigateur.
        }
    }

    wait(durationMs = 0)
    {
        return new Promise((resolve) =>
        {
            window.setTimeout(resolve, durationMs)
        })
    }

    setLoadingProgress(percent)
    {
        const clamped = Math.max(0, Math.min(100, Math.round(percent)))
        if(this.transitionValue)
        {
            this.transitionValue.textContent = `${clamped}%`
        }
        else if(this.bootLoadingValue)
        {
            this.bootLoadingValue.textContent = `${clamped}%`
        }
        if(this.transitionFill)
        {
            this.transitionFill.style.setProperty('--scene-transition-progress', `${clamped / 100}`)
        }
        if(this.transitionOverlay)
        {
            this.transitionOverlay.style.setProperty('--scene-transition-progress', `${clamped / 100}`)
        }
        else if(this.bootLoadingFill)
        {
            this.bootLoadingFill.style.setProperty('--scene-transition-progress', `${clamped / 100}`)
        }
    }

    showTransitionOverlay(label = 'Chargement')
    {
        this.transitionOverlay = this.transitionOverlay || document.querySelector('#sceneTransition')
        if(!this.transitionOverlay)
        {
            return
        }

        this.transitionLabel = this.transitionLabel || this.transitionOverlay.querySelector('[data-scene-transition-label]')
        this.transitionValue = this.transitionValue || this.transitionOverlay.querySelector('[data-scene-transition-value]')
        this.transitionFill = this.transitionFill || this.transitionOverlay.querySelector('[data-scene-transition-fill]')

        if(this.transitionLabel)
        {
            this.transitionLabel.textContent = label
        }

        this.transitionOverlay.classList.add('is-visible')
        this.transitionOverlay.setAttribute('aria-hidden', 'false')
        this.startLoadingWaveLoop()
    }

    hideTransitionOverlay()
    {
        if(!this.transitionOverlay)
        {
            return
        }

        this.stopLoadingWaveLoop()
        this.transitionOverlay.classList.remove('is-visible')
        this.transitionOverlay.setAttribute('aria-hidden', 'true')
    }

    buildLoadingWaveClipPath(phase = 0)
    {
        const points = ['100% 100%', '0% 100%']
        for(let x = 0; x <= 100; x += 2)
        {
            const t = ((x / 100) * Math.PI * 2) + phase
            const y = 11 + (Math.sin(t) * 2.2) + (Math.sin(t * 1.85) * 0.9)
            points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`)
        }
        return `polygon(${points.join(', ')})`
    }

    updateLoadingWave()
    {
        if(!this.transitionOverlay)
        {
            return
        }

        this.loadingWavePhase -= 0.32
        this.transitionOverlay.style.setProperty(
            '--scene-transition-wave-clip',
            this.buildLoadingWaveClipPath(this.loadingWavePhase)
        )
    }

    startLoadingWaveLoop()
    {
        if(!this.transitionOverlay || this.loadingWaveIntervalId)
        {
            return
        }

        this.loadingWavePhase = 0
        this.updateLoadingWave()
        this.loadingWaveIntervalId = window.setInterval(() =>
        {
            this.updateLoadingWave()
        }, 100)
    }

    stopLoadingWaveLoop()
    {
        if(this.loadingWaveIntervalId)
        {
            window.clearInterval(this.loadingWaveIntervalId)
            this.loadingWaveIntervalId = 0
        }

        this.transitionOverlay?.style?.removeProperty?.('--scene-transition-wave-clip')
    }

    updateLoadingProgressLoop()
    {
        const resources = this.experience?.resources
        if(!resources)
        {
            this.setLoadingProgress(0)
            this.loadingRafId = window.requestAnimationFrame(() => this.updateLoadingProgressLoop())
            return
        }

        const total = Math.max(1, Number(resources.toLoad || 0))
        const loaded = Math.max(0, Math.min(total, Number(resources.loaded || 0)))
        const ratio = resources.isReady ? 1 : loaded / total

        this.setLoadingProgress(ratio * 100)

        if(!resources.isReady)
        {
            this.loadingRafId = window.requestAnimationFrame(() => this.updateLoadingProgressLoop())
        }
    }

    startLoadingProgressLoop()
    {
        if(this.loadingRafId)
        {
            window.cancelAnimationFrame(this.loadingRafId)
            this.loadingRafId = 0
        }

        this.updateLoadingProgressLoop()
    }

    stopLoadingProgressLoop()
    {
        if(this.loadingRafId)
        {
            window.cancelAnimationFrame(this.loadingRafId)
            this.loadingRafId = 0
        }
    }

    initBootLogoViewer()
    {
        if(!this.hasUI || !(this.bootLogoViewer instanceof HTMLElement) || this.bootLogoRenderer)
        {
            return
        }

        this.bootLogoScene = new THREE.Scene()
        this.bootLogoCamera = new THREE.PerspectiveCamera(24, 1, 0.1, 100)
        this.applyBootLogoLayout()
        this.applyBootLogoCameraSettings()

        this.bootLogoAmbientLight = new THREE.AmbientLight('#ffffff', this.bootLogoSettings.ambientIntensity)
        this.bootLogoScene.add(this.bootLogoAmbientLight)

        this.bootLogoDirectionalLight = new THREE.DirectionalLight('#dff9ff', this.bootLogoSettings.lightIntensity)
        this.bootLogoScene.add(this.bootLogoDirectionalLight)

        this.bootLogoRimLight = new THREE.DirectionalLight('#66deff', this.bootLogoSettings.rimIntensity)
        this.bootLogoScene.add(this.bootLogoRimLight)
        this.applyBootLogoLightSettings()

        this.bootLogoRenderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        })
        this.bootLogoRenderer.outputColorSpace = THREE.SRGBColorSpace
        this.bootLogoRenderer.setClearColor(0x000000, 0)
        this.bootLogoRenderer.domElement.className = 'boot__logo-canvas'
        this.bootLogoViewer.appendChild(this.bootLogoRenderer.domElement)

        this.resizeBootLogoViewer()

        const loader = new GLTFLoader()
        loader.load('/models/UI/Logo.gltf', (gltf) =>
        {
            if(this.isDestroyed || !this.bootLogoScene)
            {
                return
            }

            this.bootLogoRoot = gltf.scene

            this.bootLogoRoot.traverse((child) =>
            {
                if(!child.isMesh)
                {
                    return
                }

                child.castShadow = false
                child.receiveShadow = false

                if(child.material?.isMeshStandardMaterial || child.material?.isMeshPhysicalMaterial)
                {
                    child.material.roughness = Math.min(child.material.roughness ?? 0.2, 0.22)
                    child.material.metalness = Math.max(child.material.metalness ?? 0, 0.08)
                    child.material.envMapIntensity = 1.05
                }
            })

            this.bootLogoScene.add(this.bootLogoRoot)
            this.applyBootLogoRootSettings()
        })

        this.startBootLogoLoop()
    }

    setDebug()
    {
        if(!this.debug?.active || this.debugMenuFolder)
        {
            return
        }

        this.debugMenuFolder = this.debug.addFolder('🪟 Menu', { expanded: false })
        this.debugBootLogoFolder = this.debug.addFolder('Logo de demarrage', {
            parent: this.debugMenuFolder,
            expanded: false
        })

        const refreshLayout = () =>
        {
            this.applyBootLogoLayout()
            this.resizeBootLogoViewer()
        }

        const refreshCamera = () =>
        {
            this.applyBootLogoCameraSettings()
            this.updateBootLogoViewer()
        }

        const refreshRoot = () =>
        {
            this.applyBootLogoRootSettings()
            this.updateBootLogoViewer()
        }

        const refreshLights = () =>
        {
            this.applyBootLogoLightSettings()
            this.updateBootLogoViewer()
        }

        this.debug.addBinding(this.debugBootLogoFolder, this.bootLogoSettings, 'viewerWidth', {
            label: 'largeur',
            min: 320,
            max: 1200,
            step: 1
        })?.on('change', refreshLayout)
        this.debug.addBinding(this.debugBootLogoFolder, this.bootLogoSettings, 'viewerHeight', {
            label: 'hauteur',
            min: 100,
            max: 420,
            step: 1
        })?.on('change', refreshLayout)
        this.debug.addBinding(this.debugBootLogoFolder, this.bootLogoSettings, 'viewerOffsetY', {
            label: 'Decalage Y',
            min: -220,
            max: 220,
            step: 1
        })?.on('change', refreshLayout)
        this.debug.addBinding(this.debugBootLogoFolder, this.bootLogoSettings, 'gap', {
            label: 'Ecart',
            min: 0,
            max: 48,
            step: 1
        })?.on('change', refreshLayout)
        this.debug.addBinding(this.debugBootLogoFolder, this.bootLogoSettings, 'cameraY', {
            label: 'Position Y camera',
            min: -3,
            max: 3,
            step: 0.01
        })?.on('change', refreshCamera)
        this.debug.addBinding(this.debugBootLogoFolder, this.bootLogoSettings, 'cameraZ', {
            label: 'Distance camera',
            min: 2,
            max: 16,
            step: 0.01
        })?.on('change', refreshCamera)
        this.debug.addBinding(this.debugBootLogoFolder, this.bootLogoSettings, 'scale', {
            label: 'Echelle du logo',
            min: 0.2,
            max: 6,
            step: 0.01
        })?.on('change', refreshRoot)
        this.debug.addBinding(this.debugBootLogoFolder, this.bootLogoSettings, 'positionY', {
            label: 'Position Y du logo',
            min: -3,
            max: 3,
            step: 0.01
        })?.on('change', refreshRoot)
        this.debug.addBinding(this.debugBootLogoFolder, this.bootLogoSettings, 'rotationX', {
            label: 'Rotation X du logo',
            min: -Math.PI,
            max: Math.PI,
            step: 0.01
        })?.on('change', refreshRoot)
        this.debug.addBinding(this.debugBootLogoFolder, this.bootLogoSettings, 'rotationY', {
            label: 'Rotation Y du logo',
            min: -Math.PI,
            max: Math.PI,
            step: 0.01
        })?.on('change', refreshRoot)
        this.debug.addBinding(this.debugBootLogoFolder, this.bootLogoSettings, 'lightIntensity', {
            label: 'Intensite lumiere principale',
            min: 0,
            max: 10,
            step: 0.01
        })?.on('change', refreshLights)
        this.debug.addBinding(this.debugBootLogoFolder, this.bootLogoSettings, 'rimIntensity', {
            label: 'Intensite lumiere de contour',
            min: 0,
            max: 10,
            step: 0.01
        })?.on('change', refreshLights)
    }

    applyBootLogoLayout()
    {
        if(this.bootHome instanceof HTMLElement)
        {
            this.bootHome.style.setProperty('--boot-logo-gap', `${this.bootLogoSettings.gap}px`)
        }

        if(!(this.bootLogoViewer instanceof HTMLElement))
        {
            return
        }

        this.bootLogoViewer.style.setProperty('--boot-logo-width', `${this.bootLogoSettings.viewerWidth}px`)
        this.bootLogoViewer.style.setProperty('--boot-logo-height', `${this.bootLogoSettings.viewerHeight}px`)
        this.bootLogoViewer.style.setProperty('--boot-logo-offset-y', `${this.bootLogoSettings.viewerOffsetY}px`)
    }

    applyBootLogoCameraSettings()
    {
        if(!this.bootLogoCamera)
        {
            return
        }

        this.bootLogoCamera.position.set(
            this.bootLogoSettings.cameraX,
            this.bootLogoSettings.cameraY,
            this.bootLogoSettings.cameraZ
        )
        this.bootLogoCamera.lookAt(0, 0, 0)
    }

    applyBootLogoRootSettings()
    {
        if(!this.bootLogoRoot)
        {
            return
        }

        this.bootLogoRoot.position.set(
            this.bootLogoSettings.positionX,
            this.bootLogoSettings.positionY,
            this.bootLogoSettings.positionZ
        )
        this.bootLogoRoot.rotation.set(
            this.bootLogoSettings.rotationX,
            this.bootLogoSettings.rotationY,
            this.bootLogoSettings.rotationZ
        )
        this.bootLogoRoot.scale.setScalar(this.bootLogoSettings.scale)
    }

    applyBootLogoLightSettings()
    {
        if(this.bootLogoAmbientLight)
        {
            this.bootLogoAmbientLight.intensity = this.bootLogoSettings.ambientIntensity
        }

        if(this.bootLogoDirectionalLight)
        {
            this.bootLogoDirectionalLight.intensity = this.bootLogoSettings.lightIntensity
            this.bootLogoDirectionalLight.position.set(
                this.bootLogoSettings.lightX,
                this.bootLogoSettings.lightY,
                this.bootLogoSettings.lightZ
            )
        }

        if(this.bootLogoRimLight)
        {
            this.bootLogoRimLight.intensity = this.bootLogoSettings.rimIntensity
            this.bootLogoRimLight.position.set(
                this.bootLogoSettings.rimX,
                this.bootLogoSettings.rimY,
                this.bootLogoSettings.rimZ
            )
        }
    }

    resizeBootLogoViewer()
    {
        if(
            !(this.bootLogoViewer instanceof HTMLElement) ||
            !this.bootLogoRenderer ||
            !this.bootLogoCamera
        )
        {
            return
        }

        const width = Math.max(1, this.bootLogoViewer.clientWidth || 640)
        const height = Math.max(1, this.bootLogoViewer.clientHeight || 240)
        this.bootLogoCamera.aspect = width / height
        this.bootLogoCamera.updateProjectionMatrix()
        this.bootLogoRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        this.bootLogoRenderer.setSize(width, height, false)
    }

    startBootLogoLoop()
    {
        if(this.bootLogoRafId || !this.bootLogoRenderer || !this.bootLogoScene || !this.bootLogoCamera)
        {
            return
        }

        const tick = () =>
        {
            this.bootLogoRafId = window.requestAnimationFrame(tick)
            this.updateBootLogoViewer()
        }

        this.bootLogoRafId = window.requestAnimationFrame(tick)
        this.updateBootLogoViewer()
    }

    stopBootLogoLoop()
    {
        if(!this.bootLogoRafId)
        {
            return
        }

        window.cancelAnimationFrame(this.bootLogoRafId)
        this.bootLogoRafId = 0
    }

    updateBootLogoViewer()
    {
        if(!this.bootLogoRenderer || !this.bootLogoScene || !this.bootLogoCamera)
        {
            return
        }

        const elapsed = this.bootLogoClock.getElapsedTime()
        if(this.bootLogoRoot)
        {
            this.bootLogoRoot.rotation.set(
                this.bootLogoSettings.rotationX + (Math.cos(elapsed * this.bootLogoSettings.swaySpeedX) * this.bootLogoSettings.swayAmplitudeX),
                this.bootLogoSettings.rotationY + (Math.sin(elapsed * this.bootLogoSettings.swaySpeedY) * this.bootLogoSettings.swayAmplitudeY),
                this.bootLogoSettings.rotationZ
            )
            this.bootLogoRoot.position.set(
                this.bootLogoSettings.positionX,
                this.bootLogoSettings.positionY + (Math.sin(elapsed * this.bootLogoSettings.floatSpeed) * this.bootLogoSettings.floatAmplitude),
                this.bootLogoSettings.positionZ
            )
        }

        if(this.bootLogoDirectionalLight)
        {
            this.bootLogoDirectionalLight.intensity = this.bootLogoSettings.lightIntensity + (Math.sin(elapsed * this.bootLogoSettings.lightPulseSpeed) * this.bootLogoSettings.lightPulseAmplitude)
        }

        this.bootLogoRenderer.render(this.bootLogoScene, this.bootLogoCamera)
    }

    waitForResourcesReady()
    {
        return new Promise((resolve) =>
        {
            const resources = this.experience?.resources
            if(!resources || resources.isReady)
            {
                resolve()
                return
            }

            resources.on(this.resourcesReadyEventName, () =>
            {
                resources.off(this.resourcesReadyEventName)
                resolve()
            })
        })
    }

    async launch(audioEnabled)
    {
        if(this.hasStartedFlow || this.isDestroyed)
        {
            return
        }

        this.hasStartedFlow = true
        this.setAudioPreference(audioEnabled)
        this.btnStartExperience?.setAttribute('disabled', 'disabled')
        this.bootAudioToggle?.setAttribute('disabled', 'disabled')

        if(!this.hasUI)
        {
            this.resolveStart({ audioEnabled: this.audioEnabled })
            this.focusGameCanvas()
            return
        }

        this.bootScreen.classList.add(MenuConstants.START_CLASS)
        await this.wait(MenuConstants.START_DELAY_MS)
        this.bootScreen.classList.remove(MenuConstants.START_CLASS)
        this.bootScreen.classList.add(MenuConstants.LOADING_CLASS)
        this.showTransitionOverlay('Chargement')

        this.experience?.resources?.startLoading?.()
        this.setLoadingProgress(0)
        this.startLoadingProgressLoop()
        await this.waitForResourcesReady()
        this.stopLoadingProgressLoop()
        this.setLoadingProgress(100)
        await this.wait(160)
        this.hideTransitionOverlay()

        this.resolveStart({ audioEnabled: this.audioEnabled })

        if(window.location.hash.includes('debug'))
        {
            this.bootScreen.remove()
            this.focusGameCanvas()
            return
        }

        this.bootScreen.classList.remove(MenuConstants.LOADING_CLASS)
        this.bootScreen.classList.add(MenuConstants.EYE_OPENING_CLASS)
        await this.wait(MenuConstants.EYE_OPENING_DELAY_MS)

        this.bootScreen.classList.add(MenuConstants.FINISHED_CLASS)
        await this.wait(MenuConstants.FINISH_DELAY_MS)
        this.bootScreen.remove()
        this.focusGameCanvas()
    }

    isPauseOpen()
    {
        return this.pauseMenu?.isOpen?.() || false
    }

    destroy()
    {
        this.isDestroyed = true
        this.stopLoadingProgressLoop()
        this.stopLoadingWaveLoop()
        this.stopBootLogoLoop()
        this.experience?.resources?.off?.(this.resourcesReadyEventName)

        this.pauseMenu?.destroy?.()

        this.btnStartExperience?.removeEventListener('click', this.handleStartExperience)
        this.bootAudioToggle?.removeEventListener('change', this.handleBootAudioToggleChange)
        window.removeEventListener('resize', this.handleWindowResize)

        if(this.bootLogoRoot)
        {
            this.bootLogoRoot.traverse((child) =>
            {
                child.geometry?.dispose?.()

                if(Array.isArray(child.material))
                {
                    child.material.forEach((material) => material?.dispose?.())
                }
                else
                {
                    child.material?.dispose?.()
                }
            })
            this.bootLogoRoot = null
        }

        this.bootLogoScene = null
        this.bootLogoCamera = null
        this.bootLogoAmbientLight = null
        this.bootLogoDirectionalLight = null
        this.bootLogoRimLight = null

        if(this.bootLogoRenderer)
        {
            this.bootLogoRenderer.dispose()
            this.bootLogoRenderer.domElement?.remove?.()
            this.bootLogoRenderer = null
        }

        if(!this.hasResolved)
        {
            this.resolveStart({ audioEnabled: this.audioEnabled })
        }
    }
}
