import * as THREE from 'three'
import Experience from '../../../Experience.js'
import SpatialBoxOctree from '../../../Utils/SpatialBoxOctree.js'
import * as InputBindingsConstants from '../../../Inputs/InputBindings.constants.js'
import * as PlayerConstants from '../Player.constants.js'

/**
 * Boucle runtime du joueur (inputs, physique simple, collisions, caméra).
 */
export function update(delta)
{
    const deltaSeconds = Math.min(delta, 50) * 0.001

    this.updateMoveDirection()
    this.updateVelocity(deltaSeconds)
    this.updatePosition(deltaSeconds)
    this.updateCameraTransform(deltaSeconds)
}


/**
 * Convertit les inputs en direction de déplacement locale.
 */
export function updateMoveDirection()
{
    const forwardAxis = this.inputs.getActionAxis(
        InputBindingsConstants.INPUT_ACTION.MOVE_BACKWARD,
        InputBindingsConstants.INPUT_ACTION.MOVE_FORWARD
    )
    const sideAxis = this.inputs.getActionAxis(
        InputBindingsConstants.INPUT_ACTION.MOVE_LEFT,
        InputBindingsConstants.INPUT_ACTION.MOVE_RIGHT
    )

    this.moveDirection.set(sideAxis, 0, forwardAxis)
    if(this.moveDirection.lengthSq() > 1)
    {
        this.moveDirection.normalize()
    }
}


/**
 * Met à jour la vitesse avec accélération, sprint, gravité et jump.
 */
export function updateVelocity(deltaSeconds)
{
    const isSprinting = this.inputs.isPressed('ShiftLeft', 'ShiftRight')
    const speedMultiplier = Math.max(0, this.settings.speedMultiplier ?? 1)
    const currentSpeed = (isSprinting ? this.settings.sprintSpeed : this.settings.walkSpeed) * speedMultiplier
    const movementEnabled = this.isPointerLocked

    this.forwardDirection.set(0, 0, -1).applyAxisAngle(PlayerConstants.UP_AXIS, this.yaw)
    this.rightDirection.set(1, 0, 0).applyAxisAngle(PlayerConstants.UP_AXIS, this.yaw)

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

    const jumpPressed = this.inputs.isActionPressed(InputBindingsConstants.INPUT_ACTION.JUMP)
    if(movementEnabled && this.isOnGround && jumpPressed)
    {
        this.velocity.y = this.settings.jumpSpeed
        this.isOnGround = false
    }

    this.velocity.y -= this.settings.gravity * deltaSeconds
}


/**
 * Applique la vitesse et résout les collisions/contraintes de position.
 */
export function updatePosition(deltaSeconds)
{
    this.previousPosition.copy(this.position)
    this.position.addScaledVector(this.velocity, deltaSeconds)

    this.resolveCollisions()
    this.resolveCeilingCollision()
    this.resolveGroundCollision()
    this.resolveBoundaryCollision()
}


/**
 * Empêche le joueur de sortir de la zone autorisée.
 */
export function resolveBoundaryCollision()
{
    if(this.boundaryBox)
    {
        const minX = this.boundaryBox.minX + this.settings.radius
        const maxX = this.boundaryBox.maxX - this.settings.radius
        const minZ = this.boundaryBox.minZ + this.settings.radius
        const maxZ = this.boundaryBox.maxZ - this.settings.radius

        if(this.position.x < minX)
        {
            this.position.x = minX
            this.velocity.x = 0
        }
        else if(this.position.x > maxX)
        {
            this.position.x = maxX
            this.velocity.x = 0
        }

        if(this.position.z < minZ)
        {
            this.position.z = minZ
            this.velocity.z = 0
        }
        else if(this.position.z > maxZ)
        {
            this.position.z = maxZ
            this.velocity.z = 0
        }

        return
    }

    const horizontalDistance = Math.hypot(this.position.x, this.position.z)
    if(horizontalDistance <= this.boundaryRadius)
    {
        return
    }

    const clampRatio = this.boundaryRadius / horizontalDistance
    this.position.x *= clampRatio
    this.position.z *= clampRatio
    this.velocity.x = 0
    this.velocity.z = 0
}


/**
 * Aligne le joueur sur le sol et met à jour l état onGround.
 */
