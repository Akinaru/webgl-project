import Experience from '../Experience.js'
import EventEmitter from '../Utils/EventEmitter.js'
import ObjectiveRepository from './ObjectiveRepository.js'
import ObjectiveUI from './ObjectiveUI.js'
import * as ObjectiveConstants from './Objectives.constants.js'

export default class ObjectiveManager extends EventEmitter
{
    constructor()
    {
        super()

        this.experience = new Experience()
        this.debug = this.experience.debug
        this.repository = new ObjectiveRepository()
        this.ui = new ObjectiveUI(this)
        this.state = this.createEmptyState()
        this.completedObjectives = {}

        this.setDebug()
    }

    createEmptyState()
    {
        return {
            active: false,
            objectiveKey: null,
            objective: null,
            context: {}
        }
    }

    hasActiveObjective()
    {
        return this.state.active === true
    }

    getCurrentObjective()
    {
        return this.state.objective
    }

    showByKey(objectiveKey, context = {})
    {
        if(typeof objectiveKey !== 'string' || objectiveKey.trim() === '')
        {
            return false
        }

        const objective = this.repository.getByKey(objectiveKey)
        if(!objective)
        {
            console.warn(`[Objective] Introuvable: ${objectiveKey}`)
            return false
        }

        this.state = {
            active: true,
            objectiveKey,
            objective,
            context
        }

        this.trigger('start', [{
            key: objectiveKey,
            objective,
            context
        }])
        this.emitState()
        return true
    }

    showInitialObjective(context = {})
    {
        const initialObjectiveKey = this.repository.getInitialObjectiveKey()
        if(!initialObjectiveKey)
        {
            return false
        }

        return this.showByKey(initialObjectiveKey, context)
    }

    completeCurrentObjective({ clear = true } = {})
    {
        if(!this.hasActiveObjective())
        {
            return false
        }

        const completedKey = this.state.objectiveKey
        this.completedObjectives[completedKey] = true

        this.trigger('complete', [{
            key: completedKey,
            objective: this.state.objective,
            context: this.state.context
        }])

        if(clear)
        {
            this.clearCurrentObjective()
        }

        return true
    }

    clearCurrentObjective()
    {
        if(!this.hasActiveObjective())
        {
            this.emitState()
            return false
        }

        const clearedState = {
            key: this.state.objectiveKey,
            objective: this.state.objective,
            context: this.state.context
        }

        this.state = this.createEmptyState()
        this.trigger('clear', [clearedState])
        this.emitState()
        return true
    }

    emitState()
    {
        this.trigger('state', [{
            ...this.state
        }])
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder(ObjectiveConstants.DEBUG_FOLDER_TITLE, { expanded: false })
        this.debugState = {
            [ObjectiveConstants.DEBUG_ACTIVE_KEY]: false,
            [ObjectiveConstants.DEBUG_CURRENT_KEY]: ObjectiveConstants.DEBUG_NONE_VALUE
        }

        this.debug.addManualBinding(this.debugFolder, this.debugState, ObjectiveConstants.DEBUG_ACTIVE_KEY, {
            label: ObjectiveConstants.DEBUG_ACTIVE_LABEL,
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, ObjectiveConstants.DEBUG_CURRENT_KEY, {
            label: ObjectiveConstants.DEBUG_CURRENT_LABEL,
            readonly: true
        }, 'auto')

        this.debug.addButton(this.debugFolder, {
            title: 'Complete Current Objective',
            onClick: () =>
            {
                this.completeCurrentObjective()
            }
        })

        this.debug.addButton(this.debugFolder, {
            title: 'Clear Current Objective',
            onClick: () =>
            {
                this.clearCurrentObjective()
            }
        })

        this.debugTriggerFolder = this.debug.addFolder(ObjectiveConstants.DEBUG_TRIGGER_FOLDER_TITLE, {
            parent: this.debugFolder,
            expanded: false
        })

        const objectiveKeys = this.repository
            .getAllKeys()
            .sort((a, b) => a.localeCompare(b))

        objectiveKeys.forEach((objectiveKey) =>
        {
            this.debug.addButton(this.debugTriggerFolder, {
                title: objectiveKey,
                onClick: () =>
                {
                    this.showByKey(objectiveKey, {
                        fromDebug: true
                    })
                }
            })
        })

        this.on('state.objectiveDebug', () =>
        {
            this.debugState[ObjectiveConstants.DEBUG_ACTIVE_KEY] = this.hasActiveObjective()
            this.debugState[ObjectiveConstants.DEBUG_CURRENT_KEY] = this.state.objectiveKey || ObjectiveConstants.DEBUG_NONE_VALUE
        })
    }

    destroy()
    {
        this.ui.destroy()
        this.debugFolder?.dispose?.()
        this.state = this.createEmptyState()
        this.completedObjectives = {}
    }
}
