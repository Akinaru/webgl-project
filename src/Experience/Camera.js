import * as THREE from 'three'
import Experience from './Experience.js'
import EventEnum from './Enum/EventEnum.js'

const DEFAULT_CAMERA_FOV = 70

export default class Camera
{
    constructor()
    {
        this.experience = new Experience()
        this.sizes = this.experience.sizes
        this.debug = this.experience.debug

        this.setInstance()
        this.setDebug()

        this.sizes.on(`${EventEnum.RESIZE}.camera`, () =>
        {
            this.resize()
        })
    }

    setInstance()
    {
        this.defaultFov = DEFAULT_CAMERA_FOV
        this.instance = new THREE.PerspectiveCamera(this.defaultFov, this.sizes.width / this.sizes.height, 0.1, 150)
    }

    resetFov()
    {
        if(!this.instance)
        {
            return
        }

        this.instance.fov = this.defaultFov
        this.instance.updateProjectionMatrix()
    }

    setFov(value)
    {
        if(!this.instance || !Number.isFinite(value))
        {
            return
        }

        this.instance.fov = value
        this.instance.updateProjectionMatrix()
    }

    setDebug()
    {
        if(!this.debug.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('🎥 Camera de jeu', { expanded: false })

        this.debug.addBinding(this.debugFolder, this.instance, 'fov', {
            label: 'Champ de vision',
            min: 30,
            max: 110,
            step: 1,
            view: 'cameraring',
            series: 1
        }).on('change', () =>
        {
            this.instance.updateProjectionMatrix()
        })
    }

    resize()
    {
        this.instance.aspect = this.sizes.width / this.sizes.height
        this.instance.updateProjectionMatrix()
    }

    update()
    {
        // La camera est pilotee par la classe Player en vue FPS.
    }

    destroy()
    {
        this.sizes.off(`${EventEnum.RESIZE}.camera`)
        this.debugFolder?.dispose?.()
    }
}
