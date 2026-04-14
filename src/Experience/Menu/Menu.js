import EventEnum from '../Enum/EventEnum.js'

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

        this.hasUI = Boolean(this.bootScreen && this.btnStartWithAudio && this.btnStartMuted)

        this.handleStartWithAudio = () =>
        {
            this.launch(true)
        }

        this.handleStartMuted = () =>
        {
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

        if(!this.hasUI)
        {
            this.resolveStart({ audioEnabled: this.audioEnabled })
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
    }

    destroy()
    {
        this.isDestroyed = true
        this.stopLoadingProgressLoop()
        this.experience?.resources?.off?.(this.resourcesReadyEventName)

        this.btnStartWithAudio?.removeEventListener('click', this.handleStartWithAudio)
        this.btnStartMuted?.removeEventListener('click', this.handleStartMuted)

        if(!this.hasResolved)
        {
            this.resolveStart({ audioEnabled: this.audioEnabled })
        }
    }
}