export function resolveGroundCollision()
{
    const fallbackGroundY = this.groundHeight + this.settings.height
    let resolvedGroundY = fallbackGroundY
    let resolvedGroundObject = null

    if(this.groundMeshes.length > 0)
    {
        // Start the ground probe just above the player head, not far above.
        // This prevents snapping to a bridge top while the player is still under it.
        const rayOrigin = new THREE.Vector3(this.position.x, this.position.y + 0.12, this.position.z)
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
            resolvedGroundObject = hit.object
            break
        }
    }

    if(this.position.y <= resolvedGroundY + 0.08)
    {
        this.position.y = resolvedGroundY
        this.velocity.y = 0
        this.isOnGround = true
        this.currentGroundObject = resolvedGroundObject
        return
    }

    this.isOnGround = false
    this.currentGroundObject = null
}


/**
 * Empêche la caméra/capsule de traverser un plafond.
 */
export function resolveCeilingCollision()
{
    if(this.velocity.y <= 0 || this.ceilingMeshes.length === 0)
    {
        return
    }

    const previousHeadY = this.previousPosition.y + PlayerConstants.PLAYER_HEAD_TOP_OFFSET
    const currentHeadY = this.position.y + PlayerConstants.PLAYER_HEAD_TOP_OFFSET
    const upwardTravel = currentHeadY - previousHeadY
    if(upwardTravel <= 1e-5)
    {
        return
    }

    const rayFar = upwardTravel + PlayerConstants.CEILING_HIT_EPSILON
    const sampleOffset = this.settings.radius * 0.58
    const sampleOffsets = [
        [0, 0],
        [sampleOffset, 0],
        [-sampleOffset, 0],
        [0, sampleOffset],
        [0, -sampleOffset]
    ]

    let closestCeilingY = Infinity
    for(const [offsetX, offsetZ] of sampleOffsets)
    {
        this.raycastOrigin.set(
            this.previousPosition.x + offsetX,
            previousHeadY - PlayerConstants.CEILING_HIT_EPSILON,
            this.previousPosition.z + offsetZ
        )

        this.ceilingRaycaster.set(this.raycastOrigin, this.ceilingRayDirection)
        this.ceilingRaycaster.near = 0
        this.ceilingRaycaster.far = rayFar

        const hits = this.ceilingRaycaster.intersectObjects(this.ceilingMeshes, false)
        const firstHit = hits[0]
        if(!firstHit)
        {
            continue
        }

        closestCeilingY = Math.min(closestCeilingY, firstHit.point.y)
    }

    if(!Number.isFinite(closestCeilingY))
    {
        return
    }

    const maxAllowedPlayerY = closestCeilingY - PlayerConstants.PLAYER_HEAD_TOP_OFFSET - PlayerConstants.CEILING_HIT_EPSILON
    if(this.position.y > maxAllowedPlayerY)
    {
        this.position.y = maxAllowedPlayerY
        this.velocity.y = 0
    }
}


/**
 * Filtre les meshes à ignorer pour la détection du sol.
 */
export function isGroundIgnoredMesh(object)
{
    return this.hasNameInHierarchy(object, PlayerConstants.GROUND_IGNORED_TOKENS)
}


/**
 * Teste la présence d un token de nom dans la hiérarchie d un objet.
 */
export function hasNameInHierarchy(object, tokens = [])
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


/**
 * Construit/rafraîchit l octree spatiale des collisions boîte.
 */
export function ensureCollisionOctree()
{
    const boxes = this.collisionBoxes
    if(!Array.isArray(boxes) || boxes.length === 0)
    {
        this.collisionOctree.build([])
        this.collisionOctreePayloads = []
        this.collisionOctreeVersion.length = 0
        this.collisionOctreeVersion.first = null
        this.collisionOctreeVersion.mid = null
        this.collisionOctreeVersion.last = null
        this.collisionDebugState = {
            ...(this.collisionDebugState || {}),
            octreeNodeBounds: []
        }
        return
    }

    const first = boxes[0] ?? null
    const mid = boxes[Math.floor(boxes.length * 0.5)] ?? null
    const last = boxes[boxes.length - 1] ?? null

    const isSameVersion = this.collisionOctreeVersion.length === boxes.length
        && this.collisionOctreeVersion.first === first
        && this.collisionOctreeVersion.mid === mid
        && this.collisionOctreeVersion.last === last

    if(isSameVersion)
    {
        return
    }

    const entries = []
    const payloads = []
    for(let index = 0; index < boxes.length; index++)
    {
        const box = boxes[index]
        if(!(box instanceof THREE.Box3) || box.isEmpty())
        {
            continue
        }

        const payload = {
            box,
            mesh: this.collisionMeshes[index] ?? null
        }

        entries.push({
            bounds: box,
            payload
        })
        payloads.push(payload)
    }

    this.collisionOctree.build(entries)
    this.collisionOctreePayloads = payloads
    this.collisionOctreeVersion.length = boxes.length
    this.collisionOctreeVersion.first = first
    this.collisionOctreeVersion.mid = mid
    this.collisionOctreeVersion.last = last
    this.collisionDebugState = {
        ...(this.collisionDebugState || {}),
        octreeNodeBounds: this.collisionOctree.collectNodeBounds({ leavesOnly: true })
    }
}


