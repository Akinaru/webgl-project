import * as THREE from 'three'
import Experience from '../../../Experience.js'
import EventEnum from '../../../Enum/EventEnum.js'
import SceneEnum from '../../../Enum/SceneEnum.js'
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

        this.setTeleportZone()
    }

    update(delta = this.experience.time.delta)
    {
        this.bloom?.update?.()
        this.player?.update(delta)
        this.collisionDebug?.update?.()
        this.updateTeleportZoneVisual()
        this.checkTeleportTrigger()
    }

    setTeleportZone()
    {
        const bridgeZone = this.mapModel?.getBridgeTeleportZone?.({
            preferredBridge: 'cloneur_4'
        })
        this.teleportZone = bridgeZone ?? {
            x: -2.2,
            y: 0.08,
            z: 6,
            radius: 1.75
        }
        this.isTeleporting = false

        this.teleportGroup = new THREE.Group()
        this.teleportGroup.name = '__mapScene1TeleportZone'
        this.teleportGroup.position.set(this.teleportZone.x, this.teleportZone.y ?? 0.08, this.teleportZone.z)

        this.teleportPad = new THREE.Mesh(
            new THREE.CylinderGeometry(this.teleportZone.radius * 0.86, this.teleportZone.radius * 0.86, 0.06, 48),
            new THREE.MeshStandardMaterial({
                color: '#5fb2ff',
                emissive: '#173b63',
                emissiveIntensity: 0.62,
                roughness: 0.28,
                metalness: 0.35
            })
        )
        this.teleportPad.position.y = 0.03
        this.teleportPad.name = '__mapScene1TeleportPad'

        this.teleportRing = new THREE.Mesh(
            new THREE.TorusGeometry(this.teleportZone.radius, 0.08, 12, 64),
            new THREE.MeshStandardMaterial({
                color: '#57b9ff',
                emissive: '#1f4d73',
                emissiveIntensity: 0.85,
                roughness: 0.35,
                metalness: 0.15
            })
        )
        this.teleportRing.rotation.x = Math.PI * 0.5
        this.teleportRing.position.y = 0.09

        this.teleportColumn = new THREE.Mesh(
            new THREE.CylinderGeometry(this.teleportZone.radius * 0.36, this.teleportZone.radius * 0.56, 2.2, 32, 1, true),
            new THREE.MeshBasicMaterial({
                color: '#72d0ff',
                transparent: true,
                opacity: 0.23,
                side: THREE.DoubleSide,
                depthWrite: false
            })
        )
        this.teleportColumn.position.y = 1.12

        this.teleportLight = new THREE.PointLight('#79ccff', 1.9, 10, 2)
        this.teleportLight.position.y = 1.2

        this.teleportGroup.add(this.teleportPad)
        this.teleportGroup.add(this.teleportRing)
        this.teleportGroup.add(this.teleportColumn)
        this.teleportGroup.add(this.teleportLight)
        this.experience.scene.add(this.teleportGroup)
    }

    updateTeleportZoneVisual()
    {
        if(!this.teleportGroup || this.isTeleporting)
        {
            return
        }

        const elapsed = this.experience.time.elapsed * 0.001
        const pulse = 0.72 + (Math.sin(elapsed * 4.2) * 0.26)

        this.teleportPad.material.emissiveIntensity = 0.5 + (pulse * 0.35)
        this.teleportRing.material.emissiveIntensity = pulse
        this.teleportRing.rotation.z += 0.01

        this.teleportColumn.material.opacity = 0.18 + (Math.sin(elapsed * 2.3) * 0.07)
        this.teleportColumn.rotation.y -= 0.003

        this.teleportLight.intensity = 1.4 + (Math.sin(elapsed * 5) * 0.55)
    }

    checkTeleportTrigger()
    {
        if(this.isTeleporting || !this.player?.position || !this.teleportZone)
        {
            return
        }

        const dx = this.player.position.x - this.teleportZone.x
        const dz = this.player.position.z - this.teleportZone.z
        const distanceSq = (dx * dx) + (dz * dz)
        const radiusSq = this.teleportZone.radius * this.teleportZone.radius

        if(distanceSq > radiusSq)
        {
            return
        }

        this.isTeleporting = true
        this.experience.sceneManager?.switchTo?.(SceneEnum.SCENE1)
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

        if(this.teleportGroup)
        {
            this.experience.scene.remove(this.teleportGroup)
            this.teleportPad.geometry.dispose()
            this.teleportPad.material.dispose()
            this.teleportRing.geometry.dispose()
            this.teleportRing.material.dispose()
            this.teleportColumn.geometry.dispose()
            this.teleportColumn.material.dispose()
            this.teleportPad = null
            this.teleportRing = null
            this.teleportColumn = null
            this.teleportLight = null
            this.teleportGroup = null
        }

        this.teleportZone = null

        this.isSetUp = false
    }
}
