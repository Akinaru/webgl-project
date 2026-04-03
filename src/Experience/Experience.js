import * as THREE from 'three'
import Camera from './Camera.js'
import Renderer from './Renderer.js'
import World from './World/World.js'
import Sizes from './Utils/Sizes.js'
import Time from './Utils/Time.js'
import Debug from './Utils/Debug.js'
import Resources from './Utils/Resources.js'
import sources from './sources.js'
import EventEnum from './Enum/EventEnum.js'

let instance = null

export default class Experience
{
    constructor(canvas)
    {
        if(instance)
        {
            return instance
        }
        instance = this

        if(!canvas)
        {
            throw new Error('Le premier new Experience(...) doit recevoir un canvas.')
        }

        window.experience = this

        this.canvas = canvas

        this.debug = new Debug()
        this.sizes = new Sizes()
        this.time = new Time()
        this.scene = new THREE.Scene()
        this.resources = new Resources(sources)
        this.camera = new Camera()
        this.renderer = new Renderer()
        this.world = new World()

        this.time.on(`${EventEnum.TICK}.experience`, () =>
        {
            this.update()
        })
    }

    update()
    {
        this.camera.update()
        this.world.update()
        this.renderer.update()
    }

    destroy()
    {
        this.time.off(`${EventEnum.TICK}.experience`)

        this.world.destroy?.()
        this.camera.destroy?.()
        this.renderer.destroy?.()

        this.sizes.destroy()
        this.time.destroy()

        this.scene.traverse((child) =>
        {
            if(child instanceof THREE.Mesh)
            {
                child.geometry.dispose()

                const materials = Array.isArray(child.material) ? child.material : [child.material]
                for(const material of materials)
                {
                    for(const key in material)
                    {
                        const value = material[key]
                        if(value && typeof value.dispose === 'function')
                        {
                            value.dispose()
                        }
                    }
                }
            }
        })

        this.renderer.instance.dispose()

        if(this.debug.active)
        {
            this.debug.ui.destroy()
        }
    }
}
