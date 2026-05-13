import * as THREE from 'three'
import Experience from '../../../Experience.js'
import BloomRailSystem from '../../Rails/BloomRailSystem.js'
import * as BloomConstants from '../Bloom.constants.js'

/**
 * Boucle runtime principale de Bloom.
 */
export function update()
{
    const deltaSeconds = Math.min(this.time.delta, 50) * 0.001

    if(this.animation.mixer && this.animation.play)
    {
        this.animation.mixer.update(deltaSeconds)
        this.applyAnimationToSecondArm()
    }

    if(this.model)
    {
        this.updateMotion(deltaSeconds)
        if(!this.isAnimationDrivingModel())
        {
            this.updateArms()
        }
        return
    }

    if(this.fallback)
    {
        this.fallback.rotation.x += this.time.delta * 0.0004
        this.fallback.rotation.y += this.time.delta * 0.0007
    }
}


/**
 * Orchestre le mode de déplacement courant (suivi direct, rail, idle).
 */
export function updateMotion(deltaSeconds)
{
    const elapsed = this.time.elapsed * 0.001
    const walkFrequency = this.getDynamicWalkFrequency()
    this.walkCyclePhase += deltaSeconds * walkFrequency * Math.PI * 2
    const bobOffset = Math.sin(this.walkCyclePhase) * this.motion.bobAmplitude

    if((this.follow.enabled || this.followOverride.nodeId) && this.resolveFollowTargetPosition())
    {
        if(this.rails.hasRails())
        {
            this.updateRailMotion(deltaSeconds, bobOffset)
        }
        else
        {
            this.updateDirectFollowMotion(deltaSeconds, bobOffset)
        }
        return
    }

    this.updateIdleMotion(elapsed, deltaSeconds, bobOffset)
}


/**
 * Fait suivre Bloom directement la cible quand le mode follow direct est actif.
 */
export function updateDirectFollowMotion(deltaSeconds, bobOffset)
{
    this.previousAnchorPosition.copy(this.railAnchorPosition)
    const minFacingMovementStepSq = BloomConstants.BLOOM_MOVEMENT_FACING_MIN_STEP * BloomConstants.BLOOM_MOVEMENT_FACING_MIN_STEP

    // On définit une distance de confort autour du joueur
    const comfortDistance = 1.8
    const targetPos = this.followTargetPosition.clone()
    
    // Direction vers la cible
    const toTarget = new THREE.Vector3().subVectors(targetPos, this.railAnchorPosition)
    const distance = toTarget.length()
    
    if(distance > comfortDistance)
    {
        const moveSpeed = this.rails.settings.speed
        const step = moveSpeed * deltaSeconds
        toTarget.normalize().multiplyScalar(Math.min(step, distance - comfortDistance))
        this.railAnchorPosition.add(toTarget)
    }

    const fallbackGroundY = this.railAnchorPosition.y
    const groundY = this.resolveGroundYAt(
        this.railAnchorPosition.x,
        this.railAnchorPosition.z,
        fallbackGroundY
    )
    this.railAnchorPosition.y = groundY + this.motion.heightOffset

    this.model.position.x = this.railAnchorPosition.x
    this.model.position.z = this.railAnchorPosition.z
    this.model.position.y = this.railAnchorPosition.y + this.baseY + bobOffset

    this.updateLocomotionState(this.previousAnchorPosition, this.railAnchorPosition, deltaSeconds)
    if(this.movementDelta.lengthSq() > minFacingMovementStepSq)
    {
        this.updateFacingFromDirection(this.movementDirection, deltaSeconds)
        return
    }

    this.updateFacingTowardsPlayer(deltaSeconds)
}


/**
 * Fait progresser Bloom sur le graphe de rails.
 */
