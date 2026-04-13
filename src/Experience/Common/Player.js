import * as THREE from 'three'
import Experience from '../Experience.js'
import InputController from '../Utils/InputController.js'

const UP_AXIS = new THREE.Vector3(0, 1, 0)

export default class Player
{
    constructor({
        groundHeight = 0,
        boundaryRadius = 36,
        spawnPosition = null,
        spawnYaw = 0,
        spawnPitch = 0
    } = {})
    {
        this.experience = new Experience()
        this.camera = this.experience.camera.instance
        this.canvas = this.experience.canvas

        this.groundHeight = groundHeight
        this.boundaryRadius = boundaryRadius

        this.settings = {
            height: 1.65,
            walkSpeed: 4.2,
            sprintSpeed: 7,
            acceleration: 18,
            gravity: 24,
            jumpSpeed: 8.4,
            lookSensitivity: 0.0022,
            minPitch: -Math.PI * 0.49,
            maxPitch: Math.PI * 0.49
        }

        this.input = new InputController()
        this.position = this.createSpawnPosition(spawnPosition)
        this.velocity = new THREE.Vector3()
        this.moveDirection = new THREE.Vector3()
        this.forwardDirection = new THREE.Vector3()
        this.rightDirection = new THREE.Vector3()

        this.yaw = spawnYaw
        this.pitch = spawnPitch
        this.isOnGround = true
        this.wasJumpPressed = false
        this.isPointerLocked = false

        this.setCamera()
        this.setPointerLock()
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
    }

    setPointerLock()
    {
        this.onCanvasClick = () =>
        {
            if(document.pointerLockElement !== this.canvas)
            {
                this.canvas.requestPointerLock?.()
            }
        }

        this.onPointerLockChange = () =>
        {
            this.isPointerLocked = document.pointerLockElement === this.canvas
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

        this.canvas.addEventListener('click', this.onCanvasClick)
        document.addEventListener('pointerlockchange', this.onPointerLockChange)
        document.addEventListener('mousemove', this.onMouseMove)
    }

    update(delta)
    {
        if(this.experience.dialogueManager?.isRunning?.())
        {
            return
        }

        const deltaSeconds = Math.min(delta, 50) * 0.001

        this.updateMoveDirection()
        this.updateVelocity(deltaSeconds)
        this.updatePosition(deltaSeconds)
        this.updateCameraTransform()
    }

    updateMoveDirection()
    {
        const forwardAxis = this.input.getAxis(
            ['KeyS', 'ArrowDown'],
            ['KeyW', 'KeyZ', 'ArrowUp']
        )
        const sideAxis = this.input.getAxis(
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
        const isSprinting = this.input.isPressed('ShiftLeft', 'ShiftRight')
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

        const jumpPressed = this.input.isPressed('Space')
        if(movementEnabled && this.isOnGround && jumpPressed && !this.wasJumpPressed)
        {
            this.velocity.y = this.settings.jumpSpeed
            this.isOnGround = false
        }
        this.wasJumpPressed = jumpPressed

        this.velocity.y -= this.settings.gravity * deltaSeconds
    }

    updatePosition(deltaSeconds)
    {
        this.position.addScaledVector(this.velocity, deltaSeconds)

        const minY = this.groundHeight + this.settings.height
        if(this.position.y <= minY)
        {
            this.position.y = minY
            this.velocity.y = 0
            this.isOnGround = true
        }
        else
        {
            this.isOnGround = false
        }

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

    updateCameraTransform()
    {
        this.camera.position.copy(this.position)
        this.camera.rotation.set(this.pitch, this.yaw, 0)
    }

    destroy()
    {
        this.input.destroy()
        this.canvas.removeEventListener('click', this.onCanvasClick)
        document.removeEventListener('pointerlockchange', this.onPointerLockChange)
        document.removeEventListener('mousemove', this.onMouseMove)

        if(document.pointerLockElement === this.canvas)
        {
            document.exitPointerLock()
        }

        document.body.classList.remove('is-pointer-locked')
    }
}
