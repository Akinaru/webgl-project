const SOUND_DEFINITIONS = Object.freeze({
    menuClick: {
        label: 'Menu click',
        resourceKey: 'menuClickSound',
        fallbackPath: 'sounds/ui/menu-click.mp3',
        volume: 0.34,
        playbackRate: 1.02
    },
    pauseOpen: {
        label: 'Pause open',
        resourceKey: 'pauseOpenSound',
        fallbackPath: 'sounds/ui/pause-open.mp3',
        volume: 0.28,
        playbackRate: 1
    }
})

const ACTIVE_SOUNDS_LABEL_LIMIT = 8

export default class SoundManager
{
    constructor(experience)
    {
        this.experience = experience
        this.resources = this.experience?.resources ?? null
        this.debug = this.experience?.debug ?? null

        this.enabled = true
        this.context = null
        this.masterGain = null
        this.activeVoices = new Map()
        this.nextVoiceId = 1

        this.debugFolder = null
        this.debugControlsFolder = null
        this.debugRuntimeFolder = null
        this.debugState = null

        this.AudioContextClass = window.AudioContext || window.webkitAudioContext || null
    }

    init()
    {
        this.setEnabled(this.experience?.audioEnabled !== false)
        this.setDebug()
        this.syncDebugState()
    }

    update()
    {
        this.syncDebugState()
    }

    setEnabled(isEnabled)
    {
        this.enabled = Boolean(isEnabled)

        if(this.debugState)
        {
            this.debugState.enabled = this.enabled
        }

        return this.enabled
    }

    unlock()
    {
        const context = this.ensureContext()
        if(!context || context.state === 'running')
        {
            return
        }

        context.resume().catch(() => {})
    }

    playMenuClick(options = {})
    {
        return this.play('menuClick', options)
    }

    playPauseOpen(options = {})
    {
        return this.play('pauseOpen', options)
    }

    play(soundName, {
        force = false,
        volume = 1,
        playbackRate = 1
    } = {})
    {
        if(!force && !this.enabled)
        {
            return false
        }

        const definition = SOUND_DEFINITIONS[soundName]
        if(!definition)
        {
            return false
        }

        const hasPlayedBufferSound = this.playBufferSound(soundName, definition, {
            volume,
            playbackRate
        })

        if(hasPlayedBufferSound)
        {
            return true
        }

        return this.playFallbackSound(soundName, definition, {
            volume,
            playbackRate
        })
    }

    playSelectedFromDebug()
    {
        this.unlock()
        this.play(this.debugState?.selectedSound || 'menuClick', {
            force: Boolean(this.debugState?.forcePlay)
        })
    }

    playBufferSound(soundName, definition, {
        volume = 1,
        playbackRate = 1
    } = {})
    {
        const buffer = this.resources?.items?.[definition.resourceKey]
        if(!(buffer instanceof AudioBuffer))
        {
            return false
        }

        const context = this.ensureContext()
        if(!context || !this.masterGain)
        {
            return false
        }

        const sourceNode = context.createBufferSource()
        sourceNode.buffer = buffer
        sourceNode.playbackRate.value = Math.max(0.05, playbackRate * definition.playbackRate)

        const gainNode = context.createGain()
        gainNode.gain.value = Math.max(0, definition.volume * volume)

        sourceNode.connect(gainNode)
        gainNode.connect(this.masterGain)

        const voiceId = this.registerVoice({
            soundName,
            sourceType: 'buffer',
            stop: () =>
            {
                sourceNode.onended = null
                try
                {
                    sourceNode.stop(0)
                }
                catch(error)
                {
                    // Source potentiellement deja terminee.
                }
            },
            cleanup: () =>
            {
                sourceNode.onended = null
                sourceNode.disconnect()
                gainNode.disconnect()
            }
        })

        sourceNode.onended = () =>
        {
            this.removeVoice(voiceId)
        }

        try
        {
            sourceNode.start(0)
            return true
        }
        catch(error)
        {
            this.removeVoice(voiceId)
            return false
        }
    }

    playFallbackSound(soundName, definition, {
        volume = 1,
        playbackRate = 1
    } = {})
    {
        const audio = new Audio(definition.fallbackPath)
        audio.volume = Math.max(0, Math.min(1, definition.volume * volume))
        audio.playbackRate = Math.max(0.05, definition.playbackRate * playbackRate)
        audio.preload = 'auto'

        let voiceId = 0
        const onEnded = () =>
        {
            this.removeVoice(voiceId)
        }
        const onError = () =>
        {
            this.removeVoice(voiceId)
        }

        audio.addEventListener('ended', onEnded)
        audio.addEventListener('error', onError)

        voiceId = this.registerVoice({
            soundName,
            sourceType: 'htmlAudio',
            stop: () =>
            {
                audio.pause()
                try
                {
                    audio.currentTime = 0
                }
                catch(error)
                {
                    // Certains navigateurs peuvent bloquer la reassignation avant metadata.
                }
            },
            cleanup: () =>
            {
                audio.removeEventListener('ended', onEnded)
                audio.removeEventListener('error', onError)
            }
        })

        const playPromise = audio.play()
        if(playPromise && typeof playPromise.catch === 'function')
        {
            playPromise.catch(() =>
            {
                this.removeVoice(voiceId)
            })
        }

        return true
    }

