import Experience from '../../../Experience.js'

export default class SceneDistributionScoring
{
    constructor()
    {
        this.experience = new Experience()
    }

    applyFinalScoring(balanceState)
    {
        if(!balanceState || !balanceState.channels)
        {
            return
        }

        const scoresToApply = {}

        for(const channel of balanceState.channels)
        {
            const level = channel.currentLevel
            if(!level || !level.scores)
            {
                continue
            }

            for(const [metier, amount] of Object.entries(level.scores))
            {
                scoresToApply[metier] = (scoresToApply[metier] || 0) + amount
            }
        }

        // Appliquer les scores au manager global
        for(const [metier, amount] of Object.entries(scoresToApply))
        {
            this.experience.metierManager?.addToMetier?.(metier, amount)
        }
    }
}
