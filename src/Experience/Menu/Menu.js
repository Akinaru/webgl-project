import EventEnum from '../Enum/EventEnum.js'
import PauseMenu from './PauseMenu.js'

const AUDIO_STORAGE_KEY = 'bloom.audio.enabled'
const START_CLASS = 'is-starting'
const LOADING_CLASS = 'is-loading'
const EYE_OPENING_CLASS = 'is-eye-opening'
const FINISHED_CLASS = 'is-finished'
const START_DELAY_MS = 560
const EYE_OPENING_DELAY_MS = 1860
const FINISH_DELAY_MS = 1150

export default class Menu
{
    constructor(experience)
    {
        this.experience = experience
        this.debug = this.experience?.debug
        this.traceEnabled = Boolean(this.debug?.isDebugEnabled)
        this.hasStartedFlow = false
        this.isInitialized = false
        this.hasResolved = false
        this.isDestroyed = false
        this.loadingRafId = 0
        this.debugFolder = null
        this.debugState = null
        this.debugStateCleanup = null
        this.resourcesReadyEventName = `${EventEnum.READY}.menu`
        this.audioEnabled = true
        this.resolveStartPromise = null
        this.startPromise = new Promise((resolve) =>
        {
            this.resolveStartPromise = resolve
        })

        this.bootScreen = document.querySelector('#bootScreen')
        this.btnStartWithAudio = document.querySelector('#btnStartWithAudio')
        this.btnStartMuted = document.querySelector('#btnStartMuted')
        this.bootLoadingValue = document.querySelector('#bootLoadingValue')
        this.bootLoadingFill = document.querySelector('#bootLoadingFill')

        this.hasUI = Boolean(this.bootScreen && this.btnStartWithAudio && this.btnStartMuted)

        this.pauseMenu = new PauseMenu({
            experience: this.experience,
            isEnabled: () => this.hasResolved && !this.isDestroyed
        })

        this.handleStartWithAudio = () =>
        {
            this.focusGameCanvas({
                requestPointerLock: true
            })
            this.launch(true)
        }

        this.handleStartMuted = () =>
        {
            this.focusGameCanvas({
                requestPointerLock: true
            })
            this.launch(false)
        }

        this.setDebug()
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
        this.refreshDebugState()

        if(!this.hasUI)
        {
            this.resolveStart({ audioEnabled: this.audioEnabled })
            this.focusGameCanvas()
            return this.startPromise
        }

        this.bindEvents()
        return this.startPromise
    }

    bindEvents()
    {
        this.btnStartWithAudio.addEventListener('click', this.handleStartWithAudio)
        this.btnStartMuted.addEventListener('click', this.handleStartMuted)
    }

