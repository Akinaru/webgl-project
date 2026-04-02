import * as THREE from 'three'
import Experience from './Experience.js'

export default class Camera
{
    constructor()
    {
        this.experience = new Experience()
        this.sizes = this.experience.sizes
        this.scene = this.experience.scene

        this.setInstance()
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
        // Pas de controle externe a detruire ici.
    }
}
