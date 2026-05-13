import Experience from '../Experience.js'
import EventEmitter from '../Utils/EventEmitter.js'
import BadgeRepository from './BadgeRepository.js'
import BadgeUI from './BadgeUI.js'
import * as BadgeConstants from './Badges.constants.js'

export default class BadgeManager extends EventEmitter
{
    constructor()
    {
        super()

        this.experience = new Experience()
        this.debug = this.experience.debug
        this.repository = new BadgeRepository()
        this.activities = this.repository.getAll()
        this.unlockedKeys = new Set()
        this.ui = new BadgeUI(this)

        this.setDebug()
        this.emitState()
    }

    getActivities()
    {
        return this.activities.map((activity) => ({
            ...activity
        }))
    }

    isUnlocked(activityKey)
    {
        return this.unlockedKeys.has(activityKey)
    }

    unlock(activityKey, { showNotification = true } = {})
    {
        const activity = this.repository.getByKey(activityKey)
        if(!activity || this.unlockedKeys.has(activityKey))
        {
            return false
        }

        this.unlockedKeys.add(activityKey)
        this.trigger('unlock', [{
            key: activityKey,
            activity,
            progressRatio: this.getProgressRatio()
        }])
        this.emitState()

        if(showNotification !== true)
        {
            return true
        }

        return true
    }

    reset()
    {
        this.unlockedKeys.clear()
        this.emitState()
    }

    getProgressRatio()
    {
        const totalCount = this.repository.getCount()
        if(totalCount <= 0)
        {
            return 0
        }

        return this.unlockedKeys.size / totalCount
    }

    createUiState()
    {
        return {
            activities: this.activities.map((activity) => ({
                ...activity,
                unlocked: this.unlockedKeys.has(activity.key)
            })),
            unlockedCount: this.unlockedKeys.size,
            totalCount: this.repository.getCount(),
            progressRatio: this.getProgressRatio()
        }
    }

    emitState()
    {
        this.trigger('state', [this.createUiState()])
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder(BadgeConstants.DEBUG_FOLDER_TITLE, { expanded: false })
        this.debugTriggerFolder = this.debug.addFolder(BadgeConstants.DEBUG_TRIGGER_FOLDER_TITLE, {
            parent: this.debugFolder,
            expanded: false
        })

        this.activities.forEach((activity) =>
        {
            this.debug.addButton(this.debugTriggerFolder, {
                title: activity.label,
                onClick: () =>
                {
                    this.unlock(activity.key)
                }
            })
        })

        this.debug.addButton(this.debugFolder, {
            title: BadgeConstants.DEBUG_RESET_TITLE,
            onClick: () =>
            {
                this.reset()
            }
        })
    }

    destroy()
    {
        this.ui.destroy()
        this.debugFolder?.dispose?.()
        this.unlockedKeys.clear()
    }
}
