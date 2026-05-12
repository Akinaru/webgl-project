import * as THREE from 'three'
import { setupSceneRecuperationWindTurbineDebug } from './SceneRecuperationWindTurbine.debug.js'
import Experience from '../../../Experience.js'
import * as SceneRecuperationWindTurbineConstants from './SceneRecuperationWindTurbine.constants.js'

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
        const angle = deltaSeconds * SceneRecuperationWindTurbineConstants.DEFAULT_ROTATION_SPEED * this.state.speed

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
        setupSceneRecuperationWindTurbineDebug.call(this)
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
