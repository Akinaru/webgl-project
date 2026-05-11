import {
    DISTRIBUTION_CHANNEL_LABELS,
    DISTRIBUTION_CHANNEL_ORDER,
    DISTRIBUTION_TARGET_WINDOWS
} from './SceneDistributionFlow.constants.js'

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
            channels: DISTRIBUTION_CHANNEL_ORDER.map((token) => ({
                token,
                label: DISTRIBUTION_CHANNEL_LABELS[token] ?? token,
                normalizedFill: 0,
                targetWindow: { ...(DISTRIBUTION_TARGET_WINDOWS[token] ?? { min: 0, max: 0 }) },
                isInGreenZone: false,
                status: 'probleme'
            }))
        }
    }

    update()
    {
        const previousSolved = this.state.isSolved
        this.state = this.computeState()

        if(previousSolved !== this.state.isSolved)
        {
            this.onSolvedChange?.(this.state.isSolved, this.state)
        }
    }

    computeState()
    {
        const channels = DISTRIBUTION_CHANNEL_ORDER.map((token) =>
        {
            const fillState = this.tubeWaterController?.getFillStateForValveToken?.(token) ?? null
            const normalizedFill = fillState?.normalizedFill ?? 0

            return {
                token,
                label: DISTRIBUTION_CHANNEL_LABELS[token] ?? token,
                normalizedFill,
                targetWindow: { ...(DISTRIBUTION_TARGET_WINDOWS[token] ?? { min: 0, max: 0 }) },
                isInGreenZone: false,
                status: 'probleme'
            }
        })

        for(const channel of channels)
        {
            const min = channel.targetWindow.min
            const max = channel.targetWindow.max
            channel.isInGreenZone = channel.normalizedFill >= min && channel.normalizedFill <= max
            channel.status = channel.isInGreenZone ? 'vert' : 'probleme'
        }

        const isBalanced = channels.every((channel) => channel.isInGreenZone)

        return {
            isSolved: isBalanced,
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
