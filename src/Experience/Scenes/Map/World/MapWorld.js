import * as THREE from 'three'
import Experience from '../../../Experience.js'
import EventEnum from '../../../Enum/EventEnum.js'
import SceneEnum from '../../../Enum/SceneEnum.js'
import Bloom from '../../../Common/Bloom.js'
import Player from '../../../Common/Player.js'
import MapEnvironment from './MapEnvironment.js'
import MapLight from './MapLight.js'
import MapModel from './MapModel.js'
import MapCollisionDebug from './MapCollisionDebug.js'
import Water from './Water.js'
import Bushes from './Bushes.js'
import CloudLayer from './CloudLayer.js'
import MapVisibilityDebug from './MapVisibilityDebug.js'
import bloomRails from './bloomRails.json'

const MAP_SPAWN_POSITION = Object.freeze({ x: -2.2, y: 7, z: 0.9 })
const MAP_SPAWN_YAW = Math.PI
const WATER_ENTRY_EPSILON = 0.02
const PLAYER_HEAD_TOP_OFFSET = 0.04
const SHALLOW_WATER_MOVE_SPEED_THRESHOLD = 0.08
const SHALLOW_WATER_SPLASH_INTERVAL_MIN_MS = 220
const SHALLOW_WATER_SPLASH_INTERVAL_MAX_MS = 520
const WALKING_GRASS_SPEED_THRESHOLD = 0.12
const TERRAIN_SAND_BLEND_HEIGHT = 0.18
const BUSH_TRIGGER_COOLDOWN_MS = 220
const BUSH_SOUND_MOVE_SPEED_THRESHOLD = 0.06
const FOOTSTEP_RATE_EPSILON = 0.02

function isRailsGraph(value)
{
    return Boolean(value)
        && typeof value === 'object'
        && Array.isArray(value.nodes)
        && Array.isArray(value.edges)
}

function hasRails(value)
{
    if(Array.isArray(value))
    {
        return value.length > 0
    }

    if(isRailsGraph(value))
    {
        return value.nodes.length > 0 && value.edges.length > 0
    }

    return false
}

function normalizeRails(value)
{
    if(Array.isArray(value) || isRailsGraph(value))
    {
        return value
    }

    return []
}

function getWindowRailsOverride()
{
    if(typeof window === 'undefined')
    {
        return null
    }

    return window.__BLOOM_RAILS ?? window.BLOOM_RAILS ?? null
}

const importedRails = normalizeRails(bloomRails)
const windowRailsOverride = normalizeRails(getWindowRailsOverride())
const BLOOM_RAILS = Object.freeze(hasRails(windowRailsOverride) ? windowRailsOverride : importedRails)

let mapWorldInstanceIndex = 0

