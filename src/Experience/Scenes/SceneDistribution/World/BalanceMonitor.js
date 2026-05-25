import * as SceneDistributionFlowConstants from './Flow.constants.js'
export default class SceneDistributionBalanceMonitor
{
    constructor({
        tubeWaterController = null,
        onSolvedChange = null
    } = {})
    {
        this.tubeWaterController = tubeWaterController
        this.onSolvedChange = typeof onSolvedChange === 'function' ? onSolvedChange : null
        this.state = this.buildDefaultState()
    }

    buildDefaultState()
    {
        return {
            isSolved: false,
            totalUsageUnits: 0,
            totalUsageRatio: 0,
            capacityLimit: SceneDistributionFlowConstants.TOTAL_CAPACITY_UNITS,
            isOverLimit: false,
            channels: SceneDistributionFlowConstants.DISTRIBUTION_CHANNEL_ORDER.map((token) => ({
                token,
                config: SceneDistributionFlowConstants.DISTRIBUTION_ZONES[token],
                normalizedFill: 0,
                currentLevel: SceneDistributionFlowConstants.DISTRIBUTION_ZONES[token].levels[0],
                status: 'arret'
            }))
        }
    }

    update()
    {
        const previousSolved = this.state.isSolved
        this.state = this.computeState()

        // Résolu si toutes les zones ont au moins un peu de ressources (id > 0)
        // et qu'on n'est pas en surcharge
        const solved = !this.state.isOverLimit && this.state.channels.every(c => c.currentLevel.id > 0)

        if(previousSolved !== solved)
        {
            this.state.isSolved = solved
            this.onSolvedChange?.(solved, this.state)
        }
    }

    computeState()
    {
        let totalUsageUnits = 0
        const channels = SceneDistributionFlowConstants.DISTRIBUTION_CHANNEL_ORDER.map((token) =>
        {
            const fillState = this.tubeWaterController?.getFillStateForValveToken?.(token) ?? null
            const normalizedFill = fillState?.normalizedFill ?? 0
            const config = SceneDistributionFlowConstants.DISTRIBUTION_ZONES[token]
            
            totalUsageUnits += normalizedFill

            // Trouver le palier actuel
            let currentLevel = config.levels[0]
            for(const level of config.levels)
            {
                if(normalizedFill >= level.threshold - 0.05)
                {
                    currentLevel = level
                }
            }

            return {
                token,
                config,
                normalizedFill,
                currentLevel,
                status: currentLevel.label.toLowerCase()
            }
        })

        const totalUsageRatio = Math.min(1.0, totalUsageUnits / SceneDistributionFlowConstants.TOTAL_CAPACITY_UNITS)
        const isOverLimit = totalUsageUnits >= SceneDistributionFlowConstants.TOTAL_CAPACITY_UNITS - 0.001

        return {
            totalUsageUnits,
            totalUsageRatio,
            capacityLimit: SceneDistributionFlowConstants.TOTAL_CAPACITY_UNITS,
            isOverLimit,
            channels
        }
    }

    getState()
    {
        return {
            ...this.state,
            channels: this.state.channels.map((channel) => ({ ...channel }))
        }
    }

    destroy()
    {
        this.tubeWaterController = null
        this.onSolvedChange = null
        this.state = this.buildDefaultState()
    }
}
