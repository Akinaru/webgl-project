export const DEFAULT_PLANE_COUNT = 80
export const DEFAULT_PLANE_SIZE = 0.8
export const DEFAULT_NORMAL_BLEND = 0.85
export const DEFAULT_ALPHA_TEST = 0.4
export const DEFAULT_ROTATION_RANDOMNESS = 9999
export const DEFAULT_WIND_FREQUENCY = 0.2
export const DEFAULT_WIND_TIME_SCALE = 0.1
export const DEFAULT_WIND_STRENGTH = 0.75
export const BEGIN_VERTEX_INCLUDE = '#include <begin_vertex>'

export function prependShader(source, header)
{
    const trimmedHeader = String(header || '').trim()
    if(trimmedHeader.length === 0)
    {
        return source
    }

    return `${trimmedHeader}\n${source}`
}

export function replaceOrAppend(source, search, replacement)
{
    if(source.includes(search))
    {
        return source.replace(search, replacement)
    }

    return `${source}\n${replacement}`
}
