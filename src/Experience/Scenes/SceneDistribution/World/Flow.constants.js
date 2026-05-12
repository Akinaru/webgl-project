import * as THREE from 'three'

export const DISTRIBUTION_CHANNEL_ORDER = ['line1', 'line2', 'line3']

export const DISTRIBUTION_CHANNEL_LABELS = {
    line1: 'Circuit 1',
    line2: 'Circuit 2',
    line3: 'Circuit 3'
}

export const DISTRIBUTION_TARGET_WINDOWS = {
    line1: {
        min: 0.22,
        max: 0.29
    },
    line2: {
        min: 0.39,
        max: 0.46
    },
    line3: {
        min: 0.58,
        max: 0.65
    }
}

export function findDistributionChannelRootObject(object)
{
    let current = object
    while(current)
    {
        const compactName = String(current.name || '')
            .toLowerCase()
            .replace(/[\s_-]+/g, '')

        if(compactName.includes('vanneleft')
            || compactName.includes('vannemid')
            || compactName.includes('vanneright'))
        {
            return current
        }

        current = current.parent
    }

    return object ?? null
}

export function buildDistributionChannelSlotMap(objects = [])
{
    const roots = []
    const rootIds = new Set()
    const worldPosition = new THREE.Vector3()

    for(const object of objects)
    {
        const root = findDistributionChannelRootObject(object)
        if(!(root instanceof THREE.Object3D) || rootIds.has(root.uuid))
        {
            continue
        }

        root.getWorldPosition(worldPosition)
        roots.push({
            root,
            x: worldPosition.x
        })
        rootIds.add(root.uuid)
    }

    roots.sort((a, b) => b.x - a.x)

    const slotMap = new Map()
    for(let index = 0; index < roots.length; index++)
    {
        slotMap.set(
            roots[index].root.uuid,
            DISTRIBUTION_CHANNEL_ORDER[index] ?? `line${index + 1}`
        )
    }

    return slotMap
}

export function resolveDistributionChannelTokenFromObject(object, slotMap = null)
{
    const root = findDistributionChannelRootObject(object)
    if(root?.uuid && slotMap instanceof Map && slotMap.has(root.uuid))
    {
        return slotMap.get(root.uuid)
    }

    return DISTRIBUTION_CHANNEL_ORDER[1]
}
