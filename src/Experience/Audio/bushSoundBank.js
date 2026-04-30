const fallbackBushSoundUrls = [
    '/sounds/effects/bush/bush.mp3',
    '/sounds/effects/bush/bush-1.mp3'
]

export function getBushSoundUrls()
{
    return [...fallbackBushSoundUrls]
        .filter((value, index, list) =>
            typeof value === 'string'
            && value.length > 0
            && list.indexOf(value) === index
        )
}
