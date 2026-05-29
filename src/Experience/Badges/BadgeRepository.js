import badgesData from './badges.json'

export default class BadgeRepository
{
    constructor()
    {
        this.activities = Array.isArray(badgesData.activities) ? badgesData.activities : []
    }

    getAll()
    {
        return this.activities.map((activity) => ({ ...activity }))
    }

    getByKey(key)
    {
        return this.activities.find((activity) => activity.key === key) || null
    }

    getCount()
    {
        return this.activities.length
    }
}
