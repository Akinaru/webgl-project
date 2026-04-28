const bushSoundModules = {
    ...import.meta.glob('/public/sounds/effects/bush/*.{mp3,ogg,wav,m4a,webm}', {
        eager: true,
        import: 'default'
    }),
    ...import.meta.glob('../../../../public/sounds/effects/bush/*.{mp3,ogg,wav,m4a,webm}', {
        eager: true,
        import: 'default'
    })
}

const fallbackBushSoundUrls = [
    '/sounds/effects/bush/bush.mp3',
    '/sounds/effects/bush/bush-1.mp3'
]

const globBushSoundUrls = Object.values(bushSoundModules)
    .filter((value) => typeof value === 'string' && value.length > 0)

export function getBushSoundUrls()
{
    return [...globBushSoundUrls, ...fallbackBushSoundUrls]
        .filter((value, index, list) =>
            typeof value === 'string'
            && value.length > 0
            && list.indexOf(value) === index
        )
}
