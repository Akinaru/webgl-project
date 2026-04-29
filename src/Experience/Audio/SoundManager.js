import soundDefinitionsJson from './soundDefinitions.json'
import { getBushSoundUrls } from './bushSoundBank.js'

const SOUND_DEFINITIONS = Object.freeze(soundDefinitionsJson)

const ACTIVE_SOUNDS_LABEL_LIMIT = 8
const NOW_PLAYING_LINE_LIMIT = 6

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
        this.debugDefinitionsFolder = null
        this.debugState = null
        this.soundDefinitionTuning = {}

        this.AudioContextClass = window.AudioContext || window.webkitAudioContext || null
        this.bushSoundUrls = getBushSoundUrls()
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

    playRandomBush({
        force = false,
        volume = 1,
        playbackRate = 1,
        channel = 'bush'
    } = {})
    {
        if(!Array.isArray(this.bushSoundUrls) || this.bushSoundUrls.length === 0)
        {
            return false
        }

        const randomIndex = Math.floor(Math.random() * this.bushSoundUrls.length)
        const fallbackPath = this.bushSoundUrls[randomIndex]
        if(typeof fallbackPath !== 'string' || fallbackPath.length === 0)
        {
            return false
        }

        if(fallbackPath.endsWith('/bush-1.mp3') && SOUND_DEFINITIONS.bush1)
        {
            return this.play('bush1', {
                force,
                volume,
                playbackRate,
                channel
            })
        }

        return this.playSoundDefinition({
            soundName: `bush:${randomIndex}`,
            definition: {
                resourceKey: '',
                fallbackPath,
                volume: 1,
                playbackRate: 1,
                channel
            },
            force,
            volume,
            playbackRate
        })
    }

    play(soundName, {
        force = false,
        volume = 1,
        playbackRate = 1,
        channel = null
    } = {})
    {
        const definition = SOUND_DEFINITIONS[soundName]
        if(!definition)
        {
            return false
        }

        return this.playSoundDefinition({
            soundName,
            definition: {
                ...definition,
                channel: channel || definition.channel || 'default'
            },
            force,
            volume,
            playbackRate
        })
    }

    playDialogue(definition, options = {})
    {
        this.stopDialogue()

        const normalizedDefinition = this.normalizeDialogueDefinition(definition)
        if(!normalizedDefinition)
        {
            return false
        }

        return this.playSoundDefinition({
            soundName: normalizedDefinition.soundName,
            definition: {
                ...normalizedDefinition,
                channel: 'dialogue'
            },
            force: options.force ?? false,
            volume: options.volume ?? 1,
            playbackRate: options.playbackRate ?? 1
        })
    }

    stopDialogue()
    {
        return this.stopChannel('dialogue')
    }

    playSelectedFromDebug()
    {
        this.unlock()
        this.play(this.debugState?.selectedSound || 'menuClick', {
            force: Boolean(this.debugState?.forcePlay)
        })
    }

    playSoundDefinition({
        soundName,
        definition,
        force = false,
        volume = 1,
        playbackRate = 1
    } = {})
    {
        if(!force && !this.enabled)
        {
            return false
        }

        const resolvedDefinition = this.applySoundDefinitionOverrides(soundName, definition)

        const hasPlayedBufferSound = this.playBufferSound(soundName, resolvedDefinition, {
            volume,
            playbackRate
        })

        if(hasPlayedBufferSound)
        {
            this.markSoundPlayed(soundName)
            return true
        }

        const hasPlayedFallbackSound = this.playFallbackSound(soundName, resolvedDefinition, {
            volume,
            playbackRate
        })
        if(hasPlayedFallbackSound)
        {
            this.markSoundPlayed(soundName)
        }

        return hasPlayedFallbackSound
    }

    applySoundDefinitionOverrides(soundName, definition)
    {
        if(!definition || typeof definition !== 'object')
        {
            return definition
        }

        const tuning = this.soundDefinitionTuning?.[soundName]
        if(!tuning)
        {
            return definition
        }

        return {
            ...definition,
            volume: Number.isFinite(tuning.volume) ? tuning.volume : definition.volume,
            playbackRate: Number.isFinite(tuning.playbackRate) ? tuning.playbackRate : definition.playbackRate
        }
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
        sourceNode.loop = Boolean(definition.loop)
        sourceNode.playbackRate.value = Math.max(0.05, playbackRate * definition.playbackRate)

        const gainNode = context.createGain()
        const targetGain = Math.max(0, definition.volume * volume)
        const fadeInMs = Number.isFinite(definition.fadeInMs) ? Math.max(0, definition.fadeInMs) : 0
        const now = context.currentTime
        gainNode.gain.cancelScheduledValues(now)
        gainNode.gain.setValueAtTime(fadeInMs > 0 ? 0 : targetGain, now)
        if(fadeInMs > 0)
        {
            gainNode.gain.linearRampToValueAtTime(targetGain, now + (fadeInMs / 1000))
        }

        sourceNode.connect(gainNode)
        gainNode.connect(this.masterGain)

        let stopAlreadyScheduled = false

        const voiceId = this.registerVoice({
            soundName,
            channel: definition.channel || 'default',
            sourceType: 'buffer',
            defaultFadeOutMs: Number.isFinite(definition.fadeOutMs) ? Math.max(0, definition.fadeOutMs) : 0,
            stop: ({ fadeOutMs = 0 } = {}) =>
            {
                if(stopAlreadyScheduled)
                {
                    return true
                }

                const safeFadeOutMs = Number.isFinite(fadeOutMs) ? Math.max(0, fadeOutMs) : 0
                if(safeFadeOutMs > 0)
                {
                    stopAlreadyScheduled = true
                    const currentTime = context.currentTime
                    const currentGain = gainNode.gain.value
                    gainNode.gain.cancelScheduledValues(currentTime)
                    gainNode.gain.setValueAtTime(currentGain, currentTime)
                    gainNode.gain.linearRampToValueAtTime(0, currentTime + (safeFadeOutMs / 1000))
                    try
                    {
                        sourceNode.stop(currentTime + (safeFadeOutMs / 1000) + 0.02)
                    }
                    catch(error)
                    {
                        // Source potentiellement deja terminee.
                    }
                    return true
                }

                sourceNode.onended = null
                try
                {
                    sourceNode.stop(0)
                }
                catch(error)
                {
                    // Source potentiellement deja terminee.
                }
                return false
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
        audio.loop = Boolean(definition.loop)

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
            channel: definition.channel || 'default',
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
        channel = 'default',
        sourceType,
        defaultFadeOutMs = 0,
        stop,
        cleanup
    } = {})
    {
        const voiceId = this.nextVoiceId++

        this.activeVoices.set(voiceId, {
            id: voiceId,
            soundName,
            channel,
            sourceType,
            defaultFadeOutMs,
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

    stopChannel(channel)
    {
        if(typeof channel !== 'string' || channel.trim() === '')
        {
            return 0
        }

        const voices = Array.from(this.activeVoices.values())
        let stoppedCount = 0

        for(const voice of voices)
        {
            if(voice.channel !== channel)
            {
                continue
            }

            const fadeOutMs = Number.isFinite(voice.defaultFadeOutMs) ? voice.defaultFadeOutMs : 0
            const handledAsync = Boolean(voice.stop?.({ fadeOutMs }))
            if(!handledAsync)
            {
                this.removeVoice(voice.id)
            }
            stoppedCount += 1
        }

        return stoppedCount
    }

    normalizeDialogueDefinition(definition)
    {
        if(typeof definition === 'string')
        {
            const presetDefinition = SOUND_DEFINITIONS[definition]
            if(!presetDefinition)
            {
                return null
            }

            return {
                soundName: definition,
                ...presetDefinition
            }
        }

        if(!definition || typeof definition !== 'object')
        {
            return null
        }

        if(typeof definition.key === 'string' && definition.key.trim() !== '')
        {
            const presetDefinition = SOUND_DEFINITIONS[definition.key]
            if(presetDefinition)
            {
                return {
                    soundName: definition.key,
                    ...presetDefinition,
                    ...definition
                }
            }
        }

        const fallbackPath = definition.fallbackPath || definition.path || ''
        const resourceKey = definition.resourceKey || ''

        if(resourceKey === '' && fallbackPath === '')
        {
            return null
        }

        return {
            soundName: definition.name || definition.key || resourceKey || fallbackPath,
            resourceKey,
            fallbackPath,
            volume: typeof definition.volume === 'number' ? definition.volume : 1,
            playbackRate: typeof definition.playbackRate === 'number' ? definition.playbackRate : 1,
            loop: Boolean(definition.loop)
        }
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
            activeVoicesList: 'none',
            nowPlayingLine1: 'none',
            nowPlayingLine2: '',
            nowPlayingLine3: '',
            nowPlayingLine4: '',
            nowPlayingLine5: '',
            nowPlayingLine6: '',
            lastPlayed: 'none'
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
        this.debugDefinitionsFolder = this.debug.addFolder('Definitions', {
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

        this.populateDefinitionsDebugFolder()

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

        this.debug.addManualBinding(this.debugRuntimeFolder, this.debugState, 'nowPlayingLine1', {
            label: 'now1',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugRuntimeFolder, this.debugState, 'nowPlayingLine2', { label: 'now2', readonly: true }, 'auto')
        this.debug.addManualBinding(this.debugRuntimeFolder, this.debugState, 'nowPlayingLine3', { label: 'now3', readonly: true }, 'auto')
        this.debug.addManualBinding(this.debugRuntimeFolder, this.debugState, 'nowPlayingLine4', { label: 'now4', readonly: true }, 'auto')
        this.debug.addManualBinding(this.debugRuntimeFolder, this.debugState, 'nowPlayingLine5', { label: 'now5', readonly: true }, 'auto')
        this.debug.addManualBinding(this.debugRuntimeFolder, this.debugState, 'nowPlayingLine6', { label: 'now6', readonly: true }, 'auto')

        this.debug.addManualBinding(this.debugRuntimeFolder, this.debugState, 'lastPlayed', {
            label: 'lastPlayed',
            readonly: true
        }, 'auto')
    }

    populateDefinitionsDebugFolder()
    {
        if(!this.debugDefinitionsFolder)
        {
            return
        }

        for(const [soundName, definition] of Object.entries(SOUND_DEFINITIONS))
        {
            const baseVolume = Number.isFinite(definition.volume) ? definition.volume : 1
            const basePlaybackRate = Number.isFinite(definition.playbackRate) ? definition.playbackRate : 1
            this.soundDefinitionTuning[soundName] = {
                volume: baseVolume,
                playbackRate: basePlaybackRate
            }

            const soundFolder = this.debug.addFolder(definition.label || soundName, {
                parent: this.debugDefinitionsFolder,
                expanded: false
            })

            this.debug.addBinding(soundFolder, this.soundDefinitionTuning[soundName], 'volume', {
                label: 'volume',
                min: 0,
                max: 2,
                step: 0.01
            })

            this.debug.addBinding(soundFolder, this.soundDefinitionTuning[soundName], 'playbackRate', {
                label: 'rate',
                min: 0.05,
                max: 4,
                step: 0.01
            })
        }

        this.debug.addButton(this.debugDefinitionsFolder, {
            title: 'Save definitions to clipboard',
            onClick: async () =>
            {
                await this.copySoundDefinitionsToClipboard()
            }
        })
    }

    buildSoundDefinitionsExportPayload()
    {
        const payload = {}

        for(const [soundName, definition] of Object.entries(SOUND_DEFINITIONS))
        {
            const tuning = this.soundDefinitionTuning?.[soundName] ?? {}
            payload[soundName] = {
                ...definition,
                volume: Number.isFinite(tuning.volume) ? tuning.volume : definition.volume,
                playbackRate: Number.isFinite(tuning.playbackRate) ? tuning.playbackRate : definition.playbackRate
            }
        }

        return payload
    }

    async copySoundDefinitionsToClipboard()
    {
        const payload = this.buildSoundDefinitionsExportPayload()
        const text = JSON.stringify(payload, null, 2)

        try
        {
            await navigator.clipboard.writeText(text)
            console.info('[Audio] soundDefinitions copiees dans le presse-papiers')
        }
        catch(error)
        {
            console.warn('[Audio] Impossible de copier soundDefinitions:', error)
        }
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
        const nowPlayingLines = this.getNowPlayingLineValues()
        this.debugState.nowPlayingLine1 = nowPlayingLines[0] || 'none'
        this.debugState.nowPlayingLine2 = nowPlayingLines[1] || ''
        this.debugState.nowPlayingLine3 = nowPlayingLines[2] || ''
        this.debugState.nowPlayingLine4 = nowPlayingLines[3] || ''
        this.debugState.nowPlayingLine5 = nowPlayingLines[4] || ''
        this.debugState.nowPlayingLine6 = nowPlayingLines[5] || ''
    }

    markSoundPlayed(soundName)
    {
        if(!this.debugState)
        {
            return
        }

        this.debugState.lastPlayed = String(soundName || 'unknown')
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
            .map((voice) => `#${voice.id} ${voice.channel}:${voice.soundName}`)
            .join(' | ')

        if(voices.length <= ACTIVE_SOUNDS_LABEL_LIMIT)
        {
            return label
        }

        return `${label} | +${voices.length - ACTIVE_SOUNDS_LABEL_LIMIT} more`
    }

    getNowPlayingLineValues()
    {
        if(this.activeVoices.size === 0)
        {
            return []
        }

        const countsByName = new Map()
        for(const voice of this.activeVoices.values())
        {
            const soundName = voice.soundName || 'unknown'
            countsByName.set(soundName, (countsByName.get(soundName) ?? 0) + 1)
        }

        return Array.from(countsByName.entries())
            .slice(0, NOW_PLAYING_LINE_LIMIT)
            .map(([soundName, count]) => (count > 1 ? `${soundName} x${count}` : soundName))
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
        this.debugDefinitionsFolder?.dispose?.()
        this.debugFolder?.dispose?.()
        this.debugControlsFolder = null
        this.debugRuntimeFolder = null
        this.debugDefinitionsFolder = null
        this.debugFolder = null
        this.debugState = null
        this.soundDefinitionTuning = {}

        this.masterGain?.disconnect?.()
        this.masterGain = null

        if(this.context && this.context.state !== 'closed')
        {
            this.context.close().catch(() => {})
        }

        this.context = null
    }
}