export default class MapWorld
{
    constructor()
    {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.debug = this.experience.debug
        this.readyEventName = `${EventEnum.READY}.mapWorld${mapWorldInstanceIndex++}`
        this.wasPlayerBottomUnderWater = false
        this.isUnderwaterLoopPlaying = false
        this.activeFootstepLoop = null
        this.activeFootstepPlaybackRate = 1
        this.shallowWaterSplashCooldownMs = 0
        this.wasInsideBush = false
        this.bushTriggerCooldownMs = 0

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

        this.mapModel = new MapModel()
        this.visibilityDebug = new MapVisibilityDebug({
            mapModel: this.mapModel
        })
        this.environment = new MapEnvironment()
        this.water = new Water({
            mapModel: this.mapModel
        })
        const mapBoundary = this.mapModel.getMapBoundary?.({ inset: 0.1 }) ?? null
        this.player = new Player({
            groundHeight: 0,
            boundaryRadius: 120,
            boundaryBox: mapBoundary,
            collisionBoxes: [],
            collisionMeshes: this.mapModel.getCollisionMeshes?.() ?? [],
            groundMeshes: this.mapModel.getGroundMeshes?.() ?? [],
            spawnPosition: MAP_SPAWN_POSITION,
            spawnYaw: MAP_SPAWN_YAW
        })
        this.bushes = new Bushes(
            {
                mapModel: this.mapModel,
                spawnPosition: MAP_SPAWN_POSITION
            }
        )
        this.setVegetationDebug()

        this.light = new MapLight({
            environment: this.environment,
            getFocusPosition: () => this.player?.position ?? null
        })
        this.clouds = new CloudLayer({
            light: this.light,
            getFocusPosition: () => this.player?.position ?? null
        })
        this.bloom = new Bloom({
            motion: {
                center: { x: 2.5, y: 2.0, z: 2.5 },
                radius: 0
            },
            follow: {
                target: this.player,
                groundMeshes: this.mapModel.getGroundMeshes?.() ?? [],
                groundMaxSnapUp: 0.65
            },
            rails: {
                lines: BLOOM_RAILS,
                speed: 3.8,
                railSwitchDistance: 0.9,
                endpointSwitchDistance: 1.6,
                showHelpers: true
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
        this.light?.update?.(delta)
        this.clouds?.update?.(delta)
        this.water?.update?.(delta)
        this.bushes?.update?.(delta)
        this.bloom?.update?.()
        this.player?.update(delta)
        this.collisionDebug?.update?.()
        this.updateWaterEntrySound()
        this.updateBushSound(delta)
        this.updateTeleportZoneVisual()
        this.checkTeleportTrigger()
    }

    updateBushSound(deltaMs = this.experience.time.delta)
    {
        const playerPosition = this.player?.position
        if(!playerPosition || !this.bushes)
        {
            this.wasInsideBush = false
            return
        }

        const safeDeltaMs = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 16
        this.bushTriggerCooldownMs = Math.max(0, this.bushTriggerCooldownMs - safeDeltaMs)

        const isInsideBush = this.bushes.isPointInsideBush?.(playerPosition.x, playerPosition.z, this.player?.settings?.radius ?? 0.2) === true
        const playerVelocity = this.player?.velocity
        const horizontalSpeed = Number.isFinite(playerVelocity?.x) && Number.isFinite(playerVelocity?.z)
            ? Math.hypot(playerVelocity.x, playerVelocity.z)
            : 0
        const isMovingInBush = isInsideBush && horizontalSpeed > BUSH_SOUND_MOVE_SPEED_THRESHOLD

        if(isMovingInBush && this.bushTriggerCooldownMs <= 0)
        {
            const played = this.experience.sound?.playRandomBush?.({
                volume: 1,
                playbackRate: 1
            })
            if(played)
            {
                this.bushTriggerCooldownMs = BUSH_TRIGGER_COOLDOWN_MS
            }
        }

        this.wasInsideBush = isInsideBush
    }

    updateWaterEntrySound()
    {
        const playerY = this.player?.position?.y
        const playerHeight = this.player?.settings?.height
        const playerVelocity = this.player?.velocity
        const waterLevel = this.water?.state?.hauteurEau
        if(
            !Number.isFinite(playerY)
            || !Number.isFinite(playerHeight)
            || !Number.isFinite(waterLevel)
        )
        {
            return
        }

        const deltaMs = Number.isFinite(this.experience?.time?.delta) ? this.experience.time.delta : 16
        const playerBottomY = playerY - playerHeight
        const playerTopY = playerY + PLAYER_HEAD_TOP_OFFSET
        const terrainSableMaxY = this.mapModel?.getTerrainWaterlineSableMaxY?.() ?? Number.NEGATIVE_INFINITY
        const isBottomUnderWater = playerBottomY < (waterLevel - WATER_ENTRY_EPSILON)
        const isFullyUnderWater = playerTopY < (waterLevel - WATER_ENTRY_EPSILON)
        const isPartiallyUnderWater = isBottomUnderWater && !isFullyUnderWater
        const horizontalSpeed = Number.isFinite(playerVelocity?.x) && Number.isFinite(playerVelocity?.z)
            ? Math.hypot(playerVelocity.x, playerVelocity.z)
            : 0
        const isMovingInShallowWater = isPartiallyUnderWater && horizontalSpeed > SHALLOW_WATER_MOVE_SPEED_THRESHOLD
        const isAbovePlan = playerBottomY > (waterLevel + WATER_ENTRY_EPSILON)
        const isWalkingOnReliefAbovePlan = Boolean(this.player?.isOnGround)
            && isAbovePlan
            && horizontalSpeed > WALKING_GRASS_SPEED_THRESHOLD
        const isOnSandTintBand = playerBottomY <= (terrainSableMaxY + TERRAIN_SAND_BLEND_HEIGHT)

        if(isBottomUnderWater && !this.wasPlayerBottomUnderWater)
        {
            this.experience.sound?.play?.('waterSplash4')
        }

        if(isMovingInShallowWater)
        {
            this.shallowWaterSplashCooldownMs -= deltaMs
            if(this.shallowWaterSplashCooldownMs <= 0)
            {
                const splashKey = Math.random() < 0.75 ? 'waterSplash' : 'waterSplash2'
                this.experience.sound?.play?.(splashKey)
                this.shallowWaterSplashCooldownMs = THREE.MathUtils.randFloat(
                    SHALLOW_WATER_SPLASH_INTERVAL_MIN_MS,
                    SHALLOW_WATER_SPLASH_INTERVAL_MAX_MS
                )
            }
        }
        else
        {
            this.shallowWaterSplashCooldownMs = 0
        }

        const nextFootstepLoop = isWalkingOnReliefAbovePlan
            ? (isOnSandTintBand ? 'walkingSand' : 'walkingGrass')
            : null
        const footstepPlaybackRate = this.getFootstepPlaybackRate()
        this.syncFootstepLoop(nextFootstepLoop, footstepPlaybackRate)

        if(isFullyUnderWater)
        {
            if(!this.isUnderwaterLoopPlaying)
            {
                const didPlayLoop = this.experience.sound?.play?.('waterUnder')
                if(didPlayLoop)
                {
                    this.isUnderwaterLoopPlaying = true
                }
            }
        }
        else if(this.isUnderwaterLoopPlaying)
        {
            this.experience.sound?.stopChannel?.('underwater')
            this.isUnderwaterLoopPlaying = false
        }

        this.wasPlayerBottomUnderWater = isBottomUnderWater
    }

    setTeleportZone()
    {
        const recuperationBridgeZone = this.mapModel?.getBridgeTeleportZone?.({
            preferredBridge: 'cloneur_4'
        })
        const distributionBridgeZone = this.mapModel?.getBridgeTeleportZone?.({
            preferredBridge: 'cloneur_5'
        })

        const recuperationZone = recuperationBridgeZone ?? {
            x: -2.2,
            y: 0.08,
            z: 6,
            radius: 1.75
        }
        const distributionZone = distributionBridgeZone ?? {
            x: recuperationZone.x + 4.2,
            y: recuperationZone.y,
            z: recuperationZone.z - 2.4,
            radius: recuperationZone.radius
        }

        const areZonesOverlapping =
            Math.hypot(distributionZone.x - recuperationZone.x, distributionZone.z - recuperationZone.z)
            < (recuperationZone.radius + distributionZone.radius + 0.4)
        if(areZonesOverlapping)
        {
            distributionZone.x += (recuperationZone.radius + distributionZone.radius + 0.9)
            distributionZone.z += 0.75
        }

        this.teleportZones = [
            {
                ...recuperationZone,
                id: 'recuperation',
                targetScene: SceneEnum.RECUPERATION,
                colors: {
                    pad: '#5fb2ff',
                    padEmissive: '#173b63',
                    ring: '#57b9ff',
                    ringEmissive: '#1f4d73',
                    column: '#72d0ff',
                    light: '#79ccff'
                },
                pulseSpeed: 4.2,
                spinSpeed: 0.01,
                columnSpinSpeed: -0.003
            },
            {
                ...distributionZone,
                id: 'distribution',
                targetScene: SceneEnum.DISTRIBUTION,
                colors: {
                    pad: '#ff9e57',
                    padEmissive: '#5a2e11',
                    ring: '#ffb27a',
                    ringEmissive: '#6f3c16',
                    column: '#ffc28d',
                    light: '#ffb777'
                },
                pulseSpeed: 3.3,
                spinSpeed: -0.013,
                columnSpinSpeed: 0.0038
            }
        ]
        this.isTeleporting = false

        this.teleportEntries = []
        for(const zone of this.teleportZones)
        {
            const teleportGroup = new THREE.Group()
            teleportGroup.name = `__mapTeleportZone_${zone.id}`
            teleportGroup.position.set(zone.x, zone.y ?? 0.08, zone.z)

            const teleportPad = new THREE.Mesh(
                new THREE.CylinderGeometry(zone.radius * 0.86, zone.radius * 0.86, 0.06, 48),
                new THREE.MeshStandardMaterial({
                    color: zone.colors.pad,
                    emissive: zone.colors.padEmissive,
                    emissiveIntensity: 0.62,
                    roughness: 0.28,
                    metalness: 0.35
                })
            )
            teleportPad.position.y = 0.03
            teleportPad.name = `__mapTeleportPad_${zone.id}`

            const teleportRing = new THREE.Mesh(
                new THREE.TorusGeometry(zone.radius, 0.08, 12, 64),
                new THREE.MeshStandardMaterial({
                    color: zone.colors.ring,
                    emissive: zone.colors.ringEmissive,
                    emissiveIntensity: 0.85,
                    roughness: 0.35,
                    metalness: 0.15
                })
            )
            teleportRing.rotation.x = Math.PI * 0.5
            teleportRing.position.y = 0.09

            const teleportColumn = new THREE.Mesh(
                new THREE.CylinderGeometry(zone.radius * 0.36, zone.radius * 0.56, 2.2, 32, 1, true),
                new THREE.MeshBasicMaterial({
                    color: zone.colors.column,
                    transparent: true,
                    opacity: 0.23,
                    side: THREE.DoubleSide,
                    depthWrite: false
                })
            )
            teleportColumn.position.y = 1.12

            const teleportLight = new THREE.PointLight(zone.colors.light, 1.9, 10, 2)
            teleportLight.position.y = 1.2

            teleportGroup.add(teleportPad)
            teleportGroup.add(teleportRing)
            teleportGroup.add(teleportColumn)
            teleportGroup.add(teleportLight)
            this.experience.scene.add(teleportGroup)

            this.teleportEntries.push({
                zone,
                group: teleportGroup,
                pad: teleportPad,
                ring: teleportRing,
                column: teleportColumn,
                light: teleportLight
            })
        }
    }

    updateTeleportZoneVisual()
    {
        if(!Array.isArray(this.teleportEntries) || this.teleportEntries.length === 0 || this.isTeleporting)
        {
            return
        }

        const elapsed = this.experience.time.elapsed * 0.001
        for(const entry of this.teleportEntries)
        {
            const pulse = 0.72 + (Math.sin(elapsed * (entry.zone.pulseSpeed ?? 4.2)) * 0.26)

            entry.pad.material.emissiveIntensity = 0.5 + (pulse * 0.35)
            entry.ring.material.emissiveIntensity = pulse
            entry.ring.rotation.z += entry.zone.spinSpeed ?? 0.01

            entry.column.material.opacity = 0.18 + (Math.sin(elapsed * 2.3) * 0.07)
            entry.column.rotation.y += entry.zone.columnSpinSpeed ?? -0.003

            entry.light.intensity = 1.4 + (Math.sin(elapsed * 5) * 0.55)
        }
    }

    checkTeleportTrigger()
    {
        if(this.isTeleporting || !this.player?.position || !Array.isArray(this.teleportZones))
        {
            return
        }

        for(const zone of this.teleportZones)
        {
            const dx = this.player.position.x - zone.x
            const dz = this.player.position.z - zone.z
            const distanceSq = (dx * dx) + (dz * dz)
            const radiusSq = zone.radius * zone.radius
            if(distanceSq > radiusSq)
            {
                continue
            }

            this.isTeleporting = true
            this.experience.sceneManager?.switchTo?.(zone.targetScene ?? SceneEnum.RECUPERATION)
            return
        }
    }

    setVegetationDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.vegetationDebugFolder = this.debug.addFolder('🌿 Vegetation', { expanded: false })
        this.grassDebugFolder = this.debug.addFolder('Herbe', {
            parent: this.vegetationDebugFolder,
            expanded: false
        })
        this.bushDebugFolder = this.debug.addFolder('Buisson', {
            parent: this.vegetationDebugFolder,
            expanded: false
        })

        this.grassDebugState = {
            etatHerbe: 'Systeme herbe a venir'
        }
        this.debug.addBinding(this.grassDebugFolder, this.grassDebugState, 'etatHerbe', {
            label: 'Etat',
            readonly: true
        })

        this.bushes?.setDebug?.({
            parentFolder: this.bushDebugFolder
        })
    }

    destroy()
    {
        this.resources.off(this.readyEventName)
        this.experience.sound?.stopChannel?.('underwater')
        this.experience.sound?.stopChannel?.('footsteps')
        this.isUnderwaterLoopPlaying = false
        this.activeFootstepLoop = null
        this.activeFootstepPlaybackRate = 1
        this.wasPlayerBottomUnderWater = false

        if(this.player)
        {
            this.player.destroy()
            this.player = null
        }

        this.vegetationDebugFolder?.dispose?.()
        this.vegetationDebugFolder = null
        this.grassDebugFolder = null
        this.bushDebugFolder = null
        this.grassDebugState = null

        if(this.water)
        {
            this.water.destroy?.()
            this.water = null
        }

        if(this.visibilityDebug)
        {
            this.visibilityDebug.destroy?.()
            this.visibilityDebug = null
        }

        if(this.mapModel)
        {
            this.mapModel.destroy?.()
            this.mapModel = null
        }

        if(this.bushes)
        {
            this.bushes.destroy?.()
            this.bushes = null
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

        if(this.clouds)
        {
            this.clouds.destroy?.()
            this.clouds = null
        }

        if(this.light)
        {
            this.light.destroy?.()
            this.light = null
        }

        if(Array.isArray(this.teleportEntries))
        {
            for(const entry of this.teleportEntries)
            {
                this.experience.scene.remove(entry.group)
                entry.pad.geometry.dispose()
                entry.pad.material.dispose()
                entry.ring.geometry.dispose()
                entry.ring.material.dispose()
                entry.column.geometry.dispose()
                entry.column.material.dispose()
            }
            this.teleportEntries = null
        }

        this.teleportZones = null

        this.isSetUp = false
    }

    getFootstepPlaybackRate()
    {
        const speedMultiplier = this.player?.settings?.speedMultiplier
        if(!Number.isFinite(speedMultiplier))
        {
            return 1
        }

        return THREE.MathUtils.clamp(speedMultiplier * 1.5, 0.2, 8)
    }

    syncFootstepLoop(nextSoundName, playbackRate = 1)
    {
        const normalizedNext = typeof nextSoundName === 'string' && nextSoundName !== ''
            ? nextSoundName
            : null
        const normalizedRate = Number.isFinite(playbackRate)
            ? Math.max(0.05, playbackRate)
            : 1
        if(
            this.activeFootstepLoop === normalizedNext
            && Math.abs((this.activeFootstepPlaybackRate ?? 1) - normalizedRate) <= FOOTSTEP_RATE_EPSILON
        )
        {
            return
        }

        this.experience.sound?.stopChannel?.('footsteps')
        this.activeFootstepLoop = null
        this.activeFootstepPlaybackRate = 1

        if(!normalizedNext)
        {
            return
        }

        const didPlay = this.experience.sound?.play?.(normalizedNext, {
            playbackRate: normalizedRate
        })
        if(didPlay)
        {
            this.activeFootstepLoop = normalizedNext
            this.activeFootstepPlaybackRate = normalizedRate
        }
    }
}
