import * as THREE from 'three'
import Experience from '../Experience.js'

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
            enabled: Boolean(follow.target || follow.getTargetPosition)
        }
        this.followDirection = new THREE.Vector3(1, 0, 0)
        this.followTargetPosition = new THREE.Vector3()
        this.followDesiredPosition = new THREE.Vector3()
        this.followPreviousPosition = new THREE.Vector3()
        this.followCameraForward = new THREE.Vector3()
        this.followToBloom = new THREE.Vector3()
        this.followReturnPosition = new THREE.Vector3()
        this.followGroundRayDirection = new THREE.Vector3(0, -1, 0)
        this.followCollisionDirection = new THREE.Vector3()
        this.followRaycastOrigin = new THREE.Vector3()
        this.followWorldNormal = new THREE.Vector3()
        this.followCollisionRaycaster = new THREE.Raycaster()
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
        this.followDesiredPosition.y = groundY + this.baseY + bobOffset

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

        if(directionFromTarget.lengthSq() <= 1e-8)
        {
            this.followState.behindDuration = 0
            this.followState.isRepositioning = false
            return
        }

        const dot = this.followCameraForward.dot(directionFromTarget)
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

        for(const sampleY of sampleHeights)
        {
            this.followRaycastOrigin.set(this.followPreviousPosition.x, sampleY, this.followPreviousPosition.z)
            this.followCollisionRaycaster.set(this.followRaycastOrigin, this.followCollisionDirection)
            this.followCollisionRaycaster.near = 0
            this.followCollisionRaycaster.far = raycastFar

            const hits = this.followCollisionRaycaster.intersectObjects(meshes, false)
            let hasBlockingHit = false
            for(const hit of hits)
            {
                if(!hit.face)
                {
                    continue
                }

                this.followWorldNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
                if(this.followWorldNormal.y > 0.25)
                {
                    continue
                }

                hasBlockingHit = true
                break
            }

            if(!hasBlockingHit)
            {
                continue
            }

            this.model.position.x = this.followPreviousPosition.x
            this.model.position.z = this.followPreviousPosition.z
            return
        }
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

            return hit.point.y
        }

        return fallbackY
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
