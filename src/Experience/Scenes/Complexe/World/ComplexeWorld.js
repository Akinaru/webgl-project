import Experience from '../../../Experience.js'
import Player from '../../../Common/Player.js'
import ComplexeFloor from './ComplexeFloor.js'
import ComplexeEnvironment from './ComplexeEnvironment.js'
import ComplexeLayout from './ComplexeLayout.js'

export default class ComplexeWorld
{
    constructor()
    {
        this.experience = new Experience()
        this.setUp()
    }

    setUp()
    {
        if(this.isSetUp)
        {
            return
        }
        this.isSetUp = true

        this.floor = new ComplexeFloor()
        this.environment = new ComplexeEnvironment()
        this.layout = new ComplexeLayout()
        this.player = new Player({
            groundHeight: 0,
            boundaryRadius: 48,
            spawnPosition: { x: 0, y: 1.65, z: 18 },
            spawnYaw: Math.PI
        })
    }

    update(delta = this.experience.time.delta)
    {
        this.player?.update(delta)
    }

    destroy()
    {
        if(this.player)
        {
            this.player.destroy()
            this.player = null
        }

        if(this.layout)
        {
            this.layout.destroy?.()
            this.layout = null
        }

        if(this.environment)
        {
            this.environment.destroy?.()
            this.environment = null
        }

        if(this.floor)
        {
            this.floor.destroy?.()
            this.floor = null
        }

        this.isSetUp = false
    }
}
