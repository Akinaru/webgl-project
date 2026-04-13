import Experience from '../Experience.js'
import EventEmitter from '../Utils/EventEmitter.js'
import MetierEnum from '../Enum/MetierEnum.js'
import Metier from './Metier.js'

const METIER_IDS = new Set(Object.values(MetierEnum))

const METIER_CONFIGS = Object.freeze([
    {
        id: MetierEnum.INVENTEUR,
        label: 'Inventeur',
        debugLabel: '🔵 Inventeur',
        color: '#2b7fff'
    },
    {
        id: MetierEnum.MENEUR,
        label: 'Meneur',
        debugLabel: '🟣 Meneur',
        color: '#8e44ff'
    },
    {
        id: MetierEnum.TRAVAILLEUR,
        label: 'Travailleur',
        debugLabel: '🔴 Travailleur',
        color: '#e74c3c'
    },
    {
        id: MetierEnum.BOTANISTE,
        label: 'Botaniste',
        debugLabel: '🟢 Botaniste',
        color: '#2ecc71'
    }
])

export default class MetierManager extends EventEmitter
{
    constructor()
    {
        super()

        this.experience = new Experience()
        this.debug = this.experience.debug

        this.enum = MetierEnum
        this.metiers = new Map()
        this.debugValues = null

        this.setMetiers()
        this.setDebug()
    }

    setMetiers()
    {
        for(const config of METIER_CONFIGS)
        {
            this.metiers.set(config.id, new Metier({
                id: config.id,
                label: config.label,
                color: config.color,
                initialValue: 0
            }))
        }
    }

    resolveMetierId(metierEnum)
    {
        if(!METIER_IDS.has(metierEnum))
        {
            throw new Error(`Metier inconnu: ${metierEnum}. Utilise MetierEnum.INVENTEUR|MENEUR|TRAVAILLEUR|BOTANISTE`)
        }

        return metierEnum
    }

    getMetier(metierEnum)
    {
        const metierId = this.resolveMetierId(metierEnum)
        const metier = this.metiers.get(metierId)
        if(!metier)
        {
            throw new Error(`Metier non initialise: ${metierId}`)
        }

        return metier
    }

    getAll()
    {
        return Array.from(this.metiers.values())
    }

    getMetierValue(metierEnum)
    {
        return this.getMetier(metierEnum).value
    }

    setMetierValue(metierEnum, value)
    {
        const metier = this.getMetier(metierEnum)
        const previousValue = metier.value
        const nextValue = metier.setValue(value)
        this.updateDebugValue(metier.id, nextValue)

        this.trigger('change', [{
            id: metier.id,
            value: nextValue,
            previousValue
        }])

        return nextValue
    }

    addToMetier(metierEnum, amount)
    {
        const metier = this.getMetier(metierEnum)
        const previousValue = metier.value
        const nextValue = metier.add(amount)
        this.updateDebugValue(metier.id, nextValue)

        this.trigger('change', [{
            id: metier.id,
            value: nextValue,
            previousValue,
            amount
        }])

        return nextValue
    }

    add(metierEnum, amount)
    {
        return this.addToMetier(metierEnum, amount)
    }

    getValues()
    {
        const values = {}
        for(const metier of this.getAll())
        {
            values[metier.id] = metier.value
        }

        return values
    }

    setDebug()
    {
        if(!this.debug.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('🧪 Metiers', { expanded: true })
        this.debugValues = this.getValues()
        for(const config of METIER_CONFIGS)
        {
            this.debug.addManualBinding(this.debugFolder, this.debugValues, config.id, {
                label: config.debugLabel,
                readonly: true
            }, 'auto')
        }
    }

    updateDebugValue(metierId, value)
    {
        if(!this.debugValues || !(metierId in this.debugValues))
        {
            return
        }

        this.debugValues[metierId] = value
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugValues = null
    }
}