/**
 * Récupère les boîtes candidates proches du joueur via l octree.
 */
export function getCollisionCandidates(queryBounds)
{
    if(!(queryBounds instanceof THREE.Box3))
    {
        return this.collisionOctreePayloads
    }

    this.ensureCollisionOctree()

    const candidates = this.collisionOctree.queryBox(queryBounds, [])
    return candidates
}


/**
 * Résout les collisions boîte/capsule sur les axes pertinents.
 */
export function resolveCollisions()
{
    if(this.useMeshCollisionRaycast)
    {
        this.resolveMeshCollisions()
    }

    if(!this.useBoxCollisionResolution || this.collisionBoxes.length === 0)
    {
        this.collisionDebugState = {
            ...(this.collisionDebugState || {}),
            octreeQueryBox: null,
            octreeCandidateBoxes: [],
            octreeNodeBounds: []
        }
        return
    }

    const radius = this.settings.radius
    const radiusSq = radius * radius
    // Use the true feet plane so low horizontal obstacles on the ground
    // (e.g. straight pipes) are still considered for collision.
    const feetY = this.position.y - this.settings.height
    const headY = this.position.y + 0.04
    this.collisionQueryBox.min.set(
        this.position.x - radius - PlayerConstants.COLLISION_OCTREE_MARGIN,
        feetY - PlayerConstants.COLLISION_OCTREE_MARGIN,
        this.position.z - radius - PlayerConstants.COLLISION_OCTREE_MARGIN
    )
    this.collisionQueryBox.max.set(
        this.position.x + radius + PlayerConstants.COLLISION_OCTREE_MARGIN,
        headY + PlayerConstants.COLLISION_OCTREE_MARGIN,
        this.position.z + radius + PlayerConstants.COLLISION_OCTREE_MARGIN
    )
    const collisionCandidates = this.getCollisionCandidates(this.collisionQueryBox)
    this.collisionDebugState = {
        ...(this.collisionDebugState || {}),
        octreeQueryBox: this.collisionQueryBox.clone(),
        octreeCandidateBoxes: collisionCandidates
            .map((candidate) => candidate?.box)
            .filter((box) => box instanceof THREE.Box3),
        octreeNodeBounds: this.collisionDebugState?.octreeNodeBounds ?? []
    }

    for(let iteration = 0; iteration < 6; iteration++)
    {
        let hasCollision = false

        for(const candidate of collisionCandidates)
        {
            const box = candidate?.box
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
                // Le centre est dans la projection XZ de la box.
                // On sort par la face la plus proche avec la translation minimale.
                const pushLeft = (this.position.x - box.min.x) + radius + PlayerConstants.COLLISION_CONTACT_EPSILON
                const pushRight = (box.max.x - this.position.x) + radius + PlayerConstants.COLLISION_CONTACT_EPSILON
                const pushBack = (this.position.z - box.min.z) + radius + PlayerConstants.COLLISION_CONTACT_EPSILON
                const pushFront = (box.max.z - this.position.z) + radius + PlayerConstants.COLLISION_CONTACT_EPSILON

                const minPush = Math.min(pushLeft, pushRight, pushBack, pushFront)
                if(minPush === pushLeft)
                {
                    this.position.x -= pushLeft
                    if(this.velocity.x > 0)
                    {
                        this.velocity.x = 0
                    }
                }
                else if(minPush === pushRight)
                {
                    this.position.x += pushRight
                    if(this.velocity.x < 0)
                    {
                        this.velocity.x = 0
                    }
                }
                else if(minPush === pushBack)
                {
                    this.position.z -= pushBack
                    if(this.velocity.z > 0)
                    {
                        this.velocity.z = 0
                    }
                }
                else
                {
                    this.position.z += pushFront
                    if(this.velocity.z < 0)
                    {
                        this.velocity.z = 0
                    }
                }

                continue
            }

            const distance = Math.max(Math.sqrt(distanceSq), PlayerConstants.COLLISION_MIN_DISTANCE)
            const normalX = dx / distance
            const normalZ = dz / distance
            const penetration = Math.max(0, radius - distance + PlayerConstants.COLLISION_CONTACT_EPSILON)

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


/**
 * Résout les collisions par raycast contre meshes runtime.
 */
export function resolveMeshCollisions()
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
    const sampleHeights = [feetY + 0.35, feetY + 0.9, this.position.y - 0.2, this.position.y + 0.02]
    const sideOffset = this.settings.radius * 0.65
    const lateralDirection = new THREE.Vector3(
        -this.collisionDirection.z,
        0,
        this.collisionDirection.x
    )
    const lateralOffsets = [0, sideOffset, -sideOffset]
    const minSampleY = Math.min(...sampleHeights)
    const maxSampleY = Math.max(...sampleHeights)

    this.collisionQueryBox.min.set(
        Math.min(this.previousPosition.x, this.position.x) - this.settings.radius - PlayerConstants.COLLISION_OCTREE_MARGIN,
        minSampleY - PlayerConstants.COLLISION_OCTREE_MARGIN,
        Math.min(this.previousPosition.z, this.position.z) - this.settings.radius - PlayerConstants.COLLISION_OCTREE_MARGIN
    )
    this.collisionQueryBox.max.set(
        Math.max(this.previousPosition.x, this.position.x) + this.settings.radius + PlayerConstants.COLLISION_OCTREE_MARGIN,
        maxSampleY + PlayerConstants.COLLISION_OCTREE_MARGIN,
        Math.max(this.previousPosition.z, this.position.z) + this.settings.radius + PlayerConstants.COLLISION_OCTREE_MARGIN
    )

    const collisionCandidates = this.getCollisionCandidates(this.collisionQueryBox)
    const candidateMeshes = []
    for(const candidate of collisionCandidates)
    {
        if(candidate?.mesh)
        {
            candidateMeshes.push(candidate.mesh)
        }
    }

    const raycastTargets = candidateMeshes.length > 0 ? candidateMeshes : this.collisionMeshes

    let hasHit = false

    for(const sampleY of sampleHeights)
    {
        for(const lateralOffset of lateralOffsets)
        {
            this.raycastOrigin.set(
                this.previousPosition.x + (lateralDirection.x * lateralOffset),
                sampleY,
                this.previousPosition.z + (lateralDirection.z * lateralOffset)
            )
            const rayEnd = this.raycastOrigin.clone().addScaledVector(this.collisionDirection, raycastFar)
            debugState.rays.push({
                origin: this.raycastOrigin.clone(),
                end: rayEnd
            })

            this.collisionRaycaster.set(this.raycastOrigin, this.collisionDirection)
            this.collisionRaycaster.near = 0
            this.collisionRaycaster.far = raycastFar

            const hits = this.collisionRaycaster.intersectObjects(raycastTargets, false)
            for(const hit of hits)
            {
                if(!hit.face)
                {
                    continue
                }

                this.worldNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
                const facingDot = this.worldNormal.dot(this.collisionDirection)
                // Ignore backface hits (common with DoubleSide materials) so the player
                // can exit concave/interior spaces without getting locked inside.
                if(facingDot >= 0)
                {
                    continue
                }
                // Keep angled modules collidable while still ignoring near-horizontal surfaces.
                if(this.worldNormal.y > PlayerConstants.WALL_NORMAL_MAX_Y)
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


/**
 * Expose un snapshot debug de l état collision courant.
 */
export function getCollisionDebugState()
{
    return this.collisionDebugState
}


/**
 * Applique le lissage de position/rotation caméra.
 */
export function updateCameraTransform(deltaSeconds)
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


/**
 * Interpole deux angles en tenant compte de l enroulement 2PI.
 */
export function interpolateAngle(current, target, interpolation)
{
    const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
    return current + (delta * interpolation)
}

