import * as THREE from 'three'
import Experience from '../../Experience.js'
import BloomRailSystem from '../Rails/BloomRailSystem.js'
import * as BloomConstants from './Bloom.constants.js'
import * as setupMethods from './Bloom/setup.js'
import * as motionMethods from './Bloom/motion.js'
import * as lifecycleMethods from './Bloom/lifecycle.js'
export default class Bloom
{
/**
 * Initialise Bloom: ressources, rails, état de mouvement, animation et debug.
 */
constructor({
    motion = {},
    follow = {},
    rails = {}
} = {})
{
    this.experience = new Experience()
    this.scene = this.experience.scene
    this.resources = this.experience.resources
    this.time = this.experience.time
    this.debug = this.experience.debug

    this.resource = this.resources.items.bloomModel
    this.bloomColorTexture = this.resources.items.bloomColorTexture ?? null
    this.bloomColorTexture2 = this.resources.items.bloomColorTexture2 ?? null
    this.bloomTransmissionTexture = this.resources.items.bloomTransmissionTexture ?? null
    this.bloomTransmissionTexture2 = this.resources.items.bloomTransmissionTexture2 ?? null
    this.bloomReflectionEnvTexture = this.resources.items.bloomReflectionEnvTexture ?? null

    this.tuning = {
        facingOffsetRadians: BloomConstants.BLOOM_FACING_OFFSET_RADIANS,
        uvZoom: BloomConstants.BLOOM_UV_ZOOM,
        lookTurnSpeed: rails.lookTurnSpeed ?? 11,
        envMapIntensity: 1,
        roughness: 0.25,
        metalness: 0.05,
        transmission: 1,
        thickness: 0.25,
        ior: 1.18,
        specularIntensity: 1,
        opacity: 1
    }

    this.tmpQuaternion = new THREE.Quaternion()
    this.direction = new THREE.Vector3()
    this.movementDelta = new THREE.Vector3()
    this.movementDirection = new THREE.Vector3(0, 0, 1)
    this.lastFacingDirection = new THREE.Vector3(0, 0, 1)
    this.followTargetPosition = new THREE.Vector3()
    this.previousAnchorPosition = new THREE.Vector3()
    this.railAnchorPosition = new THREE.Vector3()

    this.scaleState = {
        visualScale: 0.46
    }

    this.motion = {
        center: motion.center instanceof THREE.Vector3
            ? motion.center.clone()
            : new THREE.Vector3(motion.center?.x ?? 0, motion.center?.y ?? 0, motion.center?.z ?? -6),
        radius: motion.radius ?? 3.05,
        turnSpeed: motion.turnSpeed ?? 5,
        walkFrequency: motion.walkFrequency ?? 0.52,
        walkFrequencySpeedInfluence: motion.walkFrequencySpeedInfluence ?? 0.29,
        bobAmplitude: motion.bobAmplitude ?? 0.035,
        swingIntensity: motion.swingIntensity ?? 1,
        heightOffset: motion.heightOffset ?? 0
    }

    this.follow = {
        target: follow.target ?? null,
        getTargetPosition: typeof follow.getTargetPosition === 'function' ? follow.getTargetPosition : null,
        enabled: Boolean(follow.target || follow.getTargetPosition),
        groundMeshes: Array.isArray(follow.groundMeshes) ? follow.groundMeshes : [],
        groundMaxSnapUp: follow.groundMaxSnapUp ?? 0.65
    }
    this.followOverride = {
        nodeId: null,
        lockToNode: false,
        arrivalDistance: 0.08
    }
    this.animation = {
        mixer: null,
        action: null,
        clips: [],
        activeClipName: '',
        play: true,
        speed: 1,
        loop: true
    }

    this.rails = new BloomRailSystem({
        scene: this.scene,
        rails: rails.lines ?? rails.rails ?? [],
        speed: rails.speed ?? 4.6,
        railSwitchDistance: rails.railSwitchDistance ?? 1.05,
        endpointSwitchDistance: rails.endpointSwitchDistance ?? 1.6,
        helperPointRadius: rails.helperPointRadius ?? 0.08,
        showHelpers: rails.showHelpers ?? true
    })

    this.railEditor = {
        addPointAtPlayer: () => this.addRailPointFromTarget(),
        startNewLineAtPlayer: () => this.startRailLineFromTarget(),
        clearLines: () => this.rails.clearRails(),
        exportLinesToConsole: () => this.rails.logRailsToConsole()
    }

    this.groundRaycaster = new THREE.Raycaster()
    this.groundNormal = new THREE.Vector3()

    this.locomotionSpeed = 0
    this.walkCyclePhase = 0
    this.armNodes = []
    this.armAnimationPairs = []
    this.tmpArmDeltaQuaternion = new THREE.Quaternion()
    this.tmpArmInverseBaseQuaternion = new THREE.Quaternion()

    if(this.resource?.scene)
    {
        this.setModel()
        this.setArmRig()
    }
    else
    {
        this.setFallback()
    }

    if(this.model)
    {
        this.spawnOnRailNodeIfAvailable()
        this.railAnchorPosition.copy(this.model.position)
        this.railAnchorPosition.y -= this.baseY
        this.previousAnchorPosition.copy(this.railAnchorPosition)
    }

    this.setDebug()
}

}

Object.assign(
    Bloom.prototype,
    setupMethods,
    motionMethods,
    lifecycleMethods
)