    registerVoice({
        soundName,
        sourceType,
        stop,
        cleanup
    } = {})
    {
        const voiceId = this.nextVoiceId++

        this.activeVoices.set(voiceId, {
            id: voiceId,
            soundName,
            sourceType,
            stop,
            cleanup
        })

        this.syncDebugState()
        return voiceId
    }

    removeVoice(voiceId)
    {
        const voice = this.activeVoices.get(voiceId)
        if(!voice)
        {
            return false
        }

        voice.cleanup?.()
        this.activeVoices.delete(voiceId)
        this.syncDebugState()
        return true
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugState = {
            enabled: this.enabled,
            selectedSound: 'menuClick',
            forcePlay: true,
            contextState: 'not-created',
            activeVoices: 0,
            activeVoicesList: 'none'
        }

        this.debugFolder = this.debug.addFolder('🔊 Audio', { expanded: false })
        this.debugControlsFolder = this.debug.addFolder('Controls', {
            parent: this.debugFolder,
            expanded: true
        })
        this.debugRuntimeFolder = this.debug.addFolder('Runtime', {
            parent: this.debugFolder,
            expanded: false
        })

        this.debug.addBinding(this.debugControlsFolder, this.debugState, 'enabled', {
            label: 'enabled'
        }).on('change', (event) =>
        {
            this.setEnabled(event.value)
        })

        this.debug.addBinding(this.debugControlsFolder, this.debugState, 'selectedSound', {
            label: 'sound',
            options: this.getDebugSoundOptions()
        })

        this.debug.addBinding(this.debugControlsFolder, this.debugState, 'forcePlay', {
            label: 'force'
        })

        this.debug.addButton(this.debugControlsFolder, {
            title: 'Play selected',
            onClick: () =>
            {
                this.playSelectedFromDebug()
            }
        })

        this.debug.addManualBinding(this.debugRuntimeFolder, this.debugState, 'contextState', {
            label: 'context',
            readonly: true
        }, 'auto')

        this.debug.addManualBinding(this.debugRuntimeFolder, this.debugState, 'activeVoices', {
            label: 'playing',
            readonly: true
        }, 'auto')

        this.debug.addManualBinding(this.debugRuntimeFolder, this.debugState, 'activeVoicesList', {
            label: 'voices',
            readonly: true
        }, 'auto')
    }

    getDebugSoundOptions()
    {
        const options = {}

        for(const [soundName, definition] of Object.entries(SOUND_DEFINITIONS))
        {
            const label = definition.label || soundName
            options[label] = soundName
        }

        return options
    }

    syncDebugState()
    {
        if(!this.debugState)
        {
            return
        }

        this.debugState.enabled = this.enabled
        this.debugState.contextState = this.context?.state || 'not-created'
        this.debugState.activeVoices = this.activeVoices.size
        this.debugState.activeVoicesList = this.getActiveVoicesDebugLabel()
    }

    getActiveVoicesDebugLabel()
    {
        if(this.activeVoices.size === 0)
        {
            return 'none'
        }

        const voices = Array.from(this.activeVoices.values())
        const label = voices
            .slice(0, ACTIVE_SOUNDS_LABEL_LIMIT)
            .map((voice) => `#${voice.id} ${voice.soundName}`)
            .join(' | ')

        if(voices.length <= ACTIVE_SOUNDS_LABEL_LIMIT)
        {
            return label
        }

        return `${label} | +${voices.length - ACTIVE_SOUNDS_LABEL_LIMIT} more`
    }

    ensureContext()
    {
        if(this.context || !this.AudioContextClass)
        {
            return this.context
        }

        this.context = new this.AudioContextClass()
        this.masterGain = this.context.createGain()
        this.masterGain.gain.value = 1
        this.masterGain.connect(this.context.destination)
        this.syncDebugState()

        return this.context
    }

    destroy()
    {
        const voices = Array.from(this.activeVoices.values())
        for(const voice of voices)
        {
            voice.stop?.()
            voice.cleanup?.()
        }
        this.activeVoices.clear()

        this.debugControlsFolder?.dispose?.()
        this.debugRuntimeFolder?.dispose?.()
        this.debugFolder?.dispose?.()
        this.debugControlsFolder = null
        this.debugRuntimeFolder = null
        this.debugFolder = null
        this.debugState = null

        this.masterGain?.disconnect?.()
        this.masterGain = null

        if(this.context && this.context.state !== 'closed')
        {
            this.context.close().catch(() => {})
        }

        this.context = null
    }
}
