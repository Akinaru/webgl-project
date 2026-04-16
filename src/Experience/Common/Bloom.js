import * as THREE from 'three'
import Experience from '../Experience.js'

const BLOOM_BLOCKING_SURFACE_MAX_NORMAL_Y = 0.25
const BLOOM_NAV_MAX_NODES = 950
const BLOOM_NAV_MAX_NEIGHBORS = 12

export default class Bloom
{
    constructor({
        motion = {},
        follow = {}
    } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time
        this.debug = this.experience.debug

        this.resource = this.resources.items.bloomModel
        this.tmpQuaternion = new THREE.Quaternion()
        this.direction = new THREE.Vector3()
        this.scaleState = {
            visualScale: 0.4
        }

        this.motion = {
            center: motion.center instanceof THREE.Vector3
                ? motion.center.clone()
                : new THREE.Vector3(motion.center?.x ?? 0, motion.center?.y ?? 0, motion.center?.z ?? -6),
            radius: motion.radius ?? 7,
            turnSpeed: motion.turnSpeed ?? 0.26,
            walkFrequency: motion.walkFrequency ?? 1.7,
            walkFrequencySpeedInfluence: motion.walkFrequencySpeedInfluence ?? 0.8,
            bobAmplitude: motion.bobAmplitude ?? 0.06,
            swingIntensity: motion.swingIntensity ?? 1
        }
        this.follow = {
            target: follow.target ?? null,
            getTargetPosition: typeof follow.getTargetPosition === 'function' ? follow.getTargetPosition : null,
            camera: follow.camera ?? null,
            minDistance: follow.minDistance ?? 2.8,
            maxDistance: follow.maxDistance ?? 6.5,
            preferredDistance: follow.preferredDistance ?? 4.2,
            retreatDistance: follow.retreatDistance ?? Math.max(follow.preferredDistance ?? 4.2, (follow.minDistance ?? 2.8) + 1),
            retreatDistanceMultiplier: follow.retreatDistanceMultiplier ?? 3,
            heightOffset: follow.heightOffset ?? 0.8,
            speed: follow.speed ?? 4.2,
            maxSpeed: follow.maxSpeed ?? Math.max(follow.speed ?? 4.2, (follow.speed ?? 4.2) * 2),
            speedDistanceRange: follow.speedDistanceRange ?? 8,
            retreatSpeed: follow.retreatSpeed ?? 9,
            retreatArrivalThreshold: follow.retreatArrivalThreshold ?? 0.15,
            retreatHoldSeconds: follow.retreatHoldSeconds ?? 2.2,
            lookTurnSpeed: follow.lookTurnSpeed ?? 11,
            faceMovementMinSpeed: follow.faceMovementMinSpeed ?? 0.05,
            contourAngularStepRadians: follow.contourAngularStepRadians ?? 0.35,
            contourSamplesPerSide: follow.contourSamplesPerSide ?? 8,
            contourMinProgress: follow.contourMinProgress ?? 0.12,
            collisionSlideFactor: follow.collisionSlideFactor ?? 0.9,
            collisionBlockingNormalMaxY: follow.collisionBlockingNormalMaxY ?? BLOOM_BLOCKING_SURFACE_MAX_NORMAL_Y,
            groundMaxSnapUp: follow.groundMaxSnapUp ?? 0.65,
            minGroundY: Number.isFinite(follow.minGroundY) ? follow.minGroundY : Number.NEGATIVE_INFINITY,
            groundMeshes: Array.isArray(follow.groundMeshes) ? follow.groundMeshes : [],
            avoidZones: Array.isArray(follow.avoidZones) ? follow.avoidZones : [],
            collisionBoxes: Array.isArray(follow.collisionBoxes) ? follow.collisionBoxes : [],
            collisionMeshes: Array.isArray(follow.collisionMeshes) ? follow.collisionMeshes : [],
            colliderRadius: follow.colliderRadius ?? 0.28,
            colliderHeight: follow.colliderHeight ?? 1.45,
            touchRetreatBuffer: follow.touchRetreatBuffer ?? 0.02,
            approachDelaySeconds: follow.approachDelaySeconds ?? 0.6,
            retreatDelaySeconds: follow.retreatDelaySeconds ?? 3.5,
            behindReturnDelaySeconds: follow.behindReturnDelaySeconds ?? 2.6,
            behindThresholdDot: follow.behindThresholdDot ?? -0.2,
            repositionAngularSpeed: follow.repositionAngularSpeed ?? 2.25,
            repositionCompleteDot: follow.repositionCompleteDot ?? 0.94,
            repositionDistance: follow.repositionDistance ?? Math.max(follow.preferredDistance ?? 4.2, (follow.minDistance ?? 2.8) + 0.9),
            returnCooldownSeconds: follow.returnCooldownSeconds ?? 1.2,
            pathfindingEnabled: follow.pathfindingEnabled ?? true,
            navCellSize: follow.navCellSize ?? 1.1,
            navLinkDistance: follow.navLinkDistance ?? 2.8,
            pathRecomputeIntervalSeconds: follow.pathRecomputeIntervalSeconds ?? 0.35,
            pathWaypointReachDistance: follow.pathWaypointReachDistance ?? 0.45,
            enabled: Boolean(follow.target || follow.getTargetPosition)
        }
        this.followDirection = new THREE.Vector3(1, 0, 0)
        this.followTargetPosition = new THREE.Vector3()
        this.followDesiredPosition = new THREE.Vector3()
        this.followPreviousPosition = new THREE.Vector3()
        this.followCameraForward = new THREE.Vector3()
        this.followCameraToBloom = new THREE.Vector3()
        this.followToBloom = new THREE.Vector3()
        this.followReturnPosition = new THREE.Vector3()
        this.followGroundRayDirection = new THREE.Vector3(0, -1, 0)
        this.followCollisionDirection = new THREE.Vector3()
        this.followRaycastOrigin = new THREE.Vector3()
        this.followWorldNormal = new THREE.Vector3()
        this.followCollisionRaycaster = new THREE.Raycaster()
        this.followCollisionHitNormal = new THREE.Vector3()
        this.followCollisionSlideNormal = new THREE.Vector3()
        this.followCollisionSlide = new THREE.Vector3()
        this.contourDirectionCandidate = new THREE.Vector3()
        this.contourCandidatePosition = new THREE.Vector3()
        this.movementDelta = new THREE.Vector3()
        this.movementDirection = new THREE.Vector3(0, 0, 1)
        this.followState = {
            tooFarDuration: 0,
            nearDuration: 0,
            isRetreating: false,
            retreatHoldTimer: 0,
            behindDuration: 0,
            returnCooldown: 0,
            isRepositioning: false
        }
        this.groundRaycaster = new THREE.Raycaster()
        this.groundNormal = new THREE.Vector3()
        this.pathWaypointWorld = new THREE.Vector3()
        this.pathState = {
            points: [],
            waypointIndex: 0,
            recomputeTimer: 0,
            hasPath: false,
            lastStart: null,
            lastGoal: null
        }
        this.navGraph = null
        this.locomotionSpeed = 0
        this.walkCyclePhase = 0

        this.armNodes = []

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
            this.followPreviousPosition.copy(this.model.position)
        }

