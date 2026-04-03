import * as THREE from 'three'
import Experience from './Experience.js'
import EventEnum from './Enum/EventEnum.js'

export default class Camera
{
    constructor()
    {
        this.experience = new Experience()
        this.sizes = this.experience.sizes
        this.scene = this.experience.scene

        this.setInstance()

        this.sizes.on(`${EventEnum.RESIZE}.camera`, () =>
        {
            this.resize()
        })
    }

    setInstance()
    {
        this.instance = new THREE.PerspectiveCamera(70, this.sizes.width / this.sizes.height, 0.1, 150)
        this.scene.add(this.instance)
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
    }
}