export function updateRailMotion(deltaSeconds, bobOffset)
{
    this.previousAnchorPosition.copy(this.railAnchorPosition)

    const didMove = this.rails.moveAnchorTowards(
        this.railAnchorPosition,
        this.followTargetPosition,
        deltaSeconds
    )

    const fallbackGroundY = this.railAnchorPosition.y
    const groundY = this.resolveGroundYAt(
        this.railAnchorPosition.x,
        this.railAnchorPosition.z,
        fallbackGroundY
    )
    this.railAnchorPosition.y = groundY + this.motion.heightOffset

    this.model.position.x = this.railAnchorPosition.x
    this.model.position.z = this.railAnchorPosition.z
    this.model.position.y = this.railAnchorPosition.y + this.baseY + bobOffset

    this.updateLocomotionState(this.previousAnchorPosition, this.railAnchorPosition, deltaSeconds)
    const minFacingMovementStepSq = BloomConstants.BLOOM_MOVEMENT_FACING_MIN_STEP * BloomConstants.BLOOM_MOVEMENT_FACING_MIN_STEP
    const isMovingOnRail = didMove && this.movementDelta.lengthSq() > minFacingMovementStepSq
    if(isMovingOnRail)
    {
        this.updateFacingFromDirection(this.movementDirection, deltaSeconds)
        return
    }

    this.updateFacingTowardsPlayer(deltaSeconds)
}


/**
 * Anime Bloom en mode idle autour de son centre de mouvement.
 */
export function updateIdleMotion(elapsed, deltaSeconds, bobOffset)
{
    const angle = elapsed * this.motion.turnSpeed

    this.previousAnchorPosition.copy(this.railAnchorPosition)
    this.railAnchorPosition.x = this.motion.center.x + Math.cos(angle) * this.motion.radius
    this.railAnchorPosition.z = this.motion.center.z + Math.sin(angle) * this.motion.radius

    const groundY = this.resolveGroundYAt(
        this.railAnchorPosition.x,
        this.railAnchorPosition.z,
        this.motion.center.y
    )
    this.railAnchorPosition.y = groundY + this.motion.heightOffset

    this.model.position.x = this.railAnchorPosition.x
    this.model.position.z = this.railAnchorPosition.z
    this.model.position.y = this.railAnchorPosition.y + this.baseY + bobOffset

    this.updateLocomotionState(this.previousAnchorPosition, this.railAnchorPosition, deltaSeconds)
    if(this.updateFacingTowardsPlayer(deltaSeconds))
    {
        return
    }

    const minFacingMovementStepSq = BloomConstants.BLOOM_MOVEMENT_FACING_MIN_STEP * BloomConstants.BLOOM_MOVEMENT_FACING_MIN_STEP
    if(this.movementDelta.lengthSq() > minFacingMovementStepSq)
    {
        this.updateFacingFromDirection(this.movementDirection, deltaSeconds)
        return
    }

    if(this.lastFacingDirection.lengthSq() > 1e-8)
    {
        this.updateFacingFromDirection(this.lastFacingDirection, deltaSeconds)
    }
}


/**
 * Calcule la position monde cible à suivre.
 */
export function resolveFollowTargetPosition()
{
    if(this.followOverride.nodeId)
    {
        const nodePosition = this.rails.getNodePosition(this.followOverride.nodeId)
        if(nodePosition instanceof THREE.Vector3)
        {
            this.followTargetPosition.copy(nodePosition)

            if(!this.followOverride.lockToNode)
            {
                const dx = this.railAnchorPosition.x - nodePosition.x
                const dz = this.railAnchorPosition.z - nodePosition.z
                const arrivalDistance = Math.max(0.01, this.followOverride.arrivalDistance)
                const arrivalDistanceSq = arrivalDistance * arrivalDistance
                if((dx * dx) + (dz * dz) <= arrivalDistanceSq)
                {
                    this.clearFollowOverride()
                }
            }

            return true
        }

        this.clearFollowOverride()
    }

    if(this.follow.getTargetPosition)
    {
        const result = this.follow.getTargetPosition()
        if(result instanceof THREE.Vector3)
        {
            this.followTargetPosition.copy(result)
            return true
        }

        if(result && typeof result === 'object')
        {
            this.followTargetPosition.set(result.x ?? 0, result.y ?? 0, result.z ?? 0)
            return true
        }
    }

    if(this.follow.target?.position instanceof THREE.Vector3)
    {
        this.followTargetPosition.copy(this.follow.target.position)
        return true
    }

    return false
}


/**
 * Demande un déplacement vers un noeud de rail spécifique.
 */
export function moveToRailNode(nodeId, { lockToNode = false } = {})
{
    if(typeof nodeId !== 'string' || nodeId.trim() === '')
    {
        return false
    }

    const normalizedNodeId = nodeId.trim()
    const nodePosition = this.rails.getNodePosition(normalizedNodeId)
    if(!(nodePosition instanceof THREE.Vector3))
    {
        return false
    }

    this.followOverride.nodeId = normalizedNodeId
    this.followOverride.lockToNode = Boolean(lockToNode)
    this.followTargetPosition.copy(nodePosition)
    return true
}


