import Experience from '../Experience.js'
import Floor from './Floor.js'
import Fox from './Fox.js'
import Environment from './Environment.js'
import Player from './Player.js'
import EventEnum from '../Enum/EventEnum.js'

export default class World
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources

        this.resources.on(EventEnum.READY, () =>
        {
            this.setUp()
        })

        if(this.resources.isReady)
        {
            this.setUp()
        }
    }

    setUp()
    {
        if(this.isSetUp)
        {
            return
        }
        this.isSetUp = true

        this.floor = new Floor()
        this.fox = new Fox()
        this.environment = new Environment()
        this.player = new Player({
            groundHeight: 0,
            boundaryRadius: 36
        })
    }

    update()
    {
        if(this.player)
        {
            this.player.update(this.experience.time.delta)
        }

        if(this.fox)
        {
            this.fox.update()
        }
    }

    destroy()
    {
        if(this.player)
        {
            this.player.destroy()
        }
    }
}
