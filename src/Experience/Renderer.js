import * as THREE from 'three'
import Experience from './Experience.js'
import EventEnum from './Enum/EventEnum.js'

export default class Renderer
{
    constructor()
    {
        this.experience = new Experience()
        this.canvas = this.experience.canvas
        this.sizes = this.experience.sizes
        this.camera = this.experience.camera

        this.setInstance()
        this.setScene(this.experience.scene)

        this.sizes.on(`${EventEnum.RESIZE}.renderer`, () =>
        {
            this.resize()
        })
    }

    setInstance()
    {
        this.instance = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        })

        this.instance.toneMapping = THREE.CineonToneMapping
        this.instance.toneMappingExposure = 1.5
        this.instance.shadowMap.enabled = true
        this.instance.shadowMap.type = THREE.PCFSoftShadowMap
        this.instance.setSize(this.sizes.width, this.sizes.height)
        this.instance.setPixelRatio(this.sizes.pixelRatio)
    }

    resize()
    {
        this.instance.setSize(this.sizes.width, this.sizes.height)
        this.instance.setPixelRatio(this.sizes.pixelRatio)
    }

    setScene(scene)
    {
        this.scene = scene
    }

    update()
    {
        if(!this.scene)
        {
            return
        }

        this.instance.render(this.scene, this.camera.instance)
    }

    destroy()
    {
        this.sizes.off(`${EventEnum.RESIZE}.renderer`)
    }
}
