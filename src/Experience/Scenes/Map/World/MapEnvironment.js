import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class MapEnvironment
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug

        this.state = {
            fogMode: 'linear',
            fogNear: 28,
            fogFar: 190,
            fogDensity: 0.012
        }

        this.backgroundColor = new THREE.Color('#dbe7f3')
        this.fogColor = new THREE.Color('#dbe7f3')

        this.setFog()
        this.setDebug()
    }

    setFog()
    {
        this.scene.background = this.backgroundColor
        this.applyFog()
    }

    applyFog()
    {
        if(this.state.fogMode === 'exp2')
        {
            this.scene.fog = new THREE.FogExp2(this.fogColor, this.state.fogDensity)
            return
        }

        this.scene.fog = new THREE.Fog(this.fogColor, this.state.fogNear, this.state.fogFar)
    }

    setDebug()
    {
        if(!this.debug.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('🌤 Map Environment', { expanded: false })
        this.fogFolder = this.debug.addFolder('Fog', {
            parent: this.debugFolder,
            expanded: false
        })

        this.debug.addColorBinding(this.debugFolder, this, 'backgroundColor', { label: 'bg' })
        this.debug.addColorBinding(this.fogFolder, this, 'fogColor', { label: 'color' })

        this.debug.addBinding(this.fogFolder, this.state, 'fogMode', {
            label: 'fogMode',
            options: {
                linear: 'linear',
                exp2: 'exp2'
            }
        }).on('change', () =>
        {
            this.applyFog()
        })

        this.debug.addBinding(this.fogFolder, this.state, 'fogNear', { label: 'fogNear', min: 1, max: 300, step: 0.1 }).on('change', () =>
        {
            this.applyFog()
        })

        this.debug.addBinding(this.fogFolder, this.state, 'fogFar', { label: 'fogFar', min: 1, max: 500, step: 0.1 }).on('change', () =>
        {
            this.applyFog()
        })

        this.debug.addBinding(this.fogFolder, this.state, 'fogDensity', { label: 'fogDensity', min: 0.0001, max: 0.08, step: 0.0001 }).on('change', () =>
        {
            this.applyFog()
        })

    }

    destroy()
    {
        this.scene.background = null
        this.scene.fog = null
        this.debugFolder?.dispose?.()
    }
}
