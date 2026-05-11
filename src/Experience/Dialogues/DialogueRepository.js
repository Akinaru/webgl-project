import dialoguesData from './dialogues.json'

export default class DialogueRepository
{
    constructor()
    {
        this.dialogues = dialoguesData.dialogues || {}
        this.runtime = dialoguesData.runtime || {}
    }

    getByKey(key)
    {
        return this.dialogues[key] || null
    }

    getAllKeys()
    {
        return Object.keys(this.dialogues)
    }

    getTutorialCompletedDialogueKey()
    {
        const configuredKey = this.runtime?.tutorial?.completedDialogueKey
        if(typeof configuredKey !== 'string')
        {
            return ''
        }

        const normalizedKey = configuredKey.trim()
        return normalizedKey
    }
}
