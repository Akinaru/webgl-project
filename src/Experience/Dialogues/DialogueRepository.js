import dialoguesData from './dialogues.json'

export default class DialogueRepository
{
    constructor()
    {
        this.dialogues = dialoguesData.dialogues || {}
    }

    getByKey(key)
    {
        return this.dialogues[key] || null
    }

    getAllKeys()
    {
        return Object.keys(this.dialogues)
    }
}
