import Experience from '../../../Experience.js'
import EventEnum from '../../../Enum/EventEnum.js'
import Bloom from '../../../Common/Bloom.js'
import Player from '../../../Common/Player.js'
import MapEnvironment from './MapEnvironment.js'
import MapModel from './MapModel.js'
import MapCollisionDebug from './MapCollisionDebug.js'

let mapWorldInstanceIndex = 0

export default class MapWorld
{
    constructor()
    {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.readyEventName = `${EventEnum.READY}.mapWorld${mapWorldInstanceIndex++}`

        if(this.resources.isReady)
        {
            this.setUp()
            return
        }

        this.resources.on(this.readyEventName, () =>
        {
            this.setUp()
        })
    }

    setUp()
    {
        if(this.isSetUp)
        {
            return
        }
        this.isSetUp = true

        this.environment = new MapEnvironment()
        this.mapModel = new MapModel()
        this.player = new Player({
            groundHeight: 0,
            boundaryRadius: 120,
            collisionBoxes: [],
            collisionMeshes: this.mapModel.getCollisionMeshes?.() ?? [],
            groundMeshes: this.mapModel.getCollisionMeshes?.() ?? [],
            spawnPosition: { x: -2.2, y: 7, z: 0.9 },
            spawnYaw: Math.PI
        })
        this.bloom = new Bloom({
            motion: {
                center: { x: 2.5, y: 2.0, z: 2.5 },
                radius: 0
            },
            follow: {
                target: this.player,
                minDistance: 3,
                maxDistance: 7,
                preferredDistance: 4.5,
                heightOffset: 0.9,
                speed: 3.8,
                groundMeshes: this.mapModel.getBloomGroundMeshes?.() ?? [],
                avoidZones: this.mapModel.getBloomAvoidZones?.() ?? []
            }
        })
        this.collisionDebug = new MapCollisionDebug({
            player: this.player,
            mapModel: this.mapModel
        })
    }

    update(delta = this.experience.time.delta)
    {
        this.bloom?.update?.()
        this.player?.update(delta)
        this.collisionDebug?.update?.()
    }

    destroy()
    {
        this.resources.off(this.readyEventName)

        if(this.player)
        {
            this.player.destroy()
            this.player = null
        }

        if(this.mapModel)
        {
            this.mapModel.destroy?.()
            this.mapModel = null
        }

        if(this.bloom)
        {
            this.bloom.destroy?.()
            this.bloom = null
        }

        if(this.collisionDebug)
        {
            this.collisionDebug.destroy?.()
            this.collisionDebug = null
        }

        if(this.environment)
        {
            this.environment.destroy?.()
            this.environment = null
        }

        this.isSetUp = false
    }
}
