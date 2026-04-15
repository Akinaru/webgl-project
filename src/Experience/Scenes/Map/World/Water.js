import * as THREE from 'three'

// Water pilote les parametres d eau globaux et les applique au rendu de la map.
const WATER_LEVEL_MIN = 0
const WATER_LEVEL_MAX = 2

export default class Water
{
    constructor({ mapModel = null } = {})
    {
        this.mapModel = mapModel

        this.state = {
            waterLevel: 1.20,
            deepYPos: 0.22,
            showPlan: true
        }

        this.shallowColor = new THREE.Color('#2a98a5')
        this.deepColor = new THREE.Color('#14576d')
        this.planWetColor = new THREE.Color('#0d5bff')

        this.applyWaterline()
        this.applyPlanVisibility()
    }

    applyWaterline()
    {
        this.state.waterLevel = THREE.MathUtils.clamp(
            this.state.waterLevel,
            WATER_LEVEL_MIN,
            WATER_LEVEL_MAX
        )

        if(this.state.deepYPos > this.state.waterLevel)
        {
            this.state.deepYPos = this.state.waterLevel
        }

        this.mapModel?.applyTerrainWaterline?.({
            minY: this.state.waterLevel,
            deepY: this.state.deepYPos,
            shallowColor: this.shallowColor,
            deepColor: this.deepColor
        })

        this.mapModel?.applyPlanWaterMask?.({
            waterLevel: this.state.waterLevel,
            wetColor: this.planWetColor
        })
    }

    applyPlanVisibility()
    {
        this.mapModel?.setPlanVisibility?.(this.state.showPlan)
    }

    destroy()
    {
        this.mapModel = null
    }
}
