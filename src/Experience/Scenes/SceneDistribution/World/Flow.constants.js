import * as THREE from 'three'
import MetierEnum from '../../../Enum/MetierEnum.js'

export const DISTRIBUTION_CHANNEL_ORDER = ['line1', 'line2', 'line3']

// Les paliers de distribution
// id: ordre, threshold: seuil de remplissage de la ligne (0 à 1)
const COMMON_LEVELS = [
    { id: 0, label: 'Arrêt', threshold: 0.0, scores: {} },
    { id: 1, label: 'Critique', threshold: 0.2, scores: {} },
    { id: 2, label: 'Minimum', threshold: 0.4, scores: {} },
    { id: 3, label: 'Stable', threshold: 0.6, scores: {} },
    { id: 4, label: 'Optimal', threshold: 0.8, scores: {} },
    { id: 5, label: 'Maximum', threshold: 1.0, scores: {} }
]

export const DISTRIBUTION_ZONES = {
    line1: {
        id: 'hospitals',
        label: 'Hôpitaux',
        levels: COMMON_LEVELS.map(l => ({
            ...l,
            scores: {
                [MetierEnum.INVENTEUR]: l.id * 8,
                [MetierEnum.MENEUR]: l.id * 5
            }
        }))
    },
    line2: {
        id: 'agriculture',
        label: 'Agriculture',
        levels: COMMON_LEVELS.map(l => ({
            ...l,
            scores: {
                [MetierEnum.BOTANISTE]: l.id * 8,
                [MetierEnum.TRAVAILLEUR]: l.id * 5
            }
        }))
    },
    line3: {
        id: 'habitations',
        label: 'Habitations',
        levels: COMMON_LEVELS.map(l => ({
            ...l,
            scores: {
                [MetierEnum.MENEUR]: l.id * 8,
                [MetierEnum.TRAVAILLEUR]: l.id * 5
            }
        }))
    }
}

/**
 * La somme cumulée des fillState (0 à 1) des 3 lignes qui correspond à 100% de charge.
 * Avec 1.4, une ligne à 100% prend 71% de la capacité totale (1/1.4).
 * Cela force à équilibrer car 2 lignes à 100% feraient 200/140 = 142% (impossible).
 */
export const TOTAL_CAPACITY_UNITS = 1.4

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
