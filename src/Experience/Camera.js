import * as THREE from 'three'
import Experience from './Experience.js'
import EventEnum from './Enum/EventEnum.js'

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
        this.instance = new THREE.PerspectiveCamera(70, this.sizes.width / this.sizes.height, 0.1, 150)
    }

    setDebug()
    {
        if(!this.debug.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('🎥 Camera', { expanded: false })

        this.debug.addBinding(this.debugFolder, this.instance, 'fov', {
            label: 'fov',
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