/**
 * Supprime un override de suivi rail forcé.
 */
export function clearFollowOverride()
{
    this.followOverride.nodeId = null
    this.followOverride.lockToNode = false
}


/**
 * Ajoute un point de rail à la position courante de la cible.
 */
export function addRailPointFromTarget()
{
    if(!this.resolveFollowTargetPosition())
    {
        return
    }

    const y = this.resolveGroundYAt(
        this.followTargetPosition.x,
        this.followTargetPosition.z,
        this.followTargetPosition.y
    )

    this.rails.appendPoint(new THREE.Vector3(
        this.followTargetPosition.x,
        y,
        this.followTargetPosition.z
    ))
}


/**
 * Démarre une nouvelle ligne de rail à la position de la cible.
 */
export function startRailLineFromTarget()
{
    if(!this.resolveFollowTargetPosition())
    {
        this.rails.startNewRail()
        return
    }

    const y = this.resolveGroundYAt(
        this.followTargetPosition.x,
        this.followTargetPosition.z,
        this.followTargetPosition.y
    )

    this.rails.startNewRail(new THREE.Vector3(
        this.followTargetPosition.x,
        y,
        this.followTargetPosition.z
    ))
}


/**
 * Calcule une fréquence de marche adaptée à la vitesse réelle.
 */
export function getDynamicWalkFrequency()
{
    const referenceSpeed = Math.max(0.001, this.rails.settings.speed)
    const normalizedSpeed = THREE.MathUtils.clamp(this.locomotionSpeed / referenceSpeed, 0, 3)
    const frequencyMultiplier = 1 + (normalizedSpeed * this.motion.walkFrequencySpeedInfluence)
    return this.motion.walkFrequency * frequencyMultiplier
}


/**
 * Met à jour les métriques de locomotion (vitesse, phase de marche).
 */
export function updateLocomotionState(previousPosition, currentPosition, deltaSeconds)
{
    this.movementDelta
        .set(
            currentPosition.x - previousPosition.x,
            0,
            currentPosition.z - previousPosition.z
        )

    const horizontalStep = this.movementDelta.length()
    const currentSpeed = horizontalStep / Math.max(1e-5, deltaSeconds)
    const speedSmoothing = 1 - Math.exp(-12 * Math.max(0, deltaSeconds))
    this.locomotionSpeed = THREE.MathUtils.lerp(this.locomotionSpeed, currentSpeed, speedSmoothing)

    if(horizontalStep > 1e-6)
    {
        this.movementDirection.copy(this.movementDelta).multiplyScalar(1 / horizontalStep)
    }
}


/**
 * Oriente Bloom dans le sens du déplacement.
 */
export function updateFacingFromDirection(direction, deltaSeconds)
{
    if(!this.model || direction.lengthSq() <= 1e-8)
    {
        return
    }

    const targetYaw = Math.atan2(direction.x, direction.z)
    const rawCurrentYaw = this.model.rotation.y - this.baseYaw
    const currentYaw = Math.atan2(Math.sin(rawCurrentYaw), Math.cos(rawCurrentYaw))
    const deltaYaw = Math.atan2(
        Math.sin(targetYaw - currentYaw),
        Math.cos(targetYaw - currentYaw)
    )
    const rotationAlpha = 1 - Math.exp(-this.tuning.lookTurnSpeed * Math.max(0, deltaSeconds))
    const unclampedYawStep = deltaYaw * rotationAlpha
    const maxYawStep = (Math.PI * 1.25) * Math.max(0, deltaSeconds)
    const clampedYawStep = THREE.MathUtils.clamp(unclampedYawStep, -maxYawStep, maxYawStep)
    this.model.rotation.y = this.baseYaw + currentYaw + clampedYawStep
    this.lastFacingDirection.copy(direction).normalize()
}


/**
 * Fait regarder Bloom vers le joueur dans certains contextes.
 */