        this.setDebug()
    }

    setModel()
    {
        this.model = this.resource.scene.clone(true)
        this.model.name = '__bloomRoot'

        const bounds = new THREE.Box3().setFromObject(this.model)
        const size = bounds.getSize(new THREE.Vector3())
        const targetHeight = 1.7
        this.baseScale = size.y > 0 ? targetHeight / size.y : 1
        this.unscaledBaseY = -bounds.min.y

        this.applyVisualScale()
        this.baseYaw = this.model.rotation.y + Math.PI
        this.model.position.y = this.baseY

        this.model.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            child.castShadow = true
            child.receiveShadow = true
        })

        this.scene.add(this.model)
    }

    setArmRig()
    {
        this.model.traverse((child) =>
        {
            const nodeName = child.name?.toLowerCase() || ''
            const isArmGroup = nodeName.includes('bras')
            const isHand = nodeName.includes('main')

            if(!isArmGroup && !isHand)
            {
                return
            }

            const isRightSide = child.position.x >= 0

            this.armNodes.push({
                node: child,
                baseQuaternion: child.quaternion.clone(),
                axis: isArmGroup ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0),
                amplitude: isArmGroup ? 0.2 : 0.7,
                direction: isArmGroup ? 1 : (isRightSide ? 1 : -1),
                phaseOffset: isArmGroup ? 0 : (isRightSide ? 0 : Math.PI),
                frequencyMultiplier: isArmGroup ? 1 : 1.1
            })
        })
    }

    setFallback()
    {
        this.fallback = new THREE.Mesh(
            new THREE.TorusKnotGeometry(0.45, 0.16, 150, 24),
            new THREE.MeshStandardMaterial({
                color: '#f0f2ff',
                roughness: 0.2,
                metalness: 0.4
            })
        )

        this.fallback.name = '__bloomRoot'
        this.fallback.position.y = 0.2
        this.fallback.castShadow = true
        this.scene.add(this.fallback)
        this.applyVisualScale()
    }

    applyVisualScale()
    {
        const multiplier = Math.max(0.15, this.scaleState.visualScale)

        if(this.model)
        {
            const scale = this.baseScale * multiplier
            this.model.scale.setScalar(scale)
            this.baseY = this.unscaledBaseY * scale
            return
        }

        if(this.fallback)
        {
            this.fallback.scale.setScalar(multiplier)
        }
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('💧 Bloom', { expanded: false })
        this.debug.addBinding(this.debugFolder, this.scaleState, 'visualScale', {
            label: 'size',
            min: 0.15,
            max: 2.5,
            step: 0.01
        }).on('change', () =>
        {
            this.applyVisualScale()
        })

        this.debug.addBinding(this.debugFolder, this.motion, 'radius', {
            label: 'motionRadius',
            min: 0,
            max: 20,
            step: 0.05
        })
        this.debug.addBinding(this.debugFolder, this.motion, 'bobAmplitude', {
            label: 'bobAmp',
            min: 0,
            max: 0.5,
            step: 0.005
        })
        this.debug.addBinding(this.debugFolder, this.motion, 'turnSpeed', {
            label: 'turnSpeed',
            min: 0,
            max: 3,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.motion, 'walkFrequency', {
            label: 'walkFreq',
            min: 0,
            max: 6,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.motion, 'walkFrequencySpeedInfluence', {
            label: 'walkFreqBySpeed',
            min: 0,
            max: 3,
            step: 0.01
        })

        this.debug.addBinding(this.debugFolder, this.follow, 'minDistance', {
            label: 'minDist',
            min: 0.1,
            max: 8,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'maxDistance', {
            label: 'maxDist',
            min: 0.2,
            max: 20,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'preferredDistance', {
            label: 'prefDist',
            min: 0.2,
            max: 20,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'retreatDistance', {
            label: 'retreatDist',
            min: 0.2,
            max: 120,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'retreatDistanceMultiplier', {
            label: 'retreatX',
            min: 1,
            max: 8,
            step: 0.1
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'heightOffset', {
            label: 'heightOffset',
            min: 0,
            max: 4,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'colliderRadius', {
            label: 'colliderR',
            min: 0.05,
            max: 1,
            step: 0.005
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'colliderHeight', {
            label: 'colliderH',
            min: 0.2,
            max: 3,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'touchRetreatBuffer', {
            label: 'touchBuffer',
            min: 0,
            max: 1,
            step: 0.005
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'groundMaxSnapUp', {
            label: 'groundSnapUp',
            min: 0,
            max: 4,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'speed', {
            label: 'followSpeed',
            min: 0.1,
            max: 20,
            step: 0.1
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'maxSpeed', {
            label: 'maxSpeed',
            min: 0.1,
            max: 35,
            step: 0.1
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'speedDistanceRange', {
            label: 'speedDistRange',
            min: 0.1,
            max: 40,
            step: 0.1
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'retreatSpeed', {
            label: 'retreatSpeed',
            min: 0.1,
            max: 30,
            step: 0.1
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'retreatArrivalThreshold', {
            label: 'retreatStopTol',
            min: 0.01,
            max: 3,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'retreatHoldSeconds', {
            label: 'retreatHold',
            min: 0,
            max: 12,
            step: 0.05
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'lookTurnSpeed', {
            label: 'lookTurnSpeed',
            min: 0.1,
            max: 30,
            step: 0.1
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'faceMovementMinSpeed', {
            label: 'faceMoveMin',
            min: 0,
            max: 4,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'approachDelaySeconds', {
            label: 'approachDelay',
            min: 0,
            max: 10,
            step: 0.05
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'retreatDelaySeconds', {
            label: 'retreatDelay',
            min: 0,
            max: 10,
            step: 0.05
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'behindReturnDelaySeconds', {
            label: 'behindDelay',
            min: 0,
            max: 12,
            step: 0.05
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'repositionDistance', {
            label: 'repositionDist',
            min: 0.2,
            max: 20,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.follow, 'returnCooldownSeconds', {
            label: 'returnCooldown',
            min: 0,
            max: 10,
            step: 0.05
        })
    }

    update()
    {
        const deltaSeconds = Math.min(this.time.delta, 50) * 0.001

        if(this.model)
        {
            this.updateMotion(deltaSeconds)
            this.updateArms()
            return
        }

        if(this.fallback)
        {
            this.fallback.rotation.x += this.time.delta * 0.0004
            this.fallback.rotation.y += this.time.delta * 0.0007
        }
    }

    updateMotion(deltaSeconds)
    {
        const elapsed = this.time.elapsed * 0.001
        const angle = elapsed * this.motion.turnSpeed
        const walkFrequency = this.getDynamicWalkFrequency()
        this.walkCyclePhase += deltaSeconds * walkFrequency * Math.PI * 2
        const bobOffset = Math.sin(this.walkCyclePhase) * this.motion.bobAmplitude

        if(this.follow.enabled && this.resolveFollowTargetPosition())
        {
            this.updateFollowMotion(deltaSeconds, bobOffset)
            return
        }

        this.followPreviousPosition.copy(this.model.position)
        this.model.position.x = this.motion.center.x + Math.cos(angle) * this.motion.radius
        this.model.position.z = this.motion.center.z + Math.sin(angle) * this.motion.radius
        const baseGroundY = this.resolveGroundYAt(
            this.model.position.x,
            this.model.position.z,
            this.motion.center.y
        )
        this.model.position.y = baseGroundY + this.baseY + bobOffset

        this.direction.set(-Math.sin(angle), 0, Math.cos(angle))
        this.updateLocomotionState(this.followPreviousPosition, deltaSeconds)
        this.updateFacingFromDirection(this.direction, deltaSeconds)
    }

    resolveFollowTargetPosition()
    {
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

    updateFollowMotion(deltaSeconds, bobOffset)
    {
        const current = this.model.position
        this.followState.returnCooldown = Math.max(0, this.followState.returnCooldown - deltaSeconds)
        this.followState.retreatHoldTimer = Math.max(0, this.followState.retreatHoldTimer - deltaSeconds)
        this.followPreviousPosition.copy(current)
        this.direction
            .set(
                this.followTargetPosition.x - current.x,
                0,
                this.followTargetPosition.z - current.z
            )

        const horizontalDistance = this.direction.length()
        if(horizontalDistance > 1e-4)
        {
            this.direction.multiplyScalar(1 / horizontalDistance)
            this.followDirection.copy(this.direction)
        }
        else
        {
            this.direction.copy(this.followDirection)
        }

        this.followToBloom.copy(this.direction).multiplyScalar(-1)
        this.updateRepositionState(deltaSeconds, this.followToBloom)

        const shouldMoveCloser = horizontalDistance > this.follow.maxDistance
        if(shouldMoveCloser)
        {
            this.followState.tooFarDuration += deltaSeconds
        }
        else
        {
            this.followState.tooFarDuration = 0
        }

        const playerRadius = this.follow.target?.settings?.radius ?? 0.3
        const touchDistance = playerRadius + this.follow.colliderRadius + this.follow.touchRetreatBuffer
        const isTouchingPlayer = horizontalDistance <= touchDistance
        const shouldRetreat = horizontalDistance < this.follow.minDistance
        if(shouldRetreat)
        {
            this.followState.nearDuration += deltaSeconds
        }
        else
        {
            this.followState.nearDuration = 0
        }

        const canRetreat = this.followState.nearDuration >= this.follow.retreatDelaySeconds
        const retreatDistance = Math.max(
            this.follow.retreatDistance,
            this.follow.minDistance * this.follow.retreatDistanceMultiplier
        )
        const shouldStartRetreat = isTouchingPlayer || (shouldRetreat && canRetreat)
        if(shouldStartRetreat)
        {
            this.followState.isRetreating = true
            this.followState.retreatHoldTimer = 0
        }
        const retreatCompletionDistance = Math.max(
            this.follow.minDistance,
            retreatDistance - this.follow.retreatArrivalThreshold
        )
        if(this.followState.isRetreating && horizontalDistance >= retreatCompletionDistance)
        {
            this.followState.isRetreating = false
            this.followState.nearDuration = 0
            this.followState.retreatHoldTimer = this.follow.retreatHoldSeconds
        }
        const shouldRetreatNow = this.followState.isRetreating
        const canApproach = this.followState.tooFarDuration >= this.follow.approachDelaySeconds
            && this.followState.retreatHoldTimer <= 0
        let shouldAdjust = shouldRetreatNow || (shouldMoveCloser && canApproach)
        let desiredDistance = shouldRetreatNow
            ? retreatDistance
            : this.follow.preferredDistance
        let desiredDirectionFromTarget = this.followToBloom

        if(this.followState.isRepositioning && !shouldRetreatNow)
        {
            desiredDirectionFromTarget = this.rotateHorizontalDirectionTowards(
                this.followToBloom,
                this.followCameraForward,
                this.follow.repositionAngularSpeed * deltaSeconds
            )
            desiredDistance = Math.max(this.follow.repositionDistance, this.follow.minDistance + 1)
            shouldAdjust = true
        }

        this.followDesiredPosition.copy(current)

        if(shouldAdjust)
        {
            this.followDesiredPosition
                .copy(this.followTargetPosition)
                .addScaledVector(desiredDirectionFromTarget, desiredDistance)
        }

        this.applyAvoidZones(this.followDesiredPosition, current)

        const fallbackGroundY = current.y - this.baseY
        const groundY = this.resolveGroundYAt(
            this.followDesiredPosition.x,
            this.followDesiredPosition.z,
            fallbackGroundY
        )
        if(this.isGroundBelowPlanAt(this.followDesiredPosition.x, this.followDesiredPosition.z, fallbackGroundY))
        {
            this.followDesiredPosition.x = current.x
            this.followDesiredPosition.z = current.z
            this.followDesiredPosition.y = current.y
        }
        else
        {
            this.followDesiredPosition.y = groundY + this.baseY + bobOffset
        }

        if(shouldAdjust)
        {
            this.resolveFollowContourTarget({
                currentPosition: current,
                targetPosition: this.followTargetPosition,
                desiredDistance,
                preferredDirectionFromTarget: desiredDirectionFromTarget,
                bobOffset
            })
        }

        this.applyPathfindingToDesiredPosition({
            currentPosition: current,
            desiredPosition: this.followDesiredPosition,
            bobOffset,
            deltaSeconds
        })

        const distanceFromPreferred = Math.max(0, horizontalDistance - this.follow.preferredDistance)
        const adaptiveSpeedFactor = THREE.MathUtils.clamp(
            distanceFromPreferred / Math.max(0.001, this.follow.speedDistanceRange),
            0,
            1
        )
        const followSpeed = THREE.MathUtils.lerp(this.follow.speed, this.follow.maxSpeed, adaptiveSpeedFactor)
        const movementSpeed = shouldRetreatNow ? this.follow.retreatSpeed : followSpeed
        this.moveTowardsPosition(current, this.followDesiredPosition, movementSpeed, deltaSeconds)
        this.resolveFollowCollisions()
        this.updateLocomotionState(this.followPreviousPosition, deltaSeconds)

        this.direction
            .set(
                this.followTargetPosition.x - current.x,
                0,
                this.followTargetPosition.z - current.z
            )

        const shouldFaceMovement = this.locomotionSpeed > this.follow.faceMovementMinSpeed
        if(shouldFaceMovement && this.movementDirection.lengthSq() > 1e-8)
        {
            this.updateFacingFromDirection(this.movementDirection, deltaSeconds)
            return
        }

        if(this.direction.lengthSq() > 1e-8)
        {
            this.direction.normalize()
            this.updateFacingFromDirection(this.direction, deltaSeconds)
        }
    }

    updateRepositionState(deltaSeconds, directionFromTarget)
    {
        const camera = this.follow.camera ?? this.experience.camera?.instance
        if(!camera)
        {
            this.followState.behindDuration = 0
            this.followState.isRepositioning = false
            return
        }

        this.followCameraForward.set(0, 0, -1).applyQuaternion(camera.quaternion)
        this.followCameraForward.y = 0
        if(this.followCameraForward.lengthSq() <= 1e-8)
        {
            this.followState.behindDuration = 0
            this.followState.isRepositioning = false
            return
        }
        this.followCameraForward.normalize()

        let directionForBehindCheck = directionFromTarget
        this.followCameraToBloom.copy(this.model.position).sub(camera.position)
        this.followCameraToBloom.y = 0
        if(this.followCameraToBloom.lengthSq() > 1e-8)
        {
            this.followCameraToBloom.normalize()
            directionForBehindCheck = this.followCameraToBloom
        }

        if(directionForBehindCheck.lengthSq() <= 1e-8)
        {
            this.followState.behindDuration = 0
            this.followState.isRepositioning = false
            return
        }

        const dot = this.followCameraForward.dot(directionForBehindCheck)
        const isBehind = dot < this.follow.behindThresholdDot

        if(this.followState.isRepositioning)
        {
            if(dot >= this.follow.repositionCompleteDot)
            {
                this.followState.isRepositioning = false
                this.followState.returnCooldown = this.follow.returnCooldownSeconds
            }
            return
        }

        if(this.followState.returnCooldown > 0)
        {
            this.followState.behindDuration = 0
            return
        }

        if(isBehind)
        {
            this.followState.behindDuration += deltaSeconds
        }
        else
        {
            this.followState.behindDuration = 0
        }

        if(this.followState.behindDuration >= this.follow.behindReturnDelaySeconds)
        {
            this.followState.isRepositioning = true
            this.followState.behindDuration = 0
        }
    }

    rotateHorizontalDirectionTowards(currentDirection, targetDirection, maxAngle)
    {
        const currentYaw = Math.atan2(currentDirection.x, currentDirection.z)
        const targetYaw = Math.atan2(targetDirection.x, targetDirection.z)
        const deltaYaw = Math.atan2(Math.sin(targetYaw - currentYaw), Math.cos(targetYaw - currentYaw))
        const stepYaw = THREE.MathUtils.clamp(deltaYaw, -Math.max(0, maxAngle), Math.max(0, maxAngle))
        const nextYaw = currentYaw + stepYaw
        this.followReturnPosition.set(Math.sin(nextYaw), 0, Math.cos(nextYaw))
        return this.followReturnPosition
    }

    rotateHorizontalDirection(direction, angle, output)
    {
        const yaw = Math.atan2(direction.x, direction.z) + angle
        output.set(Math.sin(yaw), 0, Math.cos(yaw))
        return output
    }

    resolveFollowContourTarget({
        currentPosition,
        targetPosition,
        desiredDistance,
        preferredDirectionFromTarget,
        bobOffset
    } = {})
    {
        const directPathBlocked = this.isFollowPathBlocked(currentPosition, this.followDesiredPosition)
        if(!directPathBlocked)
        {
            return
        }

        const contourStep = Math.max(0.05, this.follow.contourAngularStepRadians)
        const contourSamples = Math.max(1, Math.floor(this.follow.contourSamplesPerSide))
        const minimumProgress = Math.max(0, this.follow.contourMinProgress)

        for(let sampleIndex = 1; sampleIndex <= contourSamples; sampleIndex++)
        {
            const angleOffset = contourStep * sampleIndex

            for(const side of [1, -1])
            {
                this.rotateHorizontalDirection(
                    preferredDirectionFromTarget,
                    angleOffset * side,
                    this.contourDirectionCandidate
                )

                this.contourCandidatePosition
                    .copy(targetPosition)
                    .addScaledVector(this.contourDirectionCandidate, desiredDistance)

                this.applyAvoidZones(this.contourCandidatePosition, currentPosition)

                const fallbackGroundY = currentPosition.y - this.baseY
                const groundY = this.resolveGroundYAt(
                    this.contourCandidatePosition.x,
                    this.contourCandidatePosition.z,
                    fallbackGroundY
                )
                if(this.isGroundBelowPlanAt(this.contourCandidatePosition.x, this.contourCandidatePosition.z, fallbackGroundY))
                {
                    continue
                }
                this.contourCandidatePosition.y = groundY + this.baseY + bobOffset

                const candidateProgress = this.contourCandidatePosition.distanceTo(currentPosition)
                if(candidateProgress < minimumProgress)
                {
                    continue
                }

                if(this.isFollowPathBlocked(currentPosition, this.contourCandidatePosition))
                {
                    continue
                }

                this.followDesiredPosition.copy(this.contourCandidatePosition)
                return
            }
        }
    }

    isFollowPathBlocked(fromPosition, toPosition)
    {
        const meshes = this.follow.collisionMeshes
        if(!Array.isArray(meshes) || meshes.length === 0)
        {
            return false
        }

        this.followCollisionDirection
            .set(
                toPosition.x - fromPosition.x,
                0,
                toPosition.z - fromPosition.z
            )

        const travelDistance = this.followCollisionDirection.length()
        if(travelDistance < 1e-5)
        {
            return false
        }

        this.followCollisionDirection.multiplyScalar(1 / travelDistance)
        const raycastFar = travelDistance + this.follow.colliderRadius
        const feetY = fromPosition.y - this.follow.colliderHeight + 0.02
        const sampleHeights = [feetY + 0.3, feetY + 0.85, fromPosition.y - 0.15]

        for(const sampleY of sampleHeights)
        {
            this.followRaycastOrigin.set(fromPosition.x, sampleY, fromPosition.z)
            this.followCollisionRaycaster.set(this.followRaycastOrigin, this.followCollisionDirection)
            this.followCollisionRaycaster.near = 0
            this.followCollisionRaycaster.far = raycastFar

            const hits = this.followCollisionRaycaster.intersectObjects(meshes, false)
            for(const hit of hits)
            {
                if(!hit.face)
                {
                    continue
                }

                this.followWorldNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
                if(!this.isBlockingCollisionHit(hit, this.followWorldNormal))
                {
                    continue
                }

                return true
            }
        }

        return false
    }

    resolveFollowCollisions()
    {
        this.resolveFollowMeshCollisions()
        this.resolveFollowBoxCollisions()
    }

    resolveFollowMeshCollisions()
    {
        const meshes = this.follow.collisionMeshes
        if(!Array.isArray(meshes) || meshes.length === 0)
        {
            return
        }

        this.followCollisionDirection
            .set(
                this.model.position.x - this.followPreviousPosition.x,
                0,
                this.model.position.z - this.followPreviousPosition.z
            )

        const travelDistance = this.followCollisionDirection.length()
        if(travelDistance < 1e-5)
        {
            return
        }

        this.followCollisionDirection.multiplyScalar(1 / travelDistance)
        const raycastFar = travelDistance + this.follow.colliderRadius
        const feetY = this.model.position.y - this.follow.colliderHeight + 0.02
        const sampleHeights = [feetY + 0.3, feetY + 0.85, this.model.position.y - 0.15]

        let hasBlockingHit = false
        let closestBlockingDistance = Infinity

        for(const sampleY of sampleHeights)
        {
            this.followRaycastOrigin.set(this.followPreviousPosition.x, sampleY, this.followPreviousPosition.z)
            this.followCollisionRaycaster.set(this.followRaycastOrigin, this.followCollisionDirection)
            this.followCollisionRaycaster.near = 0
            this.followCollisionRaycaster.far = raycastFar

            const hits = this.followCollisionRaycaster.intersectObjects(meshes, false)
            for(const hit of hits)
            {
                if(!hit.face)
                {
                    continue
                }

                this.followWorldNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
                if(!this.isBlockingCollisionHit(hit, this.followWorldNormal))
                {
                    continue
                }

                if(hit.distance < closestBlockingDistance)
                {
                    closestBlockingDistance = hit.distance
                    this.followCollisionHitNormal.copy(this.followWorldNormal)
                }
                hasBlockingHit = true
                break
            }
        }

        if(!hasBlockingHit)
        {
            return
        }

        this.followCollisionSlide
            .set(
                this.model.position.x - this.followPreviousPosition.x,
                0,
                this.model.position.z - this.followPreviousPosition.z
            )

        this.followCollisionSlideNormal
            .set(this.followCollisionHitNormal.x, 0, this.followCollisionHitNormal.z)

        if(this.followCollisionSlideNormal.lengthSq() > 1e-8)
        {
            this.followCollisionSlideNormal.normalize()
            const projection = this.followCollisionSlide.x * this.followCollisionSlideNormal.x
                + this.followCollisionSlide.z * this.followCollisionSlideNormal.z

            this.followCollisionSlide.x -= this.followCollisionSlideNormal.x * projection
            this.followCollisionSlide.z -= this.followCollisionSlideNormal.z * projection
        }

        if(this.followCollisionSlide.lengthSq() <= 1e-8)
        {
            this.model.position.x = this.followPreviousPosition.x
            this.model.position.z = this.followPreviousPosition.z
            return
        }

        this.model.position.x = this.followPreviousPosition.x + (this.followCollisionSlide.x * this.follow.collisionSlideFactor)
        this.model.position.z = this.followPreviousPosition.z + (this.followCollisionSlide.z * this.follow.collisionSlideFactor)
    }

    resolveFollowBoxCollisions()
    {
        const boxes = this.follow.collisionBoxes
        if(!Array.isArray(boxes) || boxes.length === 0)
        {
            return
        }

        const radius = this.follow.colliderRadius
        const radiusSq = radius * radius
        const feetY = this.model.position.y - this.follow.colliderHeight + 0.05
        const headY = this.model.position.y - 0.1

        for(let iteration = 0; iteration < 3; iteration++)
        {
            let hasCollision = false

            for(const box of boxes)
            {
                if(!box)
                {
                    continue
                }

                if(box.max.y <= feetY || box.min.y >= headY)
                {
                    continue
                }

                const closestX = THREE.MathUtils.clamp(this.model.position.x, box.min.x, box.max.x)
                const closestZ = THREE.MathUtils.clamp(this.model.position.z, box.min.z, box.max.z)

                let dx = this.model.position.x - closestX
                let dz = this.model.position.z - closestZ
                let distanceSq = (dx * dx) + (dz * dz)

                if(distanceSq >= radiusSq)
                {
                    continue
                }

                hasCollision = true

                if(distanceSq < 1e-8)
                {
                    const distanceToMinX = Math.abs(this.model.position.x - box.min.x)
                    const distanceToMaxX = Math.abs(box.max.x - this.model.position.x)
                    const distanceToMinZ = Math.abs(this.model.position.z - box.min.z)
                    const distanceToMaxZ = Math.abs(box.max.z - this.model.position.z)
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

                this.model.position.x += normalX * penetration
                this.model.position.z += normalZ * penetration
            }

            if(!hasCollision)
            {
                break
            }
        }
    }

    applyAvoidZones(position, currentPosition)
    {
        const zones = this.follow.avoidZones
        if(!Array.isArray(zones) || zones.length === 0)
        {
            return
        }

        for(const zone of zones)
        {
            const radius = Math.max(0, zone.radius ?? 0)
            if(radius === 0)
            {
                continue
            }

            let dx = position.x - zone.x
            let dz = position.z - zone.z
            let distance = Math.hypot(dx, dz)

            if(distance >= radius)
            {
                continue
            }

            if(distance < 1e-5)
            {
                dx = currentPosition.x - zone.x
                dz = currentPosition.z - zone.z
                distance = Math.hypot(dx, dz)
            }

            if(distance < 1e-5)
            {
                dx = this.followDirection.x
                dz = this.followDirection.z
                distance = Math.hypot(dx, dz)
            }

            if(distance < 1e-5)
            {
                continue
            }

            const invDistance = 1 / distance
            position.x = zone.x + (dx * invDistance * radius)
            position.z = zone.z + (dz * invDistance * radius)
        }
    }

    applyPathfindingToDesiredPosition({
        currentPosition,
        desiredPosition,
        bobOffset = 0,
        deltaSeconds = 0
    } = {})
    {
        if(!this.follow.pathfindingEnabled)
        {
            return
        }

        if(!currentPosition || !desiredPosition)
        {
            return
        }

        this.ensureNavGraph()
        if(!this.navGraph || this.navGraph.nodes.length === 0)
        {
            desiredPosition.x = currentPosition.x
            desiredPosition.z = currentPosition.z
            desiredPosition.y = currentPosition.y
            return
        }

        this.pathState.recomputeTimer = Math.max(
            0,
            this.pathState.recomputeTimer - Math.max(0, deltaSeconds)
        )

        const shouldRecompute = this.pathState.recomputeTimer <= 0
            || !this.pathState.hasPath
            || this.pathState.points.length === 0
            || this.shouldRecomputePathFromMovement(currentPosition, desiredPosition)

        if(shouldRecompute)
        {
            this.recomputeAStarPath(currentPosition, desiredPosition)
        }

        if(!this.pathState.hasPath || this.pathState.points.length === 0)
        {
            desiredPosition.x = currentPosition.x
            desiredPosition.z = currentPosition.z
            desiredPosition.y = currentPosition.y
            return
        }

        this.advancePathWaypointIndex(currentPosition)
        if(!this.pathState.hasPath || this.pathState.points.length === 0)
        {
            return
        }

        const waypoint = this.pathState.points[this.pathState.waypointIndex]
        if(!waypoint)
        {
            return
        }

        desiredPosition.x = waypoint.x
        desiredPosition.z = waypoint.z
        const fallbackGroundY = currentPosition.y - this.baseY
        const waypointGroundY = this.resolveGroundYAt(
            waypoint.x,
            waypoint.z,
            fallbackGroundY
        )
        desiredPosition.y = waypointGroundY + this.baseY + bobOffset
    }

    ensureNavGraph()
    {
        if(this.navGraph)
        {
            return
        }

        this.navGraph = this.buildNavGraphFromGroundMeshes()
    }

    shouldRecomputePathFromMovement(currentPosition, desiredPosition)
    {
        const lastStart = this.pathState.lastStart
        const lastGoal = this.pathState.lastGoal
        if(!lastStart || !lastGoal)
        {
            return true
        }

        const startDx = currentPosition.x - lastStart.x
        const startDz = currentPosition.z - lastStart.z
        const goalDx = desiredPosition.x - lastGoal.x
        const goalDz = desiredPosition.z - lastGoal.z

        const startRecomputeDistance = Math.max(0.85, this.follow.navCellSize * 1.5)
        const goalRecomputeDistance = Math.max(1.2, this.follow.navCellSize * 2)
        return ((startDx * startDx) + (startDz * startDz)) > (startRecomputeDistance * startRecomputeDistance)
            || ((goalDx * goalDx) + (goalDz * goalDz)) > (goalRecomputeDistance * goalRecomputeDistance)
    }

    advancePathWaypointIndex(currentPosition)
    {
        const points = this.pathState.points
        if(!Array.isArray(points) || points.length === 0)
        {
            this.pathState.hasPath = false
            return
        }

        const reachDistance = Math.max(0.05, this.follow.pathWaypointReachDistance)
        while(this.pathState.waypointIndex < points.length - 1)
        {
            const waypoint = points[this.pathState.waypointIndex]
            const dx = waypoint.x - currentPosition.x
            const dz = waypoint.z - currentPosition.z
            if((dx * dx) + (dz * dz) > (reachDistance * reachDistance))
            {
                break
            }
            this.pathState.waypointIndex += 1
        }
    }

    recomputeAStarPath(startPosition, goalPosition)
    {
        this.pathState.recomputeTimer = Math.max(0.05, this.follow.pathRecomputeIntervalSeconds)
        const path = this.computeAStarPath(startPosition, goalPosition)
        if(!path || path.length === 0)
        {
            this.pathState.hasPath = false
            this.pathState.points = []
            this.pathState.waypointIndex = 0
            this.pathState.lastStart = { x: startPosition.x, z: startPosition.z }
            this.pathState.lastGoal = { x: goalPosition.x, z: goalPosition.z }
            return
        }

        this.pathState.points = path
        this.pathState.waypointIndex = 0
        this.pathState.hasPath = true
        this.pathState.lastStart = { x: startPosition.x, z: startPosition.z }
        this.pathState.lastGoal = { x: goalPosition.x, z: goalPosition.z }
    }

    computeAStarPath(startPosition, goalPosition)
    {
        const graph = this.navGraph
        if(!graph || graph.nodes.length === 0)
        {
            return null
        }

        const maxAttachDistance = Math.max(this.follow.navLinkDistance, this.follow.navCellSize * 2.2)
        const maxAttachDistanceSq = maxAttachDistance * maxAttachDistance
        const startIndex = this.findNearestNavNodeIndex(graph, startPosition.x, startPosition.z, maxAttachDistanceSq)
        const goalIndex = this.findNearestNavNodeIndex(graph, goalPosition.x, goalPosition.z, maxAttachDistanceSq)
        if(startIndex < 0 || goalIndex < 0)
        {
            return null
        }

        if(startIndex === goalIndex)
        {
            return [{
                x: graph.nodes[startIndex].x,
                y: graph.nodes[startIndex].y,
                z: graph.nodes[startIndex].z
            }]
        }

        const nodeCount = graph.nodes.length
        const gScore = new Array(nodeCount).fill(Number.POSITIVE_INFINITY)
        const fScore = new Array(nodeCount).fill(Number.POSITIVE_INFINITY)
        const cameFrom = new Array(nodeCount).fill(-1)
        const openSet = new Set([startIndex])

        gScore[startIndex] = 0
        fScore[startIndex] = this.estimateHeuristic(graph, startIndex, goalIndex)

        while(openSet.size > 0)
        {
            let currentIndex = -1
            let bestFScore = Number.POSITIVE_INFINITY
            for(const index of openSet)
            {
                if(fScore[index] < bestFScore)
                {
                    bestFScore = fScore[index]
                    currentIndex = index
                }
            }

            if(currentIndex < 0)
            {
                break
            }

            if(currentIndex === goalIndex)
            {
                return this.reconstructPath(graph, cameFrom, currentIndex)
            }

            openSet.delete(currentIndex)
            const neighbors = graph.neighbors[currentIndex] ?? []
            for(const neighborIndex of neighbors)
            {
                const tentativeG = gScore[currentIndex] + this.getPathTravelCost(graph, currentIndex, neighborIndex)
                if(tentativeG >= gScore[neighborIndex])
                {
                    continue
                }

                cameFrom[neighborIndex] = currentIndex
                gScore[neighborIndex] = tentativeG
                fScore[neighborIndex] = tentativeG + this.estimateHeuristic(graph, neighborIndex, goalIndex)
                openSet.add(neighborIndex)
            }
        }

        return null
    }

    buildNavGraphFromGroundMeshes()
    {
        const groundMeshes = this.follow.groundMeshes
        if(!Array.isArray(groundMeshes) || groundMeshes.length === 0)
        {
            return null
        }

        const cellSize = Math.max(0.5, this.follow.navCellSize)
        const linkDistance = Math.max(cellSize * 1.8, this.follow.navLinkDistance)
        const linkDistanceSq = linkDistance * linkDistance
        const dedupeByCell = new Map()
        const nodes = []
        let neighbors = []

        const addNodeForWorldPoint = (x, y, z, allowBelowMinY = false) =>
        {
            if(y < this.follow.minGroundY && !allowBelowMinY)
            {
                return -1
            }

            if(this.isPointBlockedByAvoidZones(x, z) || this.isPointBlockedByCollisionBoxes(x, z))
            {
                return -1
            }

            const cellX = Math.round(x / cellSize)
            const cellZ = Math.round(z / cellSize)
            const key = `${cellX}:${cellZ}`
            const existingIndex = dedupeByCell.get(key)
            if(existingIndex !== undefined)
            {
                const existingNode = nodes[existingIndex]
                if(y > existingNode.y)
                {
                    existingNode.x = x
                    existingNode.y = y
                    existingNode.z = z
                }
                return existingIndex
            }

            const nodeIndex = nodes.length
            dedupeByCell.set(key, nodeIndex)
            nodes.push({ x, y, z })
            return nodeIndex
        }

        const connectNodes = (fromIndex, toIndex) =>
        {
            if(fromIndex < 0 || toIndex < 0 || fromIndex === toIndex)
            {
                return
            }

            const fromNode = nodes[fromIndex]
            const toNode = nodes[toIndex]
            if(!fromNode || !toNode)
            {
                return
            }

            const dx = toNode.x - fromNode.x
            const dz = toNode.z - fromNode.z
            const distanceSq = (dx * dx) + (dz * dz)
            if(distanceSq > linkDistanceSq)
            {
                return
            }

            if(Math.abs(toNode.y - fromNode.y) > (this.follow.groundMaxSnapUp + 0.55))
            {
                return
            }

            neighbors[fromIndex] = neighbors[fromIndex] ?? []
            neighbors[toIndex] = neighbors[toIndex] ?? []
            if(neighbors[fromIndex].length < BLOOM_NAV_MAX_NEIGHBORS && !neighbors[fromIndex].includes(toIndex))
            {
                neighbors[fromIndex].push(toIndex)
            }
            if(neighbors[toIndex].length < BLOOM_NAV_MAX_NEIGHBORS && !neighbors[toIndex].includes(fromIndex))
            {
                neighbors[toIndex].push(fromIndex)
            }
        }

        for(const mesh of groundMeshes)
        {
            const geometry = mesh?.geometry
            const positionAttribute = geometry?.attributes?.position
            if(!positionAttribute)
            {
                continue
            }

            mesh.updateMatrixWorld(true)
            const indexedArray = geometry.index?.array
            const vertexCount = positionAttribute.count
            const vertexToNodeIndex = new Int32Array(vertexCount).fill(-1)

            const ensureNodeForVertex = (vertexIndex) =>
            {
                const cached = vertexToNodeIndex[vertexIndex]
                if(cached >= 0)
                {
                    return cached
                }
                if(cached === -2)
                {
                    return -1
                }

                this.pathWaypointWorld
                    .fromBufferAttribute(positionAttribute, vertexIndex)
                    .applyMatrix4(mesh.matrixWorld)

                const isBridgeSurface = this.isBridgeSurface(mesh)
                const nodeIndex = addNodeForWorldPoint(
                    this.pathWaypointWorld.x,
                    this.pathWaypointWorld.y,
                    this.pathWaypointWorld.z,
                    isBridgeSurface
                )
                vertexToNodeIndex[vertexIndex] = nodeIndex >= 0 ? nodeIndex : -2
                return nodeIndex
            }

            if(indexedArray && indexedArray.length >= 3)
            {
                for(let index = 0; index < indexedArray.length; index += 3)
                {
                    const a = ensureNodeForVertex(indexedArray[index])
                    const b = ensureNodeForVertex(indexedArray[index + 1])
                    const c = ensureNodeForVertex(indexedArray[index + 2])
                    connectNodes(a, b)
                    connectNodes(b, c)
                    connectNodes(c, a)
                }
            }
            else
            {
                for(let index = 0; index <= vertexCount - 3; index += 3)
                {
                    const a = ensureNodeForVertex(index)
                    const b = ensureNodeForVertex(index + 1)
                    const c = ensureNodeForVertex(index + 2)
                    connectNodes(a, b)
                    connectNodes(b, c)
                    connectNodes(c, a)
                }
            }
        }

        if(nodes.length === 0)
        {
            return null
        }

        if(nodes.length > BLOOM_NAV_MAX_NODES)
        {
            const step = Math.ceil(nodes.length / BLOOM_NAV_MAX_NODES)
            const keepOldIndices = []
            for(let index = 0; index < nodes.length; index += step)
            {
                keepOldIndices.push(index)
            }

            const remap = new Map()
            const reducedNodes = []
            for(let index = 0; index < keepOldIndices.length; index++)
            {
                const oldIndex = keepOldIndices[index]
                remap.set(oldIndex, index)
                reducedNodes.push(nodes[oldIndex])
            }

            const reducedNeighbors = Array.from({ length: reducedNodes.length }, () => [])
            for(const oldFromIndex of keepOldIndices)
            {
                const fromIndex = remap.get(oldFromIndex)
                const oldNeighborList = neighbors[oldFromIndex] ?? []
                for(const oldToIndex of oldNeighborList)
                {
                    if(!remap.has(oldToIndex))
                    {
                        continue
                    }

                    const toIndex = remap.get(oldToIndex)
                    if(fromIndex === toIndex)
                    {
                        continue
                    }

                    if(!reducedNeighbors[fromIndex].includes(toIndex)
                        && reducedNeighbors[fromIndex].length < BLOOM_NAV_MAX_NEIGHBORS)
                    {
                        reducedNeighbors[fromIndex].push(toIndex)
                    }
                }
            }

            neighbors = reducedNeighbors
            return {
                nodes: reducedNodes,
                neighbors
            }
        }

        return {
            nodes,
            neighbors
        }
    }

    isPointBlockedByAvoidZones(x, z)
    {
        const zones = this.follow.avoidZones
        if(!Array.isArray(zones) || zones.length === 0)
        {
            return false
        }

        for(const zone of zones)
        {
            const radius = Math.max(0, zone.radius ?? 0)
            if(radius <= 0)
            {
                continue
            }

            const dx = x - zone.x
            const dz = z - zone.z
            if((dx * dx) + (dz * dz) <= (radius * radius))
            {
                return true
            }
        }

        return false
    }

    isPointBlockedByCollisionBoxes(x, z)
    {
        const boxes = this.follow.collisionBoxes
        if(!Array.isArray(boxes) || boxes.length === 0)
        {
            return false
        }

        const radius = this.follow.colliderRadius
        for(const box of boxes)
        {
            if(!box)
            {
                continue
            }

            const closestX = THREE.MathUtils.clamp(x, box.min.x, box.max.x)
            const closestZ = THREE.MathUtils.clamp(z, box.min.z, box.max.z)
            const dx = x - closestX
            const dz = z - closestZ
            if((dx * dx) + (dz * dz) < (radius * radius))
            {
                return true
            }
        }

        return false
    }

    findNearestNavNodeIndex(graph, x, z, maxDistanceSq = Number.POSITIVE_INFINITY)
    {
        const { nodes } = graph
        let bestIndex = -1
        let bestDistanceSq = Number.POSITIVE_INFINITY

        for(let index = 0; index < nodes.length; index++)
        {
            const node = nodes[index]
            const dx = node.x - x
            const dz = node.z - z
            const distanceSq = (dx * dx) + (dz * dz)
            if(distanceSq < bestDistanceSq)
            {
                bestDistanceSq = distanceSq
                bestIndex = index
            }
        }

        if(bestDistanceSq > maxDistanceSq)
        {
            return -1
        }

        return bestIndex
    }

    estimateHeuristic(graph, fromIndex, toIndex)
    {
        const fromNode = graph.nodes[fromIndex]
        const toNode = graph.nodes[toIndex]
        const dx = toNode.x - fromNode.x
        const dz = toNode.z - fromNode.z
        return Math.hypot(dx, dz)
    }

    getPathTravelCost(graph, fromIndex, toIndex)
    {
        const fromNode = graph.nodes[fromIndex]
        const toNode = graph.nodes[toIndex]
        const dx = toNode.x - fromNode.x
        const dz = toNode.z - fromNode.z
        const horizontalDistance = Math.hypot(dx, dz)
        const verticalPenalty = Math.abs(toNode.y - fromNode.y) * 0.75
        return horizontalDistance + verticalPenalty
    }

    reconstructPath(graph, cameFrom, currentIndex)
    {
        const path = []
        let walkIndex = currentIndex
        while(walkIndex >= 0)
        {
            const node = graph.nodes[walkIndex]
            path.push({ x: node.x, y: node.y, z: node.z })
            walkIndex = cameFrom[walkIndex]
        }
        path.reverse()
        return path
    }

    getDynamicWalkFrequency()
    {
        const referenceSpeed = Math.max(0.001, this.follow.speed)
        const normalizedSpeed = THREE.MathUtils.clamp(this.locomotionSpeed / referenceSpeed, 0, 3)
        const frequencyMultiplier = 1 + (normalizedSpeed * this.motion.walkFrequencySpeedInfluence)
        return this.motion.walkFrequency * frequencyMultiplier
    }

    moveTowardsPosition(currentPosition, desiredPosition, speed, deltaSeconds)
    {
        const maxStep = Math.max(0, speed) * Math.max(0, deltaSeconds)
        this.movementDelta.copy(desiredPosition).sub(currentPosition)
        const distanceToTarget = this.movementDelta.length()

        if(distanceToTarget <= 1e-6)
        {
            return
        }

        if(maxStep <= 1e-8)
        {
            return
        }

        if(distanceToTarget <= maxStep)
        {
            currentPosition.copy(desiredPosition)
            return
        }

        currentPosition.addScaledVector(this.movementDelta, maxStep / distanceToTarget)
    }

    updateLocomotionState(previousPosition, deltaSeconds)
    {
        this.movementDelta
            .set(
                this.model.position.x - previousPosition.x,
                0,
                this.model.position.z - previousPosition.z
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

    updateFacingFromDirection(direction, deltaSeconds)
    {
        if(!this.model || direction.lengthSq() <= 1e-8)
        {
            return
        }

        const targetYaw = Math.atan2(direction.x, direction.z)
        const currentYaw = this.model.rotation.y - this.baseYaw
        const deltaYaw = Math.atan2(Math.sin(targetYaw - currentYaw), Math.cos(targetYaw - currentYaw))
        const rotationAlpha = 1 - Math.exp(-this.follow.lookTurnSpeed * Math.max(0, deltaSeconds))
        this.model.rotation.y = this.baseYaw + currentYaw + (deltaYaw * rotationAlpha)
    }

    resolveGroundYAt(x, z, fallbackY = 0)
    {
        const groundMeshes = this.follow.groundMeshes
        if(!Array.isArray(groundMeshes) || groundMeshes.length === 0)
        {
            return fallbackY
        }

        const origin = new THREE.Vector3(x, fallbackY + 12, z)
        this.groundRaycaster.set(origin, this.followGroundRayDirection)
        this.groundRaycaster.near = 0
        this.groundRaycaster.far = 50

        const hits = this.groundRaycaster.intersectObjects(groundMeshes, false)
        for(const hit of hits)
        {
            if(!hit.face)
            {
                continue
            }

            this.groundNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
            if(this.groundNormal.y < 0.45)
            {
                continue
            }

            if((hit.point.y - fallbackY) > this.follow.groundMaxSnapUp)
            {
                continue
            }

            const isBridgeSurface = this.isBridgeSurface(hit.object)
            if(hit.point.y < this.follow.minGroundY && !isBridgeSurface)
            {
                continue
            }

            return hit.point.y
        }

        return fallbackY
    }

    isGroundBelowPlanAt(x, z, fallbackY = 0)
    {
        if(!Number.isFinite(this.follow.minGroundY))
        {
            return false
        }

        const groundMeshes = this.follow.groundMeshes
        if(!Array.isArray(groundMeshes) || groundMeshes.length === 0)
        {
            return false
        }

        const origin = new THREE.Vector3(x, fallbackY + 12, z)
        this.groundRaycaster.set(origin, this.followGroundRayDirection)
        this.groundRaycaster.near = 0
        this.groundRaycaster.far = 50

        const hits = this.groundRaycaster.intersectObjects(groundMeshes, false)
        for(const hit of hits)
        {
            if(!hit.face)
            {
                continue
            }

            this.groundNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
            if(this.groundNormal.y < 0.45)
            {
                continue
            }

            if((hit.point.y - fallbackY) > this.follow.groundMaxSnapUp)
            {
                continue
            }

            if(this.isBridgeSurface(hit.object))
            {
                return false
            }

            return hit.point.y < this.follow.minGroundY
        }

        return false
    }

    isBlockingCollisionHit(hit, worldNormal)
    {
        const isRelief = this.hasNameInHierarchy(hit?.object, ['relief'])
        if(isRelief)
        {
            return true
        }

        return worldNormal.y <= this.follow.collisionBlockingNormalMaxY
    }

    isBridgeSurface(object)
    {
        return this.hasNameInHierarchy(object, ['pont', 'bridge'])
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

    updateArms()
    {
        const walkCycle = this.walkCyclePhase

        for(const armPart of this.armNodes)
        {
            const swing = Math.sin(walkCycle * armPart.frequencyMultiplier + armPart.phaseOffset) * armPart.amplitude * this.motion.swingIntensity
            this.tmpQuaternion.setFromAxisAngle(armPart.axis, swing * armPart.direction)
            armPart.node.quaternion.copy(armPart.baseQuaternion).multiply(this.tmpQuaternion)
        }
    }

    destroy()
    {
        this.debugFolder?.dispose?.()

        if(this.model)
        {
            for(const armPart of this.armNodes)
            {
                armPart.node.quaternion.copy(armPart.baseQuaternion)
            }

            this.scene.remove(this.model)
            this.model = null
        }

        if(this.fallback)
        {
            this.scene.remove(this.fallback)
            this.fallback.geometry.dispose()
            this.fallback.material.dispose()
            this.fallback = null
        }

        this.armNodes = []
    }
}
