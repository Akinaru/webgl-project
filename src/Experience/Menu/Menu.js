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
        this.hasStartedFlow = false
        this.isInitialized = false
        this.hasResolved = false
        this.isDestroyed = false
        this.loadingRafId = 0
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
        this.transitionOverlay = document.querySelector('#sceneTransition')
        this.transitionLabel = this.transitionOverlay?.querySelector?.('[data-scene-transition-label]') ?? null
        this.transitionValue = this.transitionOverlay?.querySelector?.('[data-scene-transition-value]') ?? null
        this.transitionFill = this.transitionOverlay?.querySelector?.('[data-scene-transition-fill]') ?? null

        this.hasUI = Boolean(this.bootScreen && this.btnStartWithAudio && this.btnStartMuted)

        this.pauseMenu = new PauseMenu({
            experience: this.experience,
            isEnabled: () => this.hasResolved && !this.isDestroyed
        })

        this.handleStartWithAudio = () =>
        {
            this.experience?.sound?.setEnabled?.(true)
            this.experience?.sound?.unlock?.()
            this.experience?.sound?.playMenuClick?.({
                force: true
            })
            this.focusGameCanvas({
                requestPointerLock: true
            })
            this.launch(true)
        }

        this.handleStartMuted = () =>
        {
            this.experience?.sound?.setEnabled?.(false)
            this.focusGameCanvas({
                requestPointerLock: true
            })
            this.launch(false)
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
        this.experience?.sound?.setEnabled?.(this.audioEnabled)
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
            this.transitionFill.style.width = `${clamped}%`
        }
        else if(this.bootLoadingFill)
        {
            this.bootLoadingFill.style.width = `${clamped}%`
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
    }

    hideTransitionOverlay()
    {
        if(!this.transitionOverlay)
        {
            return
        }

        this.transitionOverlay.classList.remove('is-visible')
        this.transitionOverlay.setAttribute('aria-hidden', 'true')
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

        this.btnStartWithAudio?.removeEventListener('click', this.handleStartWithAudio)
        this.btnStartMuted?.removeEventListener('click', this.handleStartMuted)

        if(!this.hasResolved)
        {
            this.resolveStart({ audioEnabled: this.audioEnabled })
        }
    }
}
