const FALLBACK_INDEX = 0

function getSafeStorage()
{
    if(typeof window === 'undefined' || !window.localStorage)
    {
        return null
    }

    return window.localStorage
}

export function pickCycledSceneMusic(storageKey, soundKeys)
{
    const safeKeys = Array.isArray(soundKeys)
        ? soundKeys.filter((key) => typeof key === 'string' && key.trim() !== '')
        : []

    if(safeKeys.length === 0)
    {
        return null
    }

    if(safeKeys.length === 1)
    {
        return safeKeys[0]
    }

    const storage = getSafeStorage()
    if(!storage)
    {
        return safeKeys[FALLBACK_INDEX]
    }

    let nextIndex = FALLBACK_INDEX
    try
    {
        const storedValue = Number.parseInt(storage.getItem(storageKey) || '', 10)
        if(Number.isFinite(storedValue))
        {
            nextIndex = (storedValue + 1) % safeKeys.length
        }
        storage.setItem(storageKey, String(nextIndex))
    }
    catch(error)
    {
        nextIndex = FALLBACK_INDEX
    }

    return safeKeys[nextIndex] ?? safeKeys[FALLBACK_INDEX]
}
