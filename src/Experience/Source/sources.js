import audioSources from './sources.audio.js'
import modelSources from './sources.models.js'
import textureSources from './sources.textures.js'

export const bootSources = [
    ...audioSources
]

export const worldSources = [
    ...modelSources,
    ...textureSources
]

export default [
    ...bootSources,
    ...worldSources
]
