import soundDefinitionsJson from './soundDefinitions.json'

export const SOUND_DEFINITIONS = Object.freeze(soundDefinitionsJson)

export const AUDIO_VOLUME_STORAGE_KEY = Object.freeze({
    music: 'bloom.audio.musicVolume',
    sfx: 'bloom.audio.sfxVolume'
})

export const AUDIO_TYPE = Object.freeze({
    MUSIC: 'music',
    SFX: 'sfx'
})

export const AUDIO_VOLUME_DEFAULTS = Object.freeze({
    [AUDIO_TYPE.MUSIC]: 1,
    [AUDIO_TYPE.SFX]: 1
})

export const AUDIO_PAUSE_GROUP = Object.freeze({
    DIALOGUE: 'dialogue',
    MUSIC: 'music',
    SCENE: 'scene',
    UI: 'ui'
})

export const PAUSE_MENU_AUDIO_GROUPS = Object.freeze([
    AUDIO_PAUSE_GROUP.DIALOGUE,
    AUDIO_PAUSE_GROUP.MUSIC
])

export const ACTIVE_SOUNDS_LABEL_LIMIT = 8
export const NOW_PLAYING_LINE_LIMIT = 6