export function updateFacingTowardsPlayer(deltaSeconds)
{
    const playerTarget = this.follow.target ?? this.experience?.player ?? null
    if(!this.model)
    {
        return false
    }

    if(playerTarget?.position instanceof THREE.Vector3)
    {
        this.direction
            .set(
                playerTarget.position.x - this.model.position.x,
                0,
                playerTarget.position.z - this.model.position.z
            )
    }
    else if(this.resolveFollowTargetPosition())
    {
        this.direction
            .set(
                this.followTargetPosition.x - this.model.position.x,
                0,
                this.followTargetPosition.z - this.model.position.z
            )
    }
    else
    {
        return false
    }

    const minDistanceSq = BloomConstants.BLOOM_FACE_PLAYER_MIN_DISTANCE * BloomConstants.BLOOM_FACE_PLAYER_MIN_DISTANCE
    const distanceSq = this.direction.lengthSq()
    if(distanceSq <= minDistanceSq)
    {
        if(this.lastFacingDirection.lengthSq() <= 1e-8)
        {
            return false
        }

        this.updateFacingFromDirection(this.lastFacingDirection, deltaSeconds)
        return true
    }

    this.direction.normalize()
    this.updateFacingFromDirection(this.direction, deltaSeconds)
    return true
}


/**
 * Projette une position sur le sol détecté par raycast.
 */
export function resolveGroundYAt(x, z, fallbackY = 0)
{
    const groundMeshes = this.follow.groundMeshes
    if(!Array.isArray(groundMeshes) || groundMeshes.length === 0)
    {
        return fallbackY
    }

    const origin = new THREE.Vector3(x, fallbackY + this.baseY + 2, z)
    this.groundRaycaster.set(origin, new THREE.Vector3(0, -1, 0))
    this.groundRaycaster.near = 0
    this.groundRaycaster.far = 20

    const playerStepHeight = this.follow.target?.settings?.stepHeight
    const maxStepHeight = Number.isFinite(playerStepHeight)
        ? playerStepHeight
        : this.follow.groundMaxSnapUp

    const hits = this.groundRaycaster.intersectObjects(groundMeshes, false)
    for(const hit of hits)
    {
        if(this.follow.target?.isGroundIgnoredMesh?.(hit.object))
        {
            continue
        }

        if(!hit.face)
        {
            continue
        }

        this.groundNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
        if(this.groundNormal.y < 0.45)
        {
            continue
        }

        const stepDelta = hit.point.y - fallbackY
        if(stepDelta > maxStepHeight)
        {
            continue
        }

        return hit.point.y
    }

    return fallbackY
}


/**
 * Anime procéduralement les bras en complément de l animation.
 */
export function updateArms()
{
    const walkCycle = this.walkCyclePhase

    for(const armPart of this.armNodes)
    {
        const swing = Math.sin(walkCycle * armPart.frequencyMultiplier + armPart.phaseOffset) * armPart.amplitude * this.motion.swingIntensity
        this.tmpQuaternion.setFromAxisAngle(armPart.axis, swing * armPart.direction)
        armPart.node.quaternion.copy(armPart.baseQuaternion).multiply(this.tmpQuaternion)
    }
}


/**
 * Recopie/transpose une animation de bras vers le bras opposé.
 */
export function applyAnimationToSecondArm()
{
    if(!this.animation.mirrorArmsFromAnimation)
    {
        return
    }

    if(this.armAnimationPairs.length === 0)
    {
        return
    }

    for(const pair of this.armAnimationPairs)
    {
        const leftNode = pair.leftNode
        const rightNode = pair.rightNode
        if(!leftNode || !rightNode)
        {
            continue
        }

        const leftDelta = 1 - Math.abs(leftNode.quaternion.dot(pair.leftBaseQuaternion))
        const rightDelta = 1 - Math.abs(rightNode.quaternion.dot(pair.rightBaseQuaternion))
        const sourceNode = leftDelta >= rightDelta ? leftNode : rightNode
        const sourceBase = leftDelta >= rightDelta ? pair.leftBaseQuaternion : pair.rightBaseQuaternion
        const targetNode = leftDelta >= rightDelta ? rightNode : leftNode
        const targetBase = leftDelta >= rightDelta ? pair.rightBaseQuaternion : pair.leftBaseQuaternion

        this.tmpArmInverseBaseQuaternion.copy(sourceBase).invert()
        this.tmpArmDeltaQuaternion.copy(this.tmpArmInverseBaseQuaternion).multiply(sourceNode.quaternion)
        targetNode.quaternion.copy(targetBase).multiply(this.tmpArmDeltaQuaternion)
    }
}