    resolveStart(payload)
    {
        if(this.hasResolved)
        {
            return
        }

        this.hasResolved = true
        this.refreshDebugState()
        this.resolveStartPromise?.(payload)
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugState = {
            etatPause: 'closed',
            pauseOuverte: false,
            focusDocument: false,
            focusCanvas: false,
            pointerLock: false,
            jeuLance: false,
            elementActif: 'none'
        }

        this.debugFolder = this.debug.addFolder('⏸ Menu', { expanded: true })
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'etatPause', {
            label: 'etatPause',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'pauseOuverte', {
            label: 'pauseOuverte',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'focusDocument', {
            label: 'focusDocument',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'focusCanvas', {
            label: 'focusCanvas',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'pointerLock', {
            label: 'pointerLock',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'jeuLance', {
            label: 'jeuLance',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'elementActif', {
            label: 'elementActif',
            readonly: true
        }, 'auto')

        this.debugStateCleanup = this.debug.addAutoRefresh(() =>
        {
            this.refreshDebugState()
        })

        this.refreshDebugState()
    }

    getPauseStateLabel()
    {
        const state = this.pauseMenu?.state

        if(state === PauseMenu.OPEN)
        {
            return 'open'
        }
        if(state === PauseMenu.OPENING)
        {
            return 'opening'
        }
        if(state === PauseMenu.CLOSING)
        {
            return 'closing'
        }

        return 'closed'
    }

    refreshDebugState()
    {
        if(!this.debugState)
        {
            return
        }

        const canvas = this.experience?.canvas || null
        const activeElement = document.activeElement
        let elementActif = 'none'

        if(activeElement instanceof HTMLElement)
        {
            const elementTag = activeElement.tagName.toLowerCase()
            const elementId = activeElement.id ? `#${activeElement.id}` : ''
            elementActif = `${elementTag}${elementId}`
        }

        this.debugState.etatPause = this.getPauseStateLabel()
        this.debugState.pauseOuverte = this.pauseMenu?.isOpen?.() || false
        this.debugState.focusDocument = document.hasFocus?.() ?? true
        this.debugState.focusCanvas = Boolean(canvas && activeElement === canvas)
        this.debugState.pointerLock = this.experience?.inputs?.isPointerLocked?.(canvas) || false
        this.debugState.jeuLance = this.hasResolved
        this.debugState.elementActif = elementActif
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

        this.trace('focus_game_canvas', {
            requestPointerLock,
            activeElement: this.describeElement(document.activeElement),
            hasFocus: document.hasFocus?.() ?? true,
            pointerLock: this.experience?.inputs?.isPointerLocked?.(canvas) || false
        })

        this.refreshDebugState()
    }

    readStoredAudioPreference()
    {
        try
        {
            const raw = window.localStorage.getItem(AUDIO_STORAGE_KEY)
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
        document.documentElement.dataset.audio = this.audioEnabled ? 'enabled' : 'muted'

        try
        {
            window.localStorage.setItem(AUDIO_STORAGE_KEY, this.audioEnabled ? '1' : '0')
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
        if(this.bootLoadingValue)
        {
            this.bootLoadingValue.textContent = `${clamped}%`
        }
        if(this.bootLoadingFill)
        {
            this.bootLoadingFill.style.width = `${clamped}%`
        }
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
        this.btnStartWithAudio?.setAttribute('disabled', 'disabled')
        this.btnStartMuted?.setAttribute('disabled', 'disabled')

        if(!this.hasUI)
        {
            this.resolveStart({ audioEnabled: this.audioEnabled })
            this.focusGameCanvas()
            return
        }

        this.bootScreen.classList.add(START_CLASS)
        await this.wait(START_DELAY_MS)
        this.bootScreen.classList.remove(START_CLASS)
        this.bootScreen.classList.add(LOADING_CLASS)

        this.setLoadingProgress(0)
        this.startLoadingProgressLoop()
        await this.waitForResourcesReady()
        this.stopLoadingProgressLoop()
        this.setLoadingProgress(100)

        this.resolveStart({ audioEnabled: this.audioEnabled })
        this.bootScreen.classList.remove(LOADING_CLASS)
        this.bootScreen.classList.add(EYE_OPENING_CLASS)
        await this.wait(EYE_OPENING_DELAY_MS)

        this.bootScreen.classList.add(FINISHED_CLASS)
        await this.wait(FINISH_DELAY_MS)
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
        this.experience?.resources?.off?.(this.resourcesReadyEventName)

        this.pauseMenu?.destroy?.()
        this.debugStateCleanup?.()
        this.debugStateCleanup = null
        this.debugFolder?.dispose?.()
        this.debugFolder = null
        this.debugState = null

        this.btnStartWithAudio?.removeEventListener('click', this.handleStartWithAudio)
        this.btnStartMuted?.removeEventListener('click', this.handleStartMuted)

        if(!this.hasResolved)
        {
            this.resolveStart({ audioEnabled: this.audioEnabled })
        }
    }

    describeElement(element)
    {
        if(!(element instanceof Element))
        {
            return 'none'
        }

        const tag = element.tagName.toLowerCase()
        const id = element.id ? `#${element.id}` : ''
        const className = typeof element.className === 'string' && element.className.trim() !== ''
            ? `.${element.className.trim().split(/\s+/).join('.')}`
            : ''

        return `${tag}${id}${className}`
    }

    trace(label, payload = {})
    {
        if(!this.traceEnabled)
        {
            return
        }

        console.info(`[Menu] ${label}`, payload)
    }
}
