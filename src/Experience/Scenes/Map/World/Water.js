import * as THREE from 'three'
import Experience from '../../../Experience.js'

// Water pilote les parametres d eau globaux et les applique au rendu de la map.
const WATER_LEVEL_MIN = 0
const WATER_LEVEL_MAX = 2
const RIPPLE_TIME_SPEED_DEFAULT = 0.065

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
            noiseFrequency: 0.304,
            rippleThreshold: -0.315,
            backgroundOpacity: 0.45,
            rippleTimeSpeed: RIPPLE_TIME_SPEED_DEFAULT,
            showPlan: true
        }

        this.shallowColor = new THREE.Color('#2a98a5')
        this.deepColor = new THREE.Color('#146c89')
        this.backgroundColor = new THREE.Color('#124f69')
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
            noiseFrequency: this.state.noiseFrequency,
            rippleThreshold: this.state.rippleThreshold,
            backgroundColor: this.backgroundColor,
            backgroundOpacity: this.state.backgroundOpacity
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
        this.terrainFolder = this.debug.addFolder('Terrain', {
            parent: this.debugFolder,
            expanded: false
        })
        this.wavesFolder = this.debug.addFolder('Vagues', {
            parent: this.debugFolder,
            expanded: false
        })
        this.waterColorFolder = this.debug.addFolder('Couleur Eau', {
            parent: this.debugFolder,
            expanded: false
        })

        this.debug.addBinding(this.terrainFolder, this.state, 'waterLevel', {
            label: 'waterLevel',
            min: WATER_LEVEL_MIN,
            max: WATER_LEVEL_MAX,
            step: 0.01
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.terrainFolder, this.state, 'deepYPos', {
            label: 'deepYPos',
            min: -20,
            max: 10,
            step: 0.01
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addColorBinding(this.terrainFolder, this, 'shallowColor', {
            label: 'shallowColor'
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addColorBinding(this.terrainFolder, this, 'deepColor', {
            label: 'deepColor'
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.wavesFolder, this.state, 'slopeFrequency', {
            label: 'slopeFrequency',
            min: 0,
            max: 80,
            step: 0.01
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.wavesFolder, this.state, 'noiseFrequency', {
            label: 'noiseFrequency',
            min: 0,
            max: 2,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.wavesFolder, this.state, 'rippleThreshold', {
            label: 'rippleThreshold',
            min: -1,
            max: 2,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.wavesFolder, this.state, 'rippleTimeSpeed', {
            label: 'rippleTimeSpeed',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.update()
        })

        this.debug.addColorBinding(this.waterColorFolder, this, 'backgroundColor', {
            label: 'backgroundColor'
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.waterColorFolder, this.state, 'backgroundOpacity', {
            label: 'backgroundOpacity',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.waterColorFolder, this.state, 'showPlan', {
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
