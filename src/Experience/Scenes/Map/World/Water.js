import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class Water
{
    constructor({ mapModel = null } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.mapModel = mapModel

        this.state = {
            minYPos: 1.09,
            deepYPos: -0.11,
            showPlan: false
        }

        this.shallowColor = new THREE.Color('#2a98a5')
        this.deepColor = new THREE.Color('#14576d')

        this.applyWaterline()
        this.applyPlanVisibility()
        this.setDebug()
    }

    applyWaterline()
    {
        if(this.state.deepYPos > this.state.minYPos)
        {
            this.state.deepYPos = this.state.minYPos
        }

        this.mapModel?.applyTerrainWaterline?.({
            minY: this.state.minYPos,
            deepY: this.state.deepYPos,
            shallowColor: this.shallowColor,
            deepColor: this.deepColor
        })
    }

    applyPlanVisibility()
    {
        this.mapModel?.setPlanVisibility?.(this.state.showPlan)
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('💧 Water', { expanded: false })

        this.debug.addBinding(this.debugFolder, this.state, 'minYPos', {
            label: 'minYPos',
            min: -10,
            max: 10,
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
