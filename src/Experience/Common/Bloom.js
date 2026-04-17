import * as THREE from 'three'
import Experience from '../Experience.js'
import BloomRailSystem from './BloomRailSystem.js'

const BLOOM_FACING_OFFSET_RADIANS = 0.25
const BLOOM_UV_ZOOM = 1.15

export default class Bloom
{
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
        this.bloomOpacityTexture = this.resources.items.bloomOpacityTexture ?? null

        this.tuning = {
            facingOffsetRadians: BLOOM_FACING_OFFSET_RADIANS,
            uvZoom: BLOOM_UV_ZOOM,
            lookTurnSpeed: rails.lookTurnSpeed ?? 11
        }

        this.tmpQuaternion = new THREE.Quaternion()
        this.direction = new THREE.Vector3()
        this.movementDelta = new THREE.Vector3()
        this.movementDirection = new THREE.Vector3(0, 0, 1)
        this.followTargetPosition = new THREE.Vector3()
        this.previousAnchorPosition = new THREE.Vector3()
        this.railAnchorPosition = new THREE.Vector3()

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

        this.rails = new BloomRailSystem({
            scene: this.scene,
            rails: rails.lines ?? rails.rails ?? [],
            speed: rails.speed ?? 3.8,
            railSwitchDistance: rails.railSwitchDistance ?? 0.7,
            endpointSwitchDistance: rails.endpointSwitchDistance ?? 1.4,
            helperPointRadius: rails.helperPointRadius ?? 0.08,
            showHelpers: rails.showHelpers ?? false
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
            this.railAnchorPosition.copy(this.model.position)
            this.railAnchorPosition.y -= this.baseY
            this.previousAnchorPosition.copy(this.railAnchorPosition)
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
        this.baseYaw = this.model.rotation.y + this.tuning.facingOffsetRadians
        this.model.position.y = this.baseY

        this.model.traverse((child) =>
        {
            if(!child?.isMesh)
            {
                return
            }

            child.castShadow = true
            child.receiveShadow = true
        })

        this.model.traverse((child) =>
        {
            if(!child?.isMesh)
            {
                return
            }

            if(!this.isBloomTargetMesh(child))
            {
                return
            }

            this.applyBloomColorTexture(child)
        })

        this.scene.add(this.model)
    }

    isBloomTargetMesh(mesh)
    {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const hasMat2Material = materials.some((material) =>
        {
            const name = String(material?.name || '').toLowerCase()
            return name === 'mat.2' || name.includes('mat.2')
        })
        const meshName = String(mesh.name || '').toLowerCase()
        const isTargetMesh = meshName === 'bloom-face' || meshName.includes('bloom-face')
        return isTargetMesh || hasMat2Material
    }

    applyBloomColorTexture(mesh)
    {
        if(!this.bloomColorTexture && !this.bloomOpacityTexture)
        {
            return
        }

        this.ensureMeshUvAttribute(mesh)
        this.ensureMeshNormals(mesh)
        const hasUv = Boolean(mesh?.geometry?.getAttribute?.('uv'))

        if(this.bloomColorTexture)
        {
            this.bloomColorTexture.flipY = false
            this.bloomColorTexture.colorSpace = THREE.SRGBColorSpace
            this.bloomColorTexture.needsUpdate = true
        }

        if(this.bloomOpacityTexture)
        {
            this.bloomOpacityTexture.flipY = false
            if('NoColorSpace' in THREE)
            {
                this.bloomOpacityTexture.colorSpace = THREE.NoColorSpace
            }
            this.bloomOpacityTexture.needsUpdate = true
        }

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for(const material of materials)
        {
            if(!material)
            {
                continue
            }

            if(this.bloomColorTexture)
            {
                material.map = this.bloomColorTexture
            }

            material.color?.set?.('#ffffff')
            material.emissive?.set?.('#000000')
            if(typeof material.emissiveIntensity === 'number')
            {
                material.emissiveIntensity = 1
            }

            if(this.bloomOpacityTexture && hasUv)
            {
                material.alphaMap = this.bloomOpacityTexture
                material.alphaTest = 0.5
                material.transparent = true
                material.opacity = 1
                material.side = THREE.DoubleSide
            }
            else
            {
                material.alphaMap = null
                material.alphaTest = 0
                material.transparent = false
                material.opacity = 1
                material.side = THREE.FrontSide
            }

            material.needsUpdate = true
        }
    }

    ensureMeshUvAttribute(mesh, forceRegenerate = false)
    {
        const geometry = mesh?.geometry
        if(!(geometry instanceof THREE.BufferGeometry))
        {
            return false
        }

        if(geometry.getAttribute('uv'))
        {
            if(forceRegenerate && geometry.userData?.bloomGeneratedUv)
            {
                // recompute with latest tuning.uvZoom
            }
            else
            {
                return true
            }
        }

        const position = geometry.getAttribute('position')
        if(!position)
        {
            return false
        }

        geometry.computeBoundingBox()
        const bounds = geometry.boundingBox
        if(!bounds)
        {
            return false
        }

        const size = new THREE.Vector3()
        bounds.getSize(size)
        const minAxis = Math.min(size.x, size.y, size.z)
        const useXY = minAxis === size.z && size.x >= 1e-5 && size.y >= 1e-5
        const useXZ = minAxis === size.y && size.x >= 1e-5 && size.z >= 1e-5
        const useYZ = minAxis === size.x && size.y >= 1e-5 && size.z >= 1e-5

        const uvArray = new Float32Array(position.count * 2)
        for(let index = 0; index < position.count; index++)
        {
            const x = position.getX(index)
            const y = position.getY(index)
            const z = position.getZ(index)

            let u = 0
            let v = 0

            if(useXY)
            {
                u = (x - bounds.min.x) / Math.max(size.x, 1e-5)
                v = (y - bounds.min.y) / Math.max(size.y, 1e-5)
            }
            else if(useXZ)
            {
                u = (x - bounds.min.x) / Math.max(size.x, 1e-5)
                v = (z - bounds.min.z) / Math.max(size.z, 1e-5)
            }
            else if(useYZ)
            {
                u = (y - bounds.min.y) / Math.max(size.y, 1e-5)
                v = (z - bounds.min.z) / Math.max(size.z, 1e-5)
            }

            const zoom = Math.max(0.05, this.tuning.uvZoom)
            const zoomedU = ((u - 0.5) / zoom) + 0.5
            const zoomedV = ((v - 0.5) / zoom) + 0.5
            uvArray[index * 2] = THREE.MathUtils.clamp(zoomedU, 0, 1)
            uvArray[(index * 2) + 1] = 1 - THREE.MathUtils.clamp(zoomedV, 0, 1)
        }

        geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2))
        geometry.userData.bloomGeneratedUv = true
        return false
    }

    refreshBloomTargetMaterials({ forceRegenerateUv = false } = {})
    {
        if(!this.model)
        {
            return
        }

        this.model.traverse((child) =>
        {
            if(!child?.isMesh || !this.isBloomTargetMesh(child))
            {
                return
            }

            if(forceRegenerateUv)
            {
                this.ensureMeshUvAttribute(child, true)
            }
            this.applyBloomColorTexture(child)
        })
    }

    ensureMeshNormals(mesh)
    {
        const geometry = mesh?.geometry
        if(!(geometry instanceof THREE.BufferGeometry))
        {
            return
        }

        if(!geometry.getAttribute('normal'))
        {
            geometry.computeVertexNormals()
        }
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

        this.debug.addBinding(this.debugFolder, this.tuning, 'facingOffsetRadians', {
            label: 'facingOffset',
            min: -Math.PI,
            max: Math.PI,
            step: 0.01
        }).on('change', ({ value }) =>
        {
            this.tuning.facingOffsetRadians = value
            if(this.model)
            {
                this.baseYaw = this.model.rotation.y + value
            }
        })

        this.debug.addBinding(this.debugFolder, this.tuning, 'lookTurnSpeed', {
            label: 'turnSpeed',
            min: 0.1,
            max: 30,
            step: 0.1
        })

        this.debug.addBinding(this.debugFolder, this.tuning, 'uvZoom', {
            label: 'uvZoom',
            min: 0.2,
            max: 3,
            step: 0.01
        }).on('change', ({ value }) =>
        {
            this.tuning.uvZoom = value
            this.refreshBloomTargetMaterials({ forceRegenerateUv: true })
        })

        this.debug.addBinding(this.debugFolder, this.motion, 'radius', {
            label: 'idleRadius',
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

        this.debug.addBinding(this.debugFolder, this.motion, 'walkFrequency', {
            label: 'walkFreq',
            min: 0,
            max: 8,
            step: 0.01
        })

        this.debug.addBinding(this.debugFolder, this.motion, 'walkFrequencySpeedInfluence', {
            label: 'walkBySpeed',
            min: 0,
            max: 3,
            step: 0.01
        })

        this.railsFolder = this.debug.addFolder('Bloom Rails', {
            parent: this.debugFolder,
            expanded: false
        })

        this.debug.addBinding(this.railsFolder, this.rails.settings, 'speed', {
            label: 'railSpeed',
            min: 0.1,
            max: 20,
            step: 0.1
        })

        this.debug.addBinding(this.railsFolder, this.rails.settings, 'railSwitchDistance', {
            label: 'switchDist',
            min: 0.1,
            max: 4,
            step: 0.05
        })

        this.debug.addBinding(this.railsFolder, this.rails.settings, 'endpointSwitchDistance', {
            label: 'endSwitchDist',
            min: 0.1,
            max: 6,
            step: 0.05
        })

        this.debug.addBinding(this.railsFolder, this.rails.settings, 'showHelpers', {
            label: 'showRails'
        }).on('change', ({ value }) =>
        {
            this.rails.setHelpersVisible(value)
        })

        this.debug.addBinding(this.railsFolder, this.railEditor, 'addPointAtPlayer', {
            label: 'Add Point @Player'
        })

        this.debug.addBinding(this.railsFolder, this.railEditor, 'startNewLineAtPlayer', {
            label: 'New Line @Player'
        })

        this.debug.addBinding(this.railsFolder, this.railEditor, 'clearLines', {
            label: 'Clear Rails'
        })

        this.debug.addBinding(this.railsFolder, this.railEditor, 'exportLinesToConsole', {
            label: 'Export JSON'
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
        const walkFrequency = this.getDynamicWalkFrequency()
        this.walkCyclePhase += deltaSeconds * walkFrequency * Math.PI * 2
        const bobOffset = Math.sin(this.walkCyclePhase) * this.motion.bobAmplitude

        if(this.follow.enabled && this.resolveFollowTargetPosition() && this.rails.hasRails())
        {
            this.updateRailMotion(deltaSeconds, bobOffset)
            return
        }

        this.updateIdleMotion(elapsed, deltaSeconds, bobOffset)
    }

    updateRailMotion(deltaSeconds, bobOffset)
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

        if(this.movementDirection.lengthSq() > 1e-8)
        {
            this.updateFacingFromDirection(this.movementDirection, deltaSeconds)
            return
        }

        if(didMove)
        {
            return
        }

        this.direction
            .set(
                this.followTargetPosition.x - this.model.position.x,
                0,
                this.followTargetPosition.z - this.model.position.z
            )

        if(this.direction.lengthSq() > 1e-8)
        {
            this.direction.normalize()
            this.updateFacingFromDirection(this.direction, deltaSeconds)
        }
    }

    updateIdleMotion(elapsed, deltaSeconds, bobOffset)
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

        this.direction.set(-Math.sin(angle), 0, Math.cos(angle))
        this.updateLocomotionState(this.previousAnchorPosition, this.railAnchorPosition, deltaSeconds)
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

    addRailPointFromTarget()
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

    startRailLineFromTarget()
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

    getDynamicWalkFrequency()
    {
        const referenceSpeed = Math.max(0.001, this.rails.settings.speed)
        const normalizedSpeed = THREE.MathUtils.clamp(this.locomotionSpeed / referenceSpeed, 0, 3)
        const frequencyMultiplier = 1 + (normalizedSpeed * this.motion.walkFrequencySpeedInfluence)
        return this.motion.walkFrequency * frequencyMultiplier
    }

    updateLocomotionState(previousPosition, currentPosition, deltaSeconds)
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

    updateFacingFromDirection(direction, deltaSeconds)
    {
        if(!this.model || direction.lengthSq() <= 1e-8)
        {
            return
        }

        const targetYaw = Math.atan2(direction.x, direction.z)
        const currentYaw = this.model.rotation.y - this.baseYaw
        const deltaYaw = Math.atan2(Math.sin(targetYaw - currentYaw), Math.cos(targetYaw - currentYaw))
        const rotationAlpha = 1 - Math.exp(-this.tuning.lookTurnSpeed * Math.max(0, deltaSeconds))
        this.model.rotation.y = this.baseYaw + currentYaw + (deltaYaw * rotationAlpha)
    }

    resolveGroundYAt(x, z, fallbackY = 0)
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

        this.rails?.destroy?.()
        this.armNodes = []
    }
}
