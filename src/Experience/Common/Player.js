import * as THREE from 'three'
import Experience from '../Experience.js'

const UP_AXIS = new THREE.Vector3(0, 1, 0)
const GROUND_IGNORED_TOKENS = ['building', 'balcon', 'window', 'fenetre', 'fenêtre']

export default class Player
{
    constructor({
        groundHeight = 0,
        boundaryRadius = 36,
        collisionBoxes = [],
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
        this.collisionBoxes = Array.isArray(collisionBoxes) ? collisionBoxes : []
        this.collisionMeshes = Array.isArray(collisionMeshes) ? collisionMeshes : []
        this.groundMeshes = Array.isArray(groundMeshes) && groundMeshes.length > 0
            ? groundMeshes
            : this.collisionMeshes

        this.settings = {
            height: 1.45,
            radius: 0.3,
            stepHeight: 0.58,
            walkSpeed: 4.2,
            sprintSpeed: 7,
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
        this.collisionDebugState = {
            hit: false,
            rays: [],
            hitPoint: null,
            hitNormal: null
        }
        this.groundRaycaster = new THREE.Raycaster()
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

        this.setCamera()
        this.setPointerLock()
        this.setDebug()
    }

    createSpawnPosition(spawnPosition)
    {
        const defaultY = this.groundHeight + this.settings.height

        if(spawnPosition instanceof THREE.Vector3)
        {
            return spawnPosition.clone()
        }

        if(spawnPosition && typeof spawnPosition === 'object')
        {
            return new THREE.Vector3(
                spawnPosition.x ?? 0,
                spawnPosition.y ?? defaultY,
                spawnPosition.z ?? 6
            )
        }

        return new THREE.Vector3(0, defaultY, 6)
    }

    setCamera()
    {
        this.camera.rotation.order = 'YXZ'
        this.camera.position.copy(this.position)
        this.camera.rotation.set(this.pitch, this.yaw, 0)
        this.cameraSmoothPosition.copy(this.position)
        this.cameraSmoothYaw = this.yaw
        this.cameraSmoothPitch = this.pitch
        this.cameraSmoothRoll = 0
    }

    setPointerLock()
    {
        this.onCanvasClick = (event) =>
        {
            if(event?.target !== this.canvas)
            {
                return
            }

            if(!this.inputs?.isPointerLocked?.(this.canvas))
            {
                this.inputs?.requestPointerLock?.(this.canvas)
            }
        }

        this.onPointerLockChange = ({ element } = {}) =>
        {
            this.isPointerLocked = element === this.canvas
            document.body.classList.toggle('is-pointer-locked', this.isPointerLocked)
        }

        this.onMouseMove = (event) =>
        {
            if(!this.isPointerLocked)
            {
                return
            }

            this.yaw -= event.movementX * this.settings.lookSensitivity
            this.pitch -= event.movementY * this.settings.lookSensitivity
            this.pitch = THREE.MathUtils.clamp(this.pitch, this.settings.minPitch, this.settings.maxPitch)
        }

        this.inputs?.on?.('click.player', this.onCanvasClick)
        this.inputs?.on?.('pointerlockchange.player', this.onPointerLockChange)
        this.inputs?.on?.('mousemove.player', this.onMouseMove)
        this.isPointerLocked = this.inputs?.isPointerLocked?.(this.canvas) || false
        document.body.classList.toggle('is-pointer-locked', this.isPointerLocked)
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('🕹 Player', { expanded: true })
        this.debug.addBinding(this.debugFolder, this.settings, 'height', {
            label: 'height',
            min: 0.7,
            max: 2.2,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.settings, 'radius', {
            label: 'radius',
            min: 0.1,
            max: 0.6,
            step: 0.005
        })
        this.debug.addBinding(this.debugFolder, this.settings, 'stepHeight', {
            label: 'stepHeight',
            min: 0.05,
            max: 1.2,
            step: 0.01
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'headBobAmplitude', {
            label: 'bobAmp',
            min: 0,
            max: 0.08,
            step: 0.001
        })
        this.debug.addBinding(this.debugFolder, this.settings, 'headBobFrequency', {
            label: 'bobFreq',
            min: 0.4,
            max: 4,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.settings, 'headBobSmoothing', {
            label: 'bobSmooth',
            min: 1,
            max: 30,
            step: 0.1
        })
        this.debug.addBinding(this.debugFolder, this.settings, 'headBobRollAmplitude', {
            label: 'bobRoll',
            min: 0,
            max: 0.03,
            step: 0.0005
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'cameraSmoothEnabled', {
            label: 'camSmooth'
        })
        this.debug.addBinding(this.debugFolder, this.settings, 'cameraPositionSmooth', {
            label: 'camPosSmooth',
            min: 1,
            max: 60,
            step: 0.1
        })
        this.debug.addBinding(this.debugFolder, this.settings, 'cameraRotationSmooth', {
            label: 'camRotSmooth',
            min: 1,
            max: 80,
            step: 0.1
        })
    }

    update(delta)
    {
        const deltaSeconds = Math.min(delta, 50) * 0.001

        this.updateMoveDirection()
        this.updateVelocity(deltaSeconds)
        this.updatePosition(deltaSeconds)
        this.updateCameraTransform(deltaSeconds)
    }

    updateMoveDirection()
    {
        const forwardAxis = this.inputs.getAxis(
            ['KeyS', 'ArrowDown'],
            ['KeyW', 'KeyZ', 'ArrowUp']
        )
        const sideAxis = this.inputs.getAxis(
            ['KeyA', 'KeyQ', 'ArrowLeft'],
            ['KeyD', 'ArrowRight']
        )

        this.moveDirection.set(sideAxis, 0, forwardAxis)
        if(this.moveDirection.lengthSq() > 1)
        {
            this.moveDirection.normalize()
        }
    }

    updateVelocity(deltaSeconds)
    {
        const isSprinting = this.inputs.isPressed('ShiftLeft', 'ShiftRight')
        const currentSpeed = isSprinting ? this.settings.sprintSpeed : this.settings.walkSpeed
        const movementEnabled = this.isPointerLocked

        this.forwardDirection.set(0, 0, -1).applyAxisAngle(UP_AXIS, this.yaw)
        this.rightDirection.set(1, 0, 0).applyAxisAngle(UP_AXIS, this.yaw)

        const targetVelocity = new THREE.Vector3()
        if(movementEnabled)
        {
            targetVelocity
                .addScaledVector(this.forwardDirection, this.moveDirection.z * currentSpeed)
                .addScaledVector(this.rightDirection, this.moveDirection.x * currentSpeed)
        }

        const interpolation = 1 - Math.exp(-this.settings.acceleration * deltaSeconds)
        this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVelocity.x, interpolation)
        this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVelocity.z, interpolation)

        const jumpPressed = this.inputs.isPressed('Space')
        if(movementEnabled && this.isOnGround && jumpPressed)
        {
            this.velocity.y = this.settings.jumpSpeed
            this.isOnGround = false
        }

        this.velocity.y -= this.settings.gravity * deltaSeconds
    }

    updatePosition(deltaSeconds)
    {
        this.previousPosition.copy(this.position)
        this.position.addScaledVector(this.velocity, deltaSeconds)

        this.resolveCollisions()
        this.resolveGroundCollision()

        const horizontalDistance = Math.hypot(this.position.x, this.position.z)
        if(horizontalDistance > this.boundaryRadius)
        {
            const clampRatio = this.boundaryRadius / horizontalDistance
            this.position.x *= clampRatio
            this.position.z *= clampRatio
            this.velocity.x = 0
            this.velocity.z = 0
        }
    }

    resolveGroundCollision()
    {
        const fallbackGroundY = this.groundHeight + this.settings.height
        let resolvedGroundY = fallbackGroundY

        if(this.groundMeshes.length > 0)
        {
            const rayOrigin = new THREE.Vector3(this.position.x, this.position.y + 2, this.position.z)
            this.groundRaycaster.set(rayOrigin, new THREE.Vector3(0, -1, 0))
            this.groundRaycaster.near = 0
            this.groundRaycaster.far = 20

            const hits = this.groundRaycaster.intersectObjects(this.groundMeshes, false)
            for(const hit of hits)
            {
                if(this.isGroundIgnoredMesh(hit.object))
                {
                    continue
                }

                if(!hit.face)
                {
                    continue
                }

                this.worldNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
                if(this.worldNormal.y < 0.45)
                {
                    continue
                }

                const candidateGroundY = hit.point.y + this.settings.height
                const stepDelta = candidateGroundY - this.position.y

                // Reject "ground" that is too high (e.g. roofs/balconies near walls),
                // then keep scanning lower intersections.
                if(stepDelta > this.settings.stepHeight)
                {
                    continue
                }

                resolvedGroundY = Math.max(resolvedGroundY, candidateGroundY)
                break
            }
        }

        if(this.position.y <= resolvedGroundY + 0.08)
        {
            this.position.y = resolvedGroundY
            this.velocity.y = 0
            this.isOnGround = true
            return
        }

        this.isOnGround = false
    }

    isGroundIgnoredMesh(object)
    {
        return this.hasNameInHierarchy(object, GROUND_IGNORED_TOKENS)
    }

    hasNameInHierarchy(object, tokens = [])
    {
        let current = object

        while(current)
        {
            const name = (current.name || '').toLowerCase()
            for(const token of tokens)
            {
                if(name.includes(token))
                {
                    return true
                }
            }
            current = current.parent
        }

        return false
    }

    resolveCollisions()
    {
        this.resolveMeshCollisions()

        if(this.collisionBoxes.length === 0)
        {
            return
        }

        const radius = this.settings.radius
        const radiusSq = radius * radius
        const feetY = this.position.y - this.settings.height + 0.05
        const headY = this.position.y - 0.1

        for(let iteration = 0; iteration < 3; iteration++)
        {
            let hasCollision = false

            for(const box of this.collisionBoxes)
            {
                if(!box)
                {
                    continue
                }

                if(box.max.y <= feetY || box.min.y >= headY)
                {
                    continue
                }

                const closestX = THREE.MathUtils.clamp(this.position.x, box.min.x, box.max.x)
                const closestZ = THREE.MathUtils.clamp(this.position.z, box.min.z, box.max.z)

                let dx = this.position.x - closestX
                let dz = this.position.z - closestZ
                let distanceSq = (dx * dx) + (dz * dz)

                if(distanceSq >= radiusSq)
                {
                    continue
                }

                hasCollision = true

                if(distanceSq < 1e-8)
                {
                    const distanceToMinX = Math.abs(this.position.x - box.min.x)
                    const distanceToMaxX = Math.abs(box.max.x - this.position.x)
                    const distanceToMinZ = Math.abs(this.position.z - box.min.z)
                    const distanceToMaxZ = Math.abs(box.max.z - this.position.z)

                    const minDistance = Math.min(distanceToMinX, distanceToMaxX, distanceToMinZ, distanceToMaxZ)

                    if(minDistance === distanceToMinX)
                    {
                        dx = -1
                        dz = 0
                    }
                    else if(minDistance === distanceToMaxX)
                    {
                        dx = 1
                        dz = 0
                    }
                    else if(minDistance === distanceToMinZ)
                    {
                        dx = 0
                        dz = -1
                    }
                    else
                    {
                        dx = 0
                        dz = 1
                    }

                    distanceSq = 1
                }

                const distance = Math.sqrt(distanceSq)
                const normalX = dx / distance
                const normalZ = dz / distance
                const penetration = radius - distance

                this.position.x += normalX * penetration
                this.position.z += normalZ * penetration

                const projectedVelocity = (this.velocity.x * normalX) + (this.velocity.z * normalZ)
                if(projectedVelocity < 0)
                {
                    this.velocity.x -= projectedVelocity * normalX
                    this.velocity.z -= projectedVelocity * normalZ
                }
            }

            if(!hasCollision)
            {
                break
            }
        }
    }

    resolveMeshCollisions()
    {
        const debugState = {
            hit: false,
            rays: [],
            hitPoint: null,
            hitNormal: null
        }

        if(this.collisionMeshes.length === 0)
        {
            this.collisionDebugState = debugState
            return
        }

        this.collisionDirection
            .set(
                this.position.x - this.previousPosition.x,
                0,
                this.position.z - this.previousPosition.z
            )

        const travelDistance = this.collisionDirection.length()
        if(travelDistance < 1e-5)
        {
            return
        }

        this.collisionDirection.multiplyScalar(1 / travelDistance)
        const raycastFar = travelDistance + this.settings.radius
        const feetY = this.position.y - this.settings.height
        const sampleHeights = [feetY + 0.35, feetY + 0.9, this.position.y - 0.2]

        let hasHit = false

        for(const sampleY of sampleHeights)
        {
            this.raycastOrigin.set(this.previousPosition.x, sampleY, this.previousPosition.z)
            const rayEnd = this.raycastOrigin.clone().addScaledVector(this.collisionDirection, raycastFar)
            debugState.rays.push({
                origin: this.raycastOrigin.clone(),
                end: rayEnd
            })

            this.collisionRaycaster.set(this.raycastOrigin, this.collisionDirection)
            this.collisionRaycaster.near = 0
            this.collisionRaycaster.far = raycastFar

            const hits = this.collisionRaycaster.intersectObjects(this.collisionMeshes, false)
            for(const hit of hits)
            {
                if(!hit.face)
                {
                    continue
                }

                this.worldNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
                // Ignore floor-like slopes so bridges/fountain tops don't behave like walls.
                if(this.worldNormal.y > 0.25)
                {
                    continue
                }

                hasHit = true
                debugState.hit = true
                debugState.hitPoint = hit.point.clone()
                debugState.hitNormal = this.worldNormal.clone()
                break
            }

            if(hasHit)
            {
                break
            }
        }

        if(!hasHit)
        {
            this.collisionDebugState = debugState
            return
        }

        this.position.x = this.previousPosition.x
        this.position.z = this.previousPosition.z
        this.velocity.x = 0
        this.velocity.z = 0
        this.collisionDebugState = debugState
    }

    getCollisionDebugState()
    {
        return this.collisionDebugState
    }

    updateCameraTransform(deltaSeconds)
    {
        const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z)
        const normalizedSpeed = THREE.MathUtils.clamp(horizontalSpeed / this.settings.walkSpeed, 0, 1.4)
        const shouldBob = this.isOnGround && normalizedSpeed > 0.08 && this.isPointerLocked

        let targetBobOffset = 0
        if(shouldBob)
        {
            this.headBobPhase += deltaSeconds * Math.PI * 2 * this.settings.headBobFrequency * normalizedSpeed
            targetBobOffset = Math.sin(this.headBobPhase) * this.settings.headBobAmplitude * normalizedSpeed
        }

        const bobLerp = 1 - Math.exp(-this.settings.headBobSmoothing * deltaSeconds)
        this.headBobOffset = THREE.MathUtils.lerp(this.headBobOffset, targetBobOffset, bobLerp)

        const rollOffset = shouldBob
            ? Math.sin(this.headBobPhase + (Math.PI * 0.5)) * this.settings.headBobRollAmplitude * normalizedSpeed
            : 0

        const targetCameraPosition = new THREE.Vector3(
            this.position.x,
            this.position.y + this.headBobOffset,
            this.position.z
        )

        if(this.settings.cameraSmoothEnabled)
        {
            const positionLerp = 1 - Math.exp(-this.settings.cameraPositionSmooth * deltaSeconds)
            const rotationLerp = 1 - Math.exp(-this.settings.cameraRotationSmooth * deltaSeconds)

            this.cameraSmoothPosition.lerp(targetCameraPosition, positionLerp)
            this.cameraSmoothYaw = this.interpolateAngle(this.cameraSmoothYaw, this.yaw, rotationLerp)
            this.cameraSmoothPitch = THREE.MathUtils.lerp(this.cameraSmoothPitch, this.pitch, rotationLerp)
            this.cameraSmoothRoll = THREE.MathUtils.lerp(this.cameraSmoothRoll, rollOffset, rotationLerp)
        }
        else
        {
            this.cameraSmoothPosition.copy(targetCameraPosition)
            this.cameraSmoothYaw = this.yaw
            this.cameraSmoothPitch = this.pitch
            this.cameraSmoothRoll = rollOffset
        }

        this.camera.position.copy(this.cameraSmoothPosition)
        this.camera.rotation.set(this.cameraSmoothPitch, this.cameraSmoothYaw, this.cameraSmoothRoll)
    }

    interpolateAngle(current, target, interpolation)
    {
        const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
        return current + (delta * interpolation)
    }

    destroy()
    {
        this.inputs?.off?.('click.player')
        this.inputs?.off?.('pointerlockchange.player')
        this.inputs?.off?.('mousemove.player')

        if(this.inputs?.isPointerLocked?.(this.canvas))
        {
            this.inputs?.exitPointerLock?.()
        }

        document.body.classList.remove('is-pointer-locked')
        this.debugFolder?.dispose?.()
    }
}
