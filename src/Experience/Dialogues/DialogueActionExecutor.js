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
                this.experience.metierManager.addToMetier(
                    this.resolveMetierId(action.metier),
                    Number(action.amount ?? 0)
                )
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

            case 'setHudHint':
            {
                const hintElement = document.querySelector('.hud__hint')
                if(hintElement && typeof action.text === 'string')
                {
                    hintElement.textContent = action.text
                }
                break
            }

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
}
