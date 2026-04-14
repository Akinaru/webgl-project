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
            visualScale: 1
        }

        this.motion = {
            center: motion.center instanceof THREE.Vector3
                ? motion.center.clone()
                : new THREE.Vector3(motion.center?.x ?? 0, motion.center?.y ?? 0, motion.center?.z ?? -6),
            radius: motion.radius ?? 7,
            turnSpeed: motion.turnSpeed ?? 0.26,
            walkFrequency: motion.walkFrequency ?? 1.7,
            bobAmplitude: motion.bobAmplitude ?? 0.06,
            swingIntensity: motion.swingIntensity ?? 1
        }
        this.follow = {
            target: follow.target ?? null,
            getTargetPosition: typeof follow.getTargetPosition === 'function' ? follow.getTargetPosition : null,
            minDistance: follow.minDistance ?? 2.8,
            maxDistance: follow.maxDistance ?? 6.5,
            preferredDistance: follow.preferredDistance ?? 4.2,
            heightOffset: follow.heightOffset ?? 0.8,
            speed: follow.speed ?? 4.2,
            groundMeshes: Array.isArray(follow.groundMeshes) ? follow.groundMeshes : [],
            avoidZones: Array.isArray(follow.avoidZones) ? follow.avoidZones : [],
            enabled: Boolean(follow.target || follow.getTargetPosition)
        }
        this.followDirection = new THREE.Vector3(1, 0, 0)
        this.followTargetPosition = new THREE.Vector3()
        this.followDesiredPosition = new THREE.Vector3()
        this.groundRaycaster = new THREE.Raycaster()
        this.groundNormal = new THREE.Vector3()

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

        this.setDebug()
    }

    setModel()
    {
        this.model = this.resource.scene.clone(true)

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
    }

    update()
    {
        if(this.model)
        {
            this.updateMotion()
            this.updateArms()
            return
        }

        if(this.fallback)
        {
            this.fallback.rotation.x += this.time.delta * 0.0004
            this.fallback.rotation.y += this.time.delta * 0.0007
        }
    }

    updateMotion()
    {
        const elapsed = this.time.elapsed * 0.001
        const angle = elapsed * this.motion.turnSpeed
        const walkCycle = elapsed * this.motion.walkFrequency * Math.PI * 2
        const bobOffset = Math.sin(walkCycle) * this.motion.bobAmplitude
        const deltaSeconds = Math.min(this.time.delta, 50) * 0.001

        if(this.follow.enabled && this.resolveFollowTargetPosition())
        {
            this.updateFollowMotion(deltaSeconds, bobOffset)
            return
        }

        this.model.position.x = this.motion.center.x + Math.cos(angle) * this.motion.radius
        this.model.position.z = this.motion.center.z + Math.sin(angle) * this.motion.radius
        const baseGroundY = this.resolveGroundYAt(
            this.model.position.x,
            this.model.position.z,
            this.motion.center.y
        )
        this.model.position.y = baseGroundY + this.baseY + bobOffset

        this.direction.set(-Math.sin(angle), 0, Math.cos(angle))
        const heading = Math.atan2(this.direction.x, this.direction.z)
        this.model.rotation.set(0, this.baseYaw + heading, 0)
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

        const shouldMoveCloser = horizontalDistance > this.follow.maxDistance
        const desiredDistance = this.follow.preferredDistance
        const shouldAdjust = shouldMoveCloser

        this.followDesiredPosition.copy(current)

        if(shouldAdjust)
        {
            this.followDesiredPosition
                .copy(this.followTargetPosition)
                .addScaledVector(this.direction, -desiredDistance)
        }

        this.applyAvoidZones(this.followDesiredPosition, current)

        const fallbackGroundY = current.y - this.baseY
        const groundY = this.resolveGroundYAt(
            this.followDesiredPosition.x,
            this.followDesiredPosition.z,
            fallbackGroundY
        )
        this.followDesiredPosition.y = groundY + this.baseY + bobOffset

        const interpolation = 1 - Math.exp(-this.follow.speed * deltaSeconds)
        current.lerp(this.followDesiredPosition, interpolation)
        this.applyAvoidZones(current, current)

        this.direction
            .set(
                this.followTargetPosition.x - current.x,
                0,
                this.followTargetPosition.z - current.z
            )

        if(this.direction.lengthSq() > 1e-8)
        {
            this.direction.normalize()
            const heading = Math.atan2(this.direction.x, this.direction.z)
            this.model.rotation.set(0, this.baseYaw + heading, 0)
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

    resolveGroundYAt(x, z, fallbackY = 0)
    {
        const groundMeshes = this.follow.groundMeshes
        if(!Array.isArray(groundMeshes) || groundMeshes.length === 0)
        {
            return fallbackY
        }

        const origin = new THREE.Vector3(x, fallbackY + 12, z)
        this.groundRaycaster.set(origin, new THREE.Vector3(0, -1, 0))
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
        const elapsed = this.time.elapsed * 0.001
        const walkCycle = elapsed * this.motion.walkFrequency * Math.PI * 2

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
