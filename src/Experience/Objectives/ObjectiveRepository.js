import objectivesData from './objectives.json'

export default class ObjectiveRepository
{
    constructor()
    {
        this.objectives = objectivesData.objectives || {}
        this.runtime = objectivesData.runtime || {}
    }

    getByKey(key)
    {
        return this.objectives[key] || null
    }

    getAllKeys()
    {
        return Object.keys(this.objectives)
    }

    getInitialObjectiveKey()
    {
        const configuredKey = this.runtime?.initialObjectiveKey
        if(typeof configuredKey !== 'string')
        {
            return ''
        }

        return configuredKey.trim()
    }
}
