import MetierEnum from '../Enum/MetierEnum.js'

const METIER_IDS = Object.values(MetierEnum)

export default class DialogueConditionResolver
{
    constructor(dialogueManager)
    {
        this.dialogueManager = dialogueManager
        this.experience = dialogueManager.experience
    }

    checkAll(conditions = [], context = {})
    {
        if(!conditions || conditions.length === 0)
        {
            return true
        }

        return conditions.every((condition) => this.check(condition, context))
    }

    check(condition = {}, context = {})
    {
        if(!condition.type)
        {
            return true
        }

        switch(condition.type)
        {
            case 'flagEquals':
                return this.dialogueManager.getFlag(condition.key) === condition.value

            case 'flagTruthy':
                return Boolean(this.dialogueManager.getFlag(condition.key))

            case 'metierAtLeast':
                return this.getMetierValue(condition.metier) >= (condition.value ?? 0)

            case 'metierAtMost':
                return this.getMetierValue(condition.metier) <= (condition.value ?? 0)

            case 'metierIsMax':
                return this.isMetierMax(condition.metier)

            case 'contextEquals':
                return context?.[condition.key] === condition.value

            default:
                console.warn(`[Dialogue] Condition inconnue: ${condition.type}`)
                return false
        }
    }

    getMetierValue(metierRef)
    {
        const metierId = this.resolveMetierId(metierRef)
        return this.experience.metierManager.getMetierValue(metierId)
    }

    isMetierMax(metierRef)
    {
        const metierId = this.resolveMetierId(metierRef)
        const targetValue = this.experience.metierManager.getMetierValue(metierId)

        return METIER_IDS.every((candidateId) =>
        {
            return targetValue >= this.experience.metierManager.getMetierValue(candidateId)
        })
    }

    resolveMetierId(metierRef)
    {
        if(typeof metierRef !== 'string')
        {
            throw new Error(`[Dialogue] Metier invalide dans condition: ${metierRef}`)
        }

        if(Object.prototype.hasOwnProperty.call(MetierEnum, metierRef))
        {
            return MetierEnum[metierRef]
        }

        return metierRef
    }
}
