import Experience from '../../../Experience.js'
import * as SceneRecuperationScoringConstants from './Scoring.constants.js'
function isValueInRange(value, range)
{
    if(!Number.isFinite(value) || !range)
    {
        return false
    }

    return value >= range.min && value <= range.max
}

export default class SceneRecuperationScoring
{
    constructor({ getTubeWaterController = null } = {})
    {
        this.experience = new Experience()
        this.getTubeWaterController = typeof getTubeWaterController === 'function'
            ? getTubeWaterController
            : null

        this.sceneStartElapsedMs = Number(this.experience.time?.elapsed ?? 0)
        this.room2StartElapsedMs = null
        this.simulationCount = 0
        this.testedMaterialKeys = new Set()
        this.hasAppliedFinalScoring = false
    }

    markMaterialTest(materialKey)
    {
        if(typeof materialKey !== 'string' || materialKey === '')
        {
            return
        }

        this.simulationCount += 1
        if(this.testedMaterialKeys.has(materialKey))
        {
            return
        }

        this.testedMaterialKeys.add(materialKey)
        this.applyEffects(SceneRecuperationScoringConstants.RECUPERATION_MATERIAL_TEST_EFFECTS_BY_KEY[materialKey] ?? [])
    }

    markTubePuzzleStart()
    {
        if(this.room2StartElapsedMs !== null)
        {
            return
        }

        this.room2StartElapsedMs = Number(this.experience.time?.elapsed ?? this.sceneStartElapsedMs)
    }

    finalize()
    {
        if(this.hasAppliedFinalScoring)
        {
            return
        }

        this.hasAppliedFinalScoring = true
        this.applySimulationEffects()
        this.applyTubeUsageEffects()
        this.applyResolutionDurationEffects()
    }

    applySimulationEffects()
    {
        if(this.simulationCount === 0)
        {
            this.applyEffects(SceneRecuperationScoringConstants.RECUPERATION_SIMULATION_EFFECTS.zero)
            return
        }

        if(this.simulationCount > SceneRecuperationScoringConstants.RECUPERATION_SIMULATION_INVENTEUR_THRESHOLD)
        {
            this.applyEffects(SceneRecuperationScoringConstants.RECUPERATION_SIMULATION_EFFECTS.aboveThreshold)
        }
    }

    applyTubeUsageEffects()
    {
        const tubeUsageCount = Number(this.getTubeWaterController?.()?.getUniqueRotatedTubeCount?.() ?? 0)
        const effects = isValueInRange(tubeUsageCount, SceneRecuperationScoringConstants.RECUPERATION_TUBE_USAGE_GOOD_RANGE)
            ? SceneRecuperationScoringConstants.RECUPERATION_TUBE_USAGE_EFFECTS.inRange
            : SceneRecuperationScoringConstants.RECUPERATION_TUBE_USAGE_EFFECTS.outOfRange

        this.applyEffects(effects)
    }

    applyResolutionDurationEffects()
    {
        const nowElapsedMs = Number(this.experience.time?.elapsed ?? this.sceneStartElapsedMs)
        const startElapsedMs = this.room2StartElapsedMs ?? this.sceneStartElapsedMs
        const durationSeconds = Math.max(0, (nowElapsedMs - startElapsedMs) * 0.001)
        const effects = isValueInRange(durationSeconds, SceneRecuperationScoringConstants.RECUPERATION_RESOLUTION_DURATION_GOOD_RANGE_SECONDS)
            ? SceneRecuperationScoringConstants.RECUPERATION_RESOLUTION_DURATION_EFFECTS.inRange
            : SceneRecuperationScoringConstants.RECUPERATION_RESOLUTION_DURATION_EFFECTS.outOfRange

        this.applyEffects(effects)
    }

    applyEffects(effects = [])
    {
        for(const effect of effects)
        {
            if(!effect?.metier || !Number.isFinite(effect?.amount))
            {
                continue
            }

            this.experience.metierManager?.addToMetier?.(effect.metier, effect.amount)
        }
    }

    destroy()
    {
        this.testedMaterialKeys.clear()
        this.getTubeWaterController = null
    }
}
