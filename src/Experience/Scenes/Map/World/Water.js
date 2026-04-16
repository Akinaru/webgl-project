import * as THREE from 'three'
import Experience from '../../../Experience.js'

// Water pilote les parametres d eau globaux et les applique au rendu de la map.
const WATER_LEVEL_MIN = 0
const WATER_LEVEL_MAX = 2
const RIPPLE_TIME_SPEED_DEFAULT = 0.08

export default class Water
{
    constructor({ mapModel = null } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.mapModel = mapModel

        this.state = {
            waterLevel: 1.20,
            deepYPos: 0.22,
            slopeFrequency: 14,
            noiseFrequency: 0.08,
            rippleTimeSpeed: RIPPLE_TIME_SPEED_DEFAULT,
            showPlan: true
        }

        this.shallowColor = new THREE.Color('#2a98a5')
        this.deepColor = new THREE.Color('#14576d')
        this.applyWaterline()
        this.applyPlanVisibility()
        this.update()
        this.setDebug()
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
            slopeFrequency: this.state.slopeFrequency,
            noiseFrequency: this.state.noiseFrequency
        })
    }

    applyPlanVisibility()
    {
        this.mapModel?.setPlanVisibility?.(this.state.showPlan)
    }

    update()
    {
        const localTime = (this.experience.time.elapsed * 0.001) * this.state.rippleTimeSpeed
        this.mapModel?.setPlanWaterMaskLocalTime?.(localTime)
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('💧 Water', { expanded: false })

        this.debug.addBinding(this.debugFolder, this.state, 'waterLevel', {
            label: 'waterLevel',
            min: WATER_LEVEL_MIN,
            max: WATER_LEVEL_MAX,
            step: 0.01
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'deepYPos', {
            label: 'deepYPos',
            min: -20,
            max: 10,
            step: 0.01
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'slopeFrequency', {
            label: 'slopeFrequency',
            min: 0,
            max: 80,
            step: 0.01
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'noiseFrequency', {
            label: 'noiseFrequency',
            min: 0,
            max: 2,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'rippleTimeSpeed', {
            label: 'rippleTimeSpeed',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.update()
        })

        this.debug.addColorBinding(this.debugFolder, this, 'shallowColor', {
            label: 'shallowColor'
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addColorBinding(this.debugFolder, this, 'deepColor', {
            label: 'deepColor'
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'showPlan', {
            label: 'showPlan'
        }).on('change', () =>
        {
            this.applyPlanVisibility()
        })
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.mapModel = null
    }
}
