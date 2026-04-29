import MetierEnum from '../Enum/MetierEnum.js'

export default class DialogueActionExecutor
{
    constructor(dialogueManager)
    {
        this.dialogueManager = dialogueManager
        this.experience = dialogueManager.experience
    }

    executeMany(actions = [], context = {})
    {
        if(!actions || actions.length === 0)
        {
            return
        }

        for(const action of actions)
        {
            this.execute(action, context)
        }
    }

    execute(action = {}, context = {})
    {
        if(!action?.type)
        {
            return
        }

        switch(action.type)
        {
            case 'setFlag':
                this.dialogueManager.setFlag(action.key, action.value)
                break

            case 'addMetier':
                if(this.tryRecordAction(action, context))
                {
                    break
                }

                this.experience.metierManager.addToMetier(
                    this.resolveMetierId(action.metier),
                    Number(action.amount ?? 0)
                )
                break

            case 'recordAction':
                this.tryRecordAction(action, context)
                break

            case 'switchScene':
                this.experience.sceneManager?.switchTo?.(action.scene)
                break

            case 'startMiniGame':
                this.dialogueManager.trigger('minigame', [{
                    key: action.key,
                    payload: action.payload ?? null
                }])
                console.info(`[Dialogue] Mini-jeu demande: ${action.key}`)
                break

            case 'startDialogue':
                this.dialogueManager.startByKey(action.key, {
                    ...context,
                    chained: true
                })
                break

            case 'moveBloomToRailNode':
                this.moveBloomToRailNode(action)
                break

            case 'emit':
                if(typeof action.event === 'string' && action.event.trim() !== '')
                {
                    this.dialogueManager.trigger(action.event, [action.payload ?? null])
                }
                break

            case 'log':
                console.info('[Dialogue]', action.message ?? action)
                break

            default:
                console.warn(`[Dialogue] Action inconnue: ${action.type}`)
                break
        }
    }

    resolveMetierId(metierRef)
    {
        if(typeof metierRef !== 'string')
        {
            throw new Error(`[Dialogue] Metier invalide dans action: ${metierRef}`)
        }

        if(Object.prototype.hasOwnProperty.call(MetierEnum, metierRef))
        {
            return MetierEnum[metierRef]
        }

        return metierRef
    }

    tryRecordAction(action = {}, context = {})
    {
        const actionId = typeof action.actionId === 'string'
            ? action.actionId.trim()
            : ''

        if(!actionId)
        {
            return false
        }

        return Boolean(this.experience.actionTracker?.record?.(actionId, {
            ...context,
            source: 'dialogue'
        }))
    }

    moveBloomToRailNode(action = {})
    {
        const nodeId = typeof action.nodeId === 'string' ? action.nodeId.trim() : ''
        if(!nodeId)
        {
            return
        }

        const currentWorld = this.experience.sceneManager?.currentScene?.world
        const bloom = currentWorld?.bloom
        if(!bloom || typeof bloom.moveToRailNode !== 'function')
        {
            console.warn(`[Dialogue] Bloom indisponible pour moveBloomToRailNode(${nodeId})`)
            return
        }

        const didStartMove = bloom.moveToRailNode(nodeId, {
            lockToNode: Boolean(action.lockToNode)
        })

        if(!didStartMove)
        {
            console.warn(`[Dialogue] Node rail introuvable pour Bloom: ${nodeId}`)
        }
    }
}
