import * as THREE from 'three'
import Experience from '../../../Experience.js'
import EventEnum from '../../../Enum/EventEnum.js'
import Player from '../../../Common/Player.js'
import MapLight from '../../Map/World/MapLight.js'
import MapEnvironment from '../../Map/World/MapEnvironment.js'
import Scene1Model from './Scene1Model.js'
import Scene1MaterialButtons from './Scene1MaterialButtons.js'
import Scene1TubeWaterController from './Scene1TubeWaterController.js'

let scene1WorldInstanceIndex = 0

export default class Scene1World
{
    constructor()
    {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.readyEventName = `${EventEnum.READY}.scene1World${scene1WorldInstanceIndex++}`

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
        this.scene1Model = new Scene1Model()

        this.player = new Player({
            groundHeight: 0,
            boundaryRadius: this.scene1Model.getBoundaryRadius?.() ?? 48,
            collisionBoxes: [],
            collisionMeshes: this.scene1Model.getCollisionMeshes?.() ?? [],
            groundMeshes: this.scene1Model.getGroundMeshes?.() ?? [],
            spawnPosition: this.scene1Model.getSpawnPosition?.(),
            spawnYaw: 0
        })
        this.light = new MapLight({
            getFocusPosition: () => this.player?.position ?? null
        })

        this.materialButtons = new Scene1MaterialButtons({
            scene1Model: this.scene1Model,
            isExternalHoverActive: () => this.tubeWaterController?.isHoveringTube?.() ?? false
        })
        this.tubeWaterController = new Scene1TubeWaterController({
            scene1Model: this.scene1Model
        })

        this.setWallCrossTeleport()
    }

    update(delta = this.experience.time.delta)
    {
        this.light?.update?.(delta)
        this.player?.update(delta)
        this.tubeWaterController?.update?.()
        this.materialButtons?.update(delta)
        this.checkWallCrossTeleport()
    }

    setWallCrossTeleport()
    {
        const exitBounds = this.scene1Model?.getBoundsForNameTokens?.(['chemin-sortie'], { exact: true })
        if(!exitBounds)
        {
            this.wallCrossTeleport = null
            return
        }

        const size = exitBounds.getSize(new THREE.Vector3())
        const center = exitBounds.getCenter(new THREE.Vector3())

        const mainAxis = size.x >= size.z ? 'x' : 'z'
        const sideAxis = mainAxis === 'x' ? 'z' : 'x'
        const mainHalf = Math.max(0.25, size[mainAxis] * 0.5)
        const sideHalf = Math.max(0.25, size[sideAxis] * 0.5)
        const edgeThreshold = Math.min(1.25, Math.max(0.45, mainHalf * 0.2))

        this.wallCrossTeleport = {
            mainAxis,
            sideAxis,
            mainMin: center[mainAxis] - mainHalf,
            mainMax: center[mainAxis] + mainHalf,
            sideCenter: center[sideAxis],
            sideReach: sideHalf + 0.8,
            minY: exitBounds.min.y - 0.8,
            maxY: exitBounds.max.y + 4,
            edgeThreshold,
            exitOffset: 1.05,
            cooldownMs: 420
        }
        this.nextWallCrossTeleportAt = 0
    }

    checkWallCrossTeleport()
    {
        if(!this.wallCrossTeleport || !this.player?.position)
        {
            return
        }

        const now = this.experience.time.elapsed ?? 0
        if(now < (this.nextWallCrossTeleportAt || 0))
        {
            return
        }

        const config = this.wallCrossTeleport
        const position = this.player.position
        if(position.y < config.minY || position.y > config.maxY)
        {
            return
        }

        const sideValue = position[config.sideAxis]
        if(Math.abs(sideValue - config.sideCenter) > config.sideReach)
        {
            return
        }

        const mainValue = position[config.mainAxis]
        const toMin = Math.abs(mainValue - config.mainMin)
        const toMax = Math.abs(config.mainMax - mainValue)
        if(toMin > config.edgeThreshold && toMax > config.edgeThreshold)
        {
            return
        }

        const targetMain = toMin <= toMax
            ? config.mainMax + config.exitOffset
            : config.mainMin - config.exitOffset

        if(config.mainAxis === 'x')
        {
            this.player.position.x = targetMain
            this.player.previousPosition.x = targetMain
        }
        else
        {
            this.player.position.z = targetMain
            this.player.previousPosition.z = targetMain
        }

        this.player.velocity.x = 0
        this.player.velocity.z = 0
        this.nextWallCrossTeleportAt = now + config.cooldownMs
    }

    destroy()
    {
        this.resources.off(this.readyEventName)

        if(this.player)
        {
            this.player.destroy()
            this.player = null
        }

        if(this.materialButtons)
        {
            this.materialButtons.destroy?.()
            this.materialButtons = null
        }

        if(this.tubeWaterController)
        {
            this.tubeWaterController.destroy?.()
            this.tubeWaterController = null
        }

        if(this.scene1Model)
        {
            this.scene1Model.destroy?.()
            this.scene1Model = null
        }

        if(this.environment)
        {
            this.environment.destroy?.()
            this.environment = null
        }

        if(this.light)
        {
            this.light.destroy?.()
            this.light = null
        }

        this.wallCrossTeleport = null
        this.nextWallCrossTeleportAt = 0

        this.isSetUp = false
    }
}
