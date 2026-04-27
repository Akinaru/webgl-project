import Experience from '../Experience.js'
import EventEmitter from '../Utils/EventEmitter.js'
import { ACTION_DEFINITIONS, ACTION_DEFINITIONS_BY_ID } from './ActionDefinitions.js'

export default class ActionTracker extends EventEmitter
{
    constructor()
    {
        super()

        this.experience = new Experience()
        this.debug = this.experience.debug

        this.definitions = ACTION_DEFINITIONS
        this.definitionsById = ACTION_DEFINITIONS_BY_ID
        this.doneById = Object.create(null)
        this.timeline = []
        this.debugState = null

        this.setDebug()
    }

    getAllDefinitions()
    {
        return this.definitions.slice()
    }

    getDefinition(actionId)
    {
        if(typeof actionId !== 'string')
        {
            return null
        }

        return this.definitionsById[actionId] || null
    }

    hasDone(actionId)
    {
        return Boolean(this.doneById[actionId])
    }

    getDoneActionIds()
    {
        return Object.keys(this.doneById).filter((actionId) => this.doneById[actionId])
    }

    getTimeline()
    {
        return this.timeline.slice()
    }

    getState()
    {
        return {
            doneById: {
                ...this.doneById
            },
            timeline: this.getTimeline()
        }
    }

    record(actionId, context = {})
    {
        const definition = this.getDefinition(actionId)
        if(!definition)
        {
            console.warn(`[ActionTracker] Action inconnue: ${actionId}`)
            return false
        }

        if(this.hasDone(actionId))
        {
            return false
        }

        const effects = this.resolveEffects(definition)
        const occurrence = {
            index: this.timeline.length,
            id: definition.id,
            label: definition.label,
            category: definition.category ?? 'misc',
            effects,
            sceneId: context.sceneId ?? this.experience.sceneManager?.currentKey ?? null,
            dialogueKey: context.dialogueKey ?? null,
            nodeId: context.nodeId ?? null,
            source: context.source ?? 'runtime',
            targetId: context.targetId ?? null,
            elapsedMs: Number(this.experience.time?.elapsed ?? 0),
            context: {
                ...context
            }
        }

        this.doneById[actionId] = true
        this.timeline.push(occurrence)

        for(const effect of occurrence.effects)
        {
            if(!effect.metier || effect.amount === 0)
            {
                continue
            }

            this.experience.metierManager?.addToMetier?.(effect.metier, effect.amount)
        }

        this.updateDebugState(occurrence)

        this.trigger('record', [occurrence])
        this.trigger('change', [this.getState()])

        return occurrence
    }

    reset()
    {
        this.doneById = Object.create(null)
        this.timeline.length = 0
        this.updateDebugState(null)
        this.trigger('change', [this.getState()])
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('🧭 Actions', { expanded: false })
        this.debugState = {
            count: 0,
            lastAction: 'none',
            lastEffects: 'none'
        }

        this.debug.addManualBinding(this.debugFolder, this.debugState, 'count', {
            label: 'count',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'lastAction', {
            label: 'lastAction',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'lastEffects', {
            label: 'lastEffects',
            readonly: true
        }, 'auto')
    }

    updateDebugState(occurrence)
    {
        if(!this.debugState)
        {
            return
        }

        this.debugState.count = this.timeline.length
        this.debugState.lastAction = occurrence?.id ?? 'none'
        this.debugState.lastEffects = this.formatEffectsLabel(occurrence?.effects ?? [])
    }

    resolveEffects(definition = {})
    {
        if(Array.isArray(definition.effects) && definition.effects.length > 0)
        {
            return definition.effects
                .map((effect) => ({
                    metier: effect?.metier ?? null,
                    amount: Number(effect?.amount ?? 0)
                }))
                .filter((effect) => effect.metier && Number.isFinite(effect.amount))
        }

        const amount = Number(definition.amount ?? 0)
        if(!definition.metier || !Number.isFinite(amount))
        {
            return []
        }

        return [{
            metier: definition.metier,
            amount
        }]
    }

    formatEffectsLabel(effects = [])
    {
        if(!Array.isArray(effects) || effects.length === 0)
        {
            return 'none'
        }

        return effects
            .map((effect) => `${effect.metier}:${effect.amount >= 0 ? '+' : ''}${effect.amount}`)
            .join(', ')
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugFolder = null
        this.debugState = null
        this.timeline.length = 0
        this.doneById = Object.create(null)
    }
}
