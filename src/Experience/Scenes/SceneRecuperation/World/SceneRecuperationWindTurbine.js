import * as THREE from 'three'
import Experience from '../../../Experience.js'

const DEFAULT_ROTATION_SPEED = 1.8

export default class SceneRecuperationWindTurbine
{
    constructor({ recuperationModel = null, debugParentFolder = null } = {})
    {
        this.experience = new Experience()
        this.recuperationModel = recuperationModel
        this.debug = this.experience.debug
        this.debugParentFolder = debugParentFolder

        this.bladesRotationAxis = new THREE.Vector3(0, 0, 1)
        this.axisRotationAxis = new THREE.Vector3(0, -1, 0)
        this.state = {
            speed: 1
        }

        this.turbineRoot = this.recuperationModel?.getFirstObjectForNameTokens?.(['wind turbine'], { exact: true }) ?? null
        this.bladesGroup = this.recuperationModel?.getFirstObjectForNameTokens?.(['ailes'], { exact: true }) ?? null
        this.axisObject = this.recuperationModel?.getFirstObjectForNameTokens?.(['axe'], { exact: true }) ?? null
        this.debugFolder = null

        this.setDebug()
    }

    update(deltaMs = this.experience.time.delta)
    {
        if(this.bladesGroup === null && this.axisObject === null)
        {
            return
        }

        const deltaSeconds = Math.max(0, Math.min(0.05, (deltaMs || 16.67) * 0.001))
        const angle = deltaSeconds * DEFAULT_ROTATION_SPEED * this.state.speed

        if(this.bladesGroup)
        {
            this.bladesGroup.rotateOnAxis(this.bladesRotationAxis, angle)
        }

        if(this.axisObject)
        {
            this.axisObject.rotateOnAxis(this.axisRotationAxis, angle)
        }
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('Eolienne', {
            parent: this.debugParentFolder || this.debug.ui,
            expanded: false
        })
        this.debug.addBinding(this.debugFolder, this.state, 'speed', {
            label: 'speed',
            min: -1,
            max: 1,
            step: 0.001
        })
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugFolder = null
        this.turbineRoot = null
        this.bladesGroup = null
        this.axisObject = null
    }
}
