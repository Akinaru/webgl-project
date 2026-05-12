import * as THREE from 'three'
import Experience from '../../Experience.js'
import SpatialBoxOctree from '../../Utils/SpatialBoxOctree.js'
import * as InputBindingsConstants from '../../Inputs/InputBindings.constants.js'
import * as PlayerConstants from './Player.constants.js'

import * as setupMethods from './Player/setup.js'
import * as movementMethods from './Player/movement.js'
import * as lifecycleMethods from './Player/lifecycle.js'
export default class Player
{
/**
 * Initialise le contrôleur joueur: caméra FPS, collisions, input et paramètres de locomotion.
 */
constructor({
    groundHeight = 0,
    boundaryRadius = 36,
    boundaryBox = null,
    collisionBoxes = [],
    useBoxCollisionResolution = true,
    useMeshCollisionRaycast = true,
    collisionMeshes = [],
    groundMeshes = [],
    spawnPosition = null,
    spawnYaw = 0,
    spawnPitch = 0
} = {})
{
    this.experience = new Experience()
    this.camera = this.experience.camera.instance
    this.canvas = this.experience.canvas
    this.inputs = this.experience.inputs
    this.debug = this.experience.debug

    this.groundHeight = groundHeight
    this.boundaryRadius = boundaryRadius
    this.boundaryBox = this.normalizeBoundaryBox(boundaryBox)
    this.collisionBoxes = Array.isArray(collisionBoxes) ? collisionBoxes : []
    this.useBoxCollisionResolution = Boolean(useBoxCollisionResolution)
    this.useMeshCollisionRaycast = Boolean(useMeshCollisionRaycast)
    this.collisionMeshes = Array.isArray(collisionMeshes) ? collisionMeshes : []
    this.groundMeshes = Array.isArray(groundMeshes) && groundMeshes.length > 0
        ? groundMeshes
        : this.collisionMeshes
    this.ceilingMeshes = this.collisionMeshes.length > 0
        ? this.collisionMeshes
        : this.groundMeshes

    this.settings = {
        height: 0.8,
        radius: 0.245,
        stepHeight: 0.5,
        walkSpeed: 4.2,
        sprintSpeed: 7,
        speedMultiplier: 0.7,
        acceleration: 18,
        gravity: 24,
        jumpSpeed: 8.4,
        headBobAmplitude: 0.035,
        headBobFrequency: 1.7,
        headBobSmoothing: 12,
        headBobRollAmplitude: 0.006,
        cameraSmoothEnabled: true,
        cameraPositionSmooth: 20,
        cameraRotationSmooth: 26,
        lookSensitivity: 0.0022,
        minPitch: -Math.PI * 0.49,
        maxPitch: Math.PI * 0.49
    }

    this.position = this.createSpawnPosition(spawnPosition)
    this.velocity = new THREE.Vector3()
    this.moveDirection = new THREE.Vector3()
    this.forwardDirection = new THREE.Vector3()
    this.rightDirection = new THREE.Vector3()
    this.previousPosition = this.position.clone()
    this.collisionRaycaster = new THREE.Raycaster()
    this.collisionDirection = new THREE.Vector3()
    this.raycastOrigin = new THREE.Vector3()
    this.worldNormal = new THREE.Vector3()
    this.collisionQueryBox = new THREE.Box3()
    this.collisionOctree = new SpatialBoxOctree()
    this.collisionOctreePayloads = []
    this.collisionOctreeVersion = {
        length: -1,
        first: null,
        mid: null,
        last: null
    }
    this.collisionDebugState = {
        hit: false,
        rays: [],
        hitPoint: null,
        hitNormal: null,
        octreeQueryBox: null,
        octreeCandidateBoxes: [],
        octreeNodeBounds: []
    }
    this.groundRaycaster = new THREE.Raycaster()
    this.ceilingRaycaster = new THREE.Raycaster()
    this.ceilingRayDirection = new THREE.Vector3(0, 1, 0)
    this.headBobPhase = 0
    this.headBobOffset = 0
    this.cameraSmoothPosition = this.position.clone()
    this.cameraSmoothYaw = 0
    this.cameraSmoothPitch = 0
    this.cameraSmoothRoll = 0

    this.yaw = spawnYaw
    this.pitch = spawnPitch
    this.isOnGround = true
    this.isPointerLocked = false
    this.isLookEnabled = true
    this.currentGroundObject = null

    this.setCamera()
    this.setPointerLock()
    this.setDebug()
}

}

Object.assign(
    Player.prototype,
    setupMethods,
    movementMethods,
    lifecycleMethods
)
