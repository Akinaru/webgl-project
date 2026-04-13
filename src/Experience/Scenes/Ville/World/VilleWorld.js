import Experience from '../../../Experience.js'
import EventEnum from '../../../Enum/EventEnum.js'
import Player from '../../../Common/Player.js'
import VilleFloor from './VilleFloor.js'
import VilleFox from './VilleFox.js'
import VilleEnvironment from './VilleEnvironment.js'

let villeWorldInstanceIndex = 0

export default class VilleWorld
{
    constructor()
    {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.readyEventName = `${EventEnum.READY}.villeWorld${villeWorldInstanceIndex++}`

        this.resources.on(this.readyEventName, () =>
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

        this.floor = new VilleFloor()
        this.fox = new VilleFox()
        this.environment = new VilleEnvironment()
        this.player = new Player({
            groundHeight: 0,
            boundaryRadius: 36,
            spawnPosition: { x: 0, y: 1.65, z: 6 },
            spawnYaw: 0
        })
    }

    update(delta = this.experience.time.delta)
    {
        if(this.player)
        {
            this.player.update(delta)
        }

        if(this.fox)
        {
            this.fox.update()
        }
    }

    destroy()
    {
        this.resources.off(this.readyEventName)

        if(this.player)
        {
            this.player.destroy()
            this.player = null
        }

        if(this.floor)
        {
            this.floor.destroy?.()
            this.floor = null
        }

        if(this.fox)
        {
            this.fox.destroy?.()
            this.fox = null
        }

        if(this.environment)
        {
            this.environment.destroy?.()
            this.environment = null
        }

        this.isSetUp = false
    }
}
