import * as THREE from 'three'
import CenterScreenRaycaster from '../../../Utils/CenterScreenRaycaster.js'
import * as SceneDistributionValveControllerConstants from './ValveController.constants.js'
import * as SceneDistributionFlowConstants from './Flow.constants.js'
import { setupSceneDistributionValveControllerDebug } from './ValveController.debug.js'
const GESTURE_MIN_RADIUS_SQ = SceneDistributionValveControllerConstants.GESTURE_POINTER_MIN_RADIUS * SceneDistributionValveControllerConstants.GESTURE_POINTER_MIN_RADIUS

class Valve
{
    constructor(mesh, {
        axisMeshes = [],
        turnSpeed = SceneDistributionValveControllerConstants.DEFAULT_TURN_SPEED
    } = {})
    {
        this.mesh = mesh
        this.axisMeshes = Array.isArray(axisMeshes) ? axisMeshes : []
        this.axisRotators = this.axisMeshes.map((mesh) => ({
            mesh,
            axis: this.resolvePrimaryAxis(mesh, 'largest')
        }))
        this.turnSpeed = turnSpeed
        this.rotationAxis = this.resolveRotationAxis(mesh)
        this.worldAxis = new THREE.Vector3()
        this.worldPivot = new THREE.Vector3()
        this.worldReferencePoint = new THREE.Vector3()
        this.cameraToPivot = new THREE.Vector3()
        this.radialWorld = new THREE.Vector3()
        this.screenPivot = new THREE.Vector3()
        this.screenTangentPoint = new THREE.Vector3()
        this.tangentWorld = new THREE.Vector3()
        this.tangentScreen = new THREE.Vector2()
        this.fallbackVec = new THREE.Vector3()
    }

    resolveRotationAxis(mesh)
    {
        return this.resolvePrimaryAxis(mesh, 'smallest')
    }

    resolvePrimaryAxis(mesh, mode = 'smallest')
    {
        const geometry = mesh?.geometry
        if(!(geometry instanceof THREE.BufferGeometry))
        {
            return new THREE.Vector3(0, 1, 0)
        }

        geometry.computeBoundingBox?.()
        const bounds = geometry.boundingBox
        if(!bounds)
        {
            return new THREE.Vector3(0, 1, 0)
        }

        const size = bounds.getSize(new THREE.Vector3())
        const axisByName = [
            { name: 'x', value: size.x, vector: new THREE.Vector3(1, 0, 0) },
            { name: 'y', value: size.y, vector: new THREE.Vector3(0, 1, 0) },
            { name: 'z', value: size.z, vector: new THREE.Vector3(0, 0, 1) }
        ]
        axisByName.sort((a, b) => a.value - b.value)

        if(mode === 'largest')
        {
            return axisByName[2].vector
        }

        return axisByName[0].vector
    }

    rotateFromMouseDelta(deltaX = 0)
    {
        if(!this.mesh || !Number.isFinite(deltaX))
        {
            return
        }

        const angle = deltaX * this.turnSpeed
        this.mesh.rotateOnAxis(this.rotationAxis, angle)
        this.rotateLinkedAxes(angle)
    }

    rotateByAngle(angle = 0)
    {
        if(!this.mesh || !Number.isFinite(angle))
        {
            return
        }

        this.mesh.rotateOnAxis(this.rotationAxis, angle)
        this.rotateLinkedAxes(angle)
    }

    rotateLinkedAxes(angle = 0)
    {
        if(!Number.isFinite(angle) || Math.abs(angle) < 1e-9)
        {
            return
        }

        for(const axisRotator of this.axisRotators)
        {
            const axisMesh = axisRotator?.mesh
            const axis = axisRotator?.axis
            if(!(axisMesh instanceof THREE.Object3D) || axisMesh === this.mesh || !(axis instanceof THREE.Vector3))
            {
                continue
            }

            axisMesh.rotateOnAxis(axis, -angle)
        }
    }

    rotateFromScreenDelta({
        deltaX = 0,
        deltaY = 0,
        camera = null,
        hitPointWorld = null
    } = {})
    {
        if(!this.mesh || !camera)
        {
            return
        }

        this.mesh.getWorldPosition(this.worldPivot)
        this.worldAxis.copy(this.rotationAxis).transformDirection(this.mesh.matrixWorld).normalize()

        if(hitPointWorld instanceof THREE.Vector3)
        {
            this.worldReferencePoint.copy(hitPointWorld)
        }
        else
        {
            this.cameraToPivot.copy(camera.position).sub(this.worldPivot)
            this.radialWorld.copy(this.cameraToPivot).cross(this.worldAxis)
            if(this.radialWorld.lengthSq() < 1e-8)
            {
                this.radialWorld.set(1, 0, 0).cross(this.worldAxis)
            }
            if(this.radialWorld.lengthSq() < 1e-8)
            {
                this.radialWorld.set(0, 0, 1)
            }
            this.radialWorld.normalize().multiplyScalar(0.35)
            this.worldReferencePoint.copy(this.worldPivot).add(this.radialWorld)
        }

        this.radialWorld.copy(this.worldReferencePoint).sub(this.worldPivot)
        this.radialWorld.addScaledVector(this.worldAxis, -this.radialWorld.dot(this.worldAxis))
        if(this.radialWorld.lengthSq() < 1e-8)
        {
            this.rotateFromMouseDelta(deltaX)
            return
        }
        this.radialWorld.normalize()

        this.tangentWorld.copy(this.worldAxis).cross(this.radialWorld).normalize()
        this.fallbackVec.copy(this.worldPivot).add(this.tangentWorld)

        this.screenPivot.copy(this.worldPivot).project(camera)
        this.screenTangentPoint.copy(this.fallbackVec).project(camera)
        this.tangentScreen.set(
            this.screenTangentPoint.x - this.screenPivot.x,
            this.screenTangentPoint.y - this.screenPivot.y
        )

        const tangentLen = this.tangentScreen.length()
        if(tangentLen < 1e-6)
        {
            this.rotateFromMouseDelta(deltaX)
            return
        }
        this.tangentScreen.multiplyScalar(1 / tangentLen)

        const deltaAlongTangent = (deltaX * this.tangentScreen.x) - (deltaY * this.tangentScreen.y)
        const angle = deltaAlongTangent * this.turnSpeed
        this.mesh.rotateOnAxis(this.rotationAxis, angle)
        this.rotateLinkedAxes(angle)
    }
}

export default class SceneDistributionValveController
{
    constructor({
        experience,
        valveMeshes = [],
        canRotateValveDirection = null,
        debugParentFolder = null
    } = {})
    {
        this.experience = experience
        this.inputs = this.experience?.inputs
        this.canvas = this.experience?.canvas
        this.camera = this.experience?.camera?.instance
        this.debug = this.experience?.debug
        this.debugParentFolder = debugParentFolder
        this.isEnabled = true
        this.settings = {
            turnSpeedMultiplier: 1,
            gestureRotationGain: SceneDistributionValveControllerConstants.GESTURE_ROTATION_GAIN,
            maxVisualOffset: SceneDistributionValveControllerConstants.CURSOR_VISUAL_OFFSET_MAX
        }

        this.raycaster = new THREE.Raycaster()
        this.centerRaycaster = new CenterScreenRaycaster({
            getCamera: () => this.camera
        })
        this.centerScreen = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5)
        this.cursorElement = null
        this.createdCursorElement = false
        this.ownsCursor = false
        this.cursorPosition = { x: 0, y: 0 }
        this.lastMouseClientX = 0
        this.gesturePointer = new THREE.Vector2(72, 0)
        this.gesturePointerPrev = new THREE.Vector2(72, 0)
        this.projectedPivot = new THREE.Vector3()
        this.projectedHitPoint = new THREE.Vector3()
        this.isValveTurningSoundPlaying = false
        this.accumulatedRightTurnRadians = 0
        this.accumulatedRightTurnByValveToken = new Map()

        this.valves = []
        this.valveByUuid = new Map()
        this.valveLightsByMeshUuid = new Map()
        this.hoveredValve = null
        this.hoveredHitPointWorld = null
        this.activeValve = null
        this.activeHitPointWorld = null
        this.canRotateValveDirection = typeof canRotateValveDirection === 'function'
            ? canRotateValveDirection
            : null

        this.indicatorGroup = null
        this.indicatorLineGeometry = null
        this.indicatorLine = null
        this.indicatorDot = null
        this.indicatorLabelSprite = null
        this.indicatorBounds = new THREE.Box3()
        this.indicatorCenter = new THREE.Vector3()
        this.indicatorAnchorCache = null
        this.indicatorLinePoints = [new THREE.Vector3(), new THREE.Vector3()]
        this.previousHoveredValve = null
        this.valveHitBoxes = []
        this.valveByHitBoxUuid = new Map()

        this.setValves(valveMeshes)
        this.setSceneIndicator()
        this.setEvents()
        this.setDebug()
    }

    setRotationConstraintResolver(resolver)
    {
        this.canRotateValveDirection = typeof resolver === 'function' ? resolver : null
    }

    setEnabled(isEnabled = true)
    {
        this.isEnabled = Boolean(isEnabled)
        if(this.isEnabled)
        {
            return
        }

        if(this.hoveredValve)
        {
            this.applyValveHoverState(this.hoveredValve, false)
        }

        this.hoveredValve = null
        this.previousHoveredValve = null
        this.indicatorAnchorCache = null
        this.hoveredHitPointWorld = null
        this.activeValve = null
        this.activeHitPointWorld = null
        this.stopValveTurningSound()
        this.setPlayerLookEnabled(true)
        document.body.classList.remove(SceneDistributionValveControllerConstants.VALVE_DRAGGING_CLASS)
        this.setCursorHover(false)
    }

    setValves(valveMeshes = [])
    {
        this.clearValveLights()
        this.clearValveHitBoxes()
        this.valves = []
        this.valveByUuid.clear()

        if(!Array.isArray(valveMeshes))
        {
            return
        }

        for(const mesh of valveMeshes)
        {
            if(!(mesh instanceof THREE.Mesh))
            {
                continue
            }

            if(!this.isValveMesh(mesh))
            {
                continue
            }

            const valve = new Valve(mesh, {
                axisMeshes: this.resolveLinkedAxisMeshes(mesh)
            })
            this.valves.push(valve)
            this.valveByUuid.set(mesh.uuid, valve)
            this.applyValveGlow(mesh)
            this.createValveHitBox(valve)
        }

        const slotMap = SceneDistributionFlowConstants.buildDistributionChannelSlotMap(this.valves.map((valve) => valve.mesh))
        for(const valve of this.valves)
        {
            valve.valveToken = this.resolveValveToken(valve.mesh, slotMap)
        }
    }

    resolveValveToken(mesh, slotMap = null)
    {
        return SceneDistributionFlowConstants.resolveDistributionChannelTokenFromObject(mesh, slotMap)
    }

    applyValveGlow(mesh)
    {
        if(!(mesh instanceof THREE.Mesh))
        {
            return
        }

        const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]

        for(const material of materials)
        {
            if(!material)
            {
                continue
            }

            if(material.emissive?.set)
            {
                material.emissive.set(SceneDistributionValveControllerConstants.VALVE_EMISSIVE_COLOR)
                material.emissiveIntensity = SceneDistributionValveControllerConstants.VALVE_EMISSIVE_INTENSITY
                material.needsUpdate = true
            }
        }

        const light = new THREE.PointLight(
            SceneDistributionValveControllerConstants.VALVE_LIGHT_COLOR,
            SceneDistributionValveControllerConstants.VALVE_LIGHT_INTENSITY,
            SceneDistributionValveControllerConstants.VALVE_LIGHT_DISTANCE
        )
        light.position.set(0, SceneDistributionValveControllerConstants.VALVE_LIGHT_HEIGHT_OFFSET, 0)
        light.castShadow = false
        mesh.add(light)
        this.valveLightsByMeshUuid.set(mesh.uuid, light)
    }

    createValveHitBox(valve)
    {
        const bounds = new THREE.Box3().setFromObject(valve.mesh)
        if(bounds.isEmpty())
        {
            return
        }

        const size = bounds.getSize(new THREE.Vector3())
        const center = bounds.getCenter(new THREE.Vector3())
        const padding = SceneDistributionValveControllerConstants.VALVE_HIT_BOX_PADDING

        const hitBox = new THREE.Mesh(
            new THREE.BoxGeometry(size.x + padding, size.y + padding, size.z + padding),
            new THREE.MeshBasicMaterial({ visible: false })
        )
        hitBox.position.copy(center)
        hitBox.renderOrder = 0
        this.experience?.scene?.add(hitBox)
        this.valveHitBoxes.push(hitBox)
        this.valveByHitBoxUuid.set(hitBox.uuid, valve)
    }

    clearValveHitBoxes()
    {
        for(const hitBox of this.valveHitBoxes)
        {
            this.experience?.scene?.remove(hitBox)
            hitBox.geometry?.dispose?.()
            hitBox.material?.dispose?.()
        }
        this.valveHitBoxes = []
        this.valveByHitBoxUuid.clear()
    }

    clearValveLights()
    {
        for(const [meshUuid, light] of this.valveLightsByMeshUuid.entries())
        {
            const mesh = this.valveByUuid.get(meshUuid)?.mesh ?? null
            mesh?.remove?.(light)
        }
        this.valveLightsByMeshUuid.clear()
    }

    isValveMesh(mesh)
    {
        const name = String(mesh?.name || '').toLowerCase()
        const compactName = name.replace(/[\s_-]+/g, '')
        return compactName.includes('vanne')
    }

    resolveLinkedAxisMeshes(valveMesh)
    {
        const parent = valveMesh?.parent
        if(!parent)
        {
            return []
        }

        const axisMeshes = []
        for(const child of parent.children)
        {
            if(!(child instanceof THREE.Mesh) || child === valveMesh)
            {
                continue
            }

            const name = (child.name || '').toLowerCase()
            if(name.includes('axe'))
            {
                axisMeshes.push(child)
            }
        }

        return axisMeshes
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

    setEvents()
    {
        if(!this.inputs)
        {
            return
        }

        this.ensureCursorElement()

        this.onMouseMove = (event) =>
        {
            if(this.isEnabled !== true)
            {
                return
            }

            if(!this.activeValve)
            {
                return
            }

            const deltaX = Number.isFinite(event?.movementX)
                ? event.movementX
                : 0
            const deltaY = Number.isFinite(event?.movementY)
                ? event.movementY
                : 0
            this.rotateActiveValveFromCircularGesture(deltaX, deltaY)
        }

        this.onInteractDown = () =>
        {
            if(this.isEnabled !== true)
            {
                return
            }

            if(!this.hoveredValve)
            {
                return
            }

            this.activeValve = this.hoveredValve
            this.activeHitPointWorld = this.hoveredHitPointWorld?.clone?.() ?? null
            this.resetGesturePointerFromActiveValve()
            this.setPlayerLookEnabled(false)
            document.body.classList.add(SceneDistributionValveControllerConstants.VALVE_DRAGGING_CLASS)
        }

        this.onInteractUp = () =>
        {
            this.activeValve = null
            this.activeHitPointWorld = null
            this.stopValveTurningSound()
            this.setPlayerLookEnabled(true)
            document.body.classList.remove(SceneDistributionValveControllerConstants.VALVE_DRAGGING_CLASS)
        }

        this.onWindowResize = () =>
        {
            this.centerScreen.set(window.innerWidth * 0.5, window.innerHeight * 0.5)
        }

        this.inputs.on?.('mousemove.distributionValve', this.onMouseMove)
        this.inputs.on?.('sceneinteractdown.distributionValve', this.onInteractDown)
        this.inputs.on?.('sceneinteractup.distributionValve', this.onInteractUp)
        window.addEventListener('resize', this.onWindowResize)
    }

    ensureCursorElement()
    {
        this.cursorElement = document.querySelector('.dialogue__cursor')
        if(this.cursorElement instanceof HTMLElement)
        {
            return
        }

        const fallbackCursor = document.createElement('span')
        fallbackCursor.className = 'dialogue__cursor'
        document.body.appendChild(fallbackCursor)
        this.cursorElement = fallbackCursor
        this.createdCursorElement = true
    }

    setSceneIndicator()
    {
        this.indicatorGroup = new THREE.Group()
        this.indicatorGroup.visible = false
        this.indicatorGroup.renderOrder = 20

        this.indicatorLineGeometry = new THREE.BufferGeometry().setFromPoints(this.indicatorLinePoints)
        this.indicatorLine = new THREE.Line(
            this.indicatorLineGeometry,
            new THREE.LineBasicMaterial({ color: '#87dbff', transparent: true, opacity: 0.9, depthWrite: false })
        )

        this.indicatorDot = new THREE.Mesh(
            new THREE.SphereGeometry(0.022, 12, 12),
            new THREE.MeshBasicMaterial({ color: '#4dc8ff', transparent: true, opacity: 0.95, depthWrite: false })
        )

        const labelTexture = this.createIndicatorLabelTexture('Tourner la valve')
        this.indicatorLabelSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthWrite: false })
        )
        this.indicatorLabelSprite.scale.set(0.82, 0.2, 1)

        this.indicatorGroup.add(this.indicatorLine)
        this.indicatorGroup.add(this.indicatorDot)
        this.indicatorGroup.add(this.indicatorLabelSprite)
        this.experience?.scene?.add(this.indicatorGroup)
    }

    createIndicatorLabelTexture(text)
    {
        const canvas = document.createElement('canvas')
        canvas.width = 512
        canvas.height = 144
        const ctx = canvas.getContext('2d')
        if(!ctx) return null

        const w = canvas.width
        const h = canvas.height
        const r = 34

        const bg = ctx.createLinearGradient(0, 18, 0, h - 18)
        bg.addColorStop(0,    'rgba(56, 96, 108, 0.72)')
        bg.addColorStop(0.24, 'rgba(28, 86, 101, 0.68)')
        bg.addColorStop(1,    'rgba(0, 116, 141, 0.54)')
        ctx.fillStyle = bg
        ctx.shadowColor = 'rgba(0,0,0,0.28)'
        ctx.shadowBlur = 18
        ctx.shadowOffsetY = 8
        ctx.beginPath()
        ctx.roundRect(18, 18, w - 36, h - 36, r)
        ctx.fill()

        const hl = ctx.createLinearGradient(0, 22, 0, h * 0.7)
        hl.addColorStop(0,    'rgba(255,255,255,0.26)')
        hl.addColorStop(0.32, 'rgba(255,255,255,0.10)')
        hl.addColorStop(1,    'rgba(255,255,255,0)')
        ctx.fillStyle = hl
        ctx.shadowColor = 'transparent'
        ctx.beginPath()
        ctx.roundRect(18, 18, w - 36, h - 36, r)
        ctx.fill()

        ctx.strokeStyle = 'rgba(255,255,255,0.42)'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.roundRect(18, 18, w - 36, h - 36, r)
        ctx.stroke()

        ctx.fillStyle = '#f2fbff'
        ctx.font = '700 38px "Nunito", "Segoe UI", sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.shadowColor = 'rgba(7,26,41,0.18)'
        ctx.shadowBlur = 12
        ctx.shadowOffsetY = 2
        ctx.fillText(text, w * 0.5, h * 0.5)

        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.needsUpdate = true
        return texture
    }

    applyValveHoverState(valve, isHovered)
    {
        if(!valve?.mesh)
        {
            return
        }

        const light = this.valveLightsByMeshUuid.get(valve.mesh.uuid)
        if(light)
        {
            light.intensity = isHovered
                ? SceneDistributionValveControllerConstants.VALVE_LIGHT_INTENSITY_HOVERED
                : SceneDistributionValveControllerConstants.VALVE_LIGHT_INTENSITY
        }
    }

    updateValveIndicator()
    {
        if(!this.indicatorGroup)
        {
            return
        }

        // Track hover changes for emissive and anchor cache
        if(this.hoveredValve !== this.previousHoveredValve)
        {
            if(this.previousHoveredValve)
            {
                this.applyValveHoverState(this.previousHoveredValve, false)
            }

            this.indicatorAnchorCache = null

            if(this.hoveredValve?.mesh)
            {
                this.applyValveHoverState(this.hoveredValve, true)

                // Cache anchor from initial bounding box — stays fixed regardless of rotation
                this.indicatorBounds.setFromObject(this.hoveredValve.mesh)
                if(!this.indicatorBounds.isEmpty())
                {
                    const size = this.indicatorBounds.getSize(new THREE.Vector3())
                    const wp = new THREE.Vector3()
                    this.hoveredValve.mesh.getWorldPosition(wp)
                    this.indicatorAnchorCache = {
                        anchorY: wp.y + (size.y * 0.5) + 0.04,
                        labelY:  wp.y + (size.y * 0.5) + 0.04 + Math.max(0.2, size.y * 0.28) + 0.08
                    }
                }
            }

            this.previousHoveredValve = this.hoveredValve
        }

        if(!this.hoveredValve?.mesh || !this.indicatorAnchorCache)
        {
            this.indicatorGroup.visible = false
            return
        }

        // Use world X/Z from mesh position + cached Y (immune to valve rotation)
        const wp = new THREE.Vector3()
        this.hoveredValve.mesh.getWorldPosition(wp)
        const { anchorY, labelY } = this.indicatorAnchorCache

        this.indicatorLinePoints[0].set(wp.x, anchorY, wp.z)
        this.indicatorLinePoints[1].set(wp.x, labelY - 0.05, wp.z)
        this.indicatorLineGeometry.setFromPoints(this.indicatorLinePoints)

        this.indicatorDot.position.copy(this.indicatorLinePoints[0])
        this.indicatorLabelSprite.position.set(wp.x, labelY, wp.z)
        this.indicatorGroup.visible = true
    }

    update()
    {
        this.ensureCursorElement()
        if(this.isEnabled !== true)
        {
            this.hoveredValve = null
            this.hoveredHitPointWorld = null
            this.setCursorHover(false)
            return
        }
        this.updateHoveredValveAtCenter()
        this.updateCursorAtCenter()
        this.updateValveIndicator()
    }

    updateHoveredValveAtCenter()
    {
        if(!this.centerRaycaster.hasCamera() || !Array.isArray(this.valves) || this.valves.length === 0)
        {
            this.hoveredValve = null
            this.setCursorHover(false)
            return
        }

        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera)
        const targets = this.valveHitBoxes.length > 0
            ? this.valveHitBoxes
            : this.valves.map((valve) => valve.mesh)
        const hits = this.raycaster.intersectObjects(targets, false)
        const firstHit = hits[0]
        const maxDist = SceneDistributionValveControllerConstants.VALVE_MAX_INTERACTION_DISTANCE
        const withinRange = firstHit && Number.isFinite(firstHit.distance) && firstHit.distance <= maxDist
        const hitObject = withinRange ? (firstHit.object ?? null) : null
        this.hoveredValve = hitObject
            ? (this.valveByHitBoxUuid.get(hitObject.uuid) ?? this.valveByUuid.get(hitObject.uuid) ?? this.findValveInAncestors(hitObject))
            : null
        this.hoveredHitPointWorld = withinRange ? (firstHit.point?.clone?.() ?? null) : null
        this.setCursorHover(Boolean(this.hoveredValve))
    }

    findValveInAncestors(object)
    {
        let current = object
        while(current)
        {
            const valve = this.valveByUuid.get(current.uuid)
            if(valve)
            {
                return valve
            }
            current = current.parent
        }
        return null
    }

    updateCursorAtCenter()
    {
        this.cursorElement = this.cursorElement || document.querySelector('.dialogue__cursor')
        if(!(this.cursorElement instanceof HTMLElement))
        {
            return
        }

        this.ownsCursor = true
        document.body.classList.add(SceneDistributionValveControllerConstants.CURSOR_OWNER_CLASS)
        this.cursorElement.style.left = `${this.centerScreen.x}px`
        this.cursorElement.style.top = `${this.centerScreen.y}px`
        this.cursorElement.style.setProperty('--cursor-offset-x', '0px')
        this.cursorElement.style.setProperty('--cursor-offset-y', '0px')
        this.cursorElement.classList.add('is-visible')
    }

    rotateActiveValveFromCircularGesture(deltaX = 0, deltaY = 0)
    {
        if(!this.activeValve)
        {
            return
        }

        if(Math.abs(deltaX) < 1e-6 && Math.abs(deltaY) < 1e-6)
        {
            return
        }

        const radiusSq = this.gesturePointer.lengthSq()
        if(radiusSq < GESTURE_MIN_RADIUS_SQ)
        {
            this.resetGesturePointerFromActiveValve()
        }
        this.gesturePointerPrev.copy(this.gesturePointer)

        // Signed angular speed in 2D: positive means clockwise on screen (Y-down).
        const prevRadiusSq = Math.max(this.gesturePointerPrev.lengthSq(), GESTURE_MIN_RADIUS_SQ)
        const signedAngularDelta = (
            (this.gesturePointerPrev.x * deltaY) - (this.gesturePointerPrev.y * deltaX)
        ) / prevRadiusSq

        this.gesturePointer.x += deltaX
        this.gesturePointer.y += deltaY

        const length = this.gesturePointer.length()
        if(length > SceneDistributionValveControllerConstants.GESTURE_POINTER_MAX_RADIUS)
        {
            this.gesturePointer.multiplyScalar(SceneDistributionValveControllerConstants.GESTURE_POINTER_MAX_RADIUS / Math.max(length, 1e-6))
        }
        else if(length < SceneDistributionValveControllerConstants.GESTURE_POINTER_MIN_RADIUS)
        {
            this.gesturePointer.multiplyScalar(SceneDistributionValveControllerConstants.GESTURE_POINTER_MIN_RADIUS / Math.max(length, 1e-6))
        }

        if(!Number.isFinite(signedAngularDelta) || Math.abs(signedAngularDelta) < 1e-6)
        {
            return
        }

        const appliedAngle = signedAngularDelta * this.settings.gestureRotationGain * this.settings.turnSpeedMultiplier
        const valveToken = this.activeValve?.valveToken || 'vanne'
        const rotationDirection = appliedAngle >= 0 ? 1 : -1
        const canRotate = this.canRotateValveDirection
            ? this.canRotateValveDirection(valveToken, rotationDirection)
            : true

        if(!canRotate)
        {
            this.stopValveTurningSound()
            return
        }

        this.activeValve.rotateByAngle(appliedAngle)
        this.accumulatedRightTurnRadians = Math.max(0, this.accumulatedRightTurnRadians + appliedAngle)
        const current = this.accumulatedRightTurnByValveToken.get(valveToken) ?? 0
        const nextValue = Math.max(0, current + appliedAngle)
        this.accumulatedRightTurnByValveToken.set(valveToken, nextValue)
        this.startValveTurningSound()
        this.updateCursorVisualOffsetFromGesture()
    }

    getAccumulatedRightTurnRadians()
    {
        return this.accumulatedRightTurnRadians
    }

    getAccumulatedRightTurnRadiansForValve(valveToken = 'vanne')
    {
        const normalizedToken = String(valveToken || '').toLowerCase()
        return this.accumulatedRightTurnByValveToken.get(normalizedToken) ?? 0
    }

    resetGesturePointerFromActiveValve()
    {
        if(!this.activeValve || !this.camera)
        {
            this.gesturePointer.set(SceneDistributionValveControllerConstants.GESTURE_POINTER_MIN_RADIUS, 0)
            this.gesturePointerPrev.copy(this.gesturePointer)
            return
        }

        this.activeValve.mesh.getWorldPosition(this.projectedPivot)
        this.projectedPivot.project(this.camera)

        if(this.activeHitPointWorld instanceof THREE.Vector3)
        {
            this.projectedHitPoint.copy(this.activeHitPointWorld).project(this.camera)
            this.gesturePointer.set(
                (this.projectedHitPoint.x - this.projectedPivot.x) * window.innerWidth * 0.5,
                -(this.projectedHitPoint.y - this.projectedPivot.y) * window.innerHeight * 0.5
            )
        }
        else
        {
            this.gesturePointer.set(SceneDistributionValveControllerConstants.GESTURE_POINTER_MIN_RADIUS, 0)
        }

        const length = this.gesturePointer.length()
        if(length < SceneDistributionValveControllerConstants.GESTURE_POINTER_MIN_RADIUS)
        {
            this.gesturePointer.set(SceneDistributionValveControllerConstants.GESTURE_POINTER_MIN_RADIUS, 0)
        }
        else if(length > SceneDistributionValveControllerConstants.GESTURE_POINTER_MAX_RADIUS)
        {
            this.gesturePointer.multiplyScalar(SceneDistributionValveControllerConstants.GESTURE_POINTER_MAX_RADIUS / length)
        }

        this.gesturePointerPrev.copy(this.gesturePointer)
        this.updateCursorVisualOffsetFromGesture()
    }

    updateCursorVisualOffsetFromGesture()
    {
        if(!(this.cursorElement instanceof HTMLElement))
        {
            return
        }

        const length = this.gesturePointer.length()
        if(length < 1e-6)
        {
            this.cursorElement.style.setProperty('--cursor-offset-x', '0px')
            this.cursorElement.style.setProperty('--cursor-offset-y', '0px')
            return
        }

        const scale = this.settings.maxVisualOffset / Math.max(length, 1)
        const offsetX = this.gesturePointer.x * scale
        const offsetY = this.gesturePointer.y * scale
        this.cursorElement.style.setProperty('--cursor-offset-x', `${offsetX.toFixed(2)}px`)
        this.cursorElement.style.setProperty('--cursor-offset-y', `${offsetY.toFixed(2)}px`)
    }

    setCursorHover(isHovered)
    {
        if(!(this.cursorElement instanceof HTMLElement))
        {
            return
        }

        this.cursorElement.classList.toggle('is-over-choice', Boolean(isHovered))
    }

    releaseCursor()
    {
        if(!this.ownsCursor)
        {
            return
        }

        this.ownsCursor = false
        document.body.classList.remove(SceneDistributionValveControllerConstants.CURSOR_OWNER_CLASS)

        if(this.cursorElement instanceof HTMLElement)
        {
            this.cursorElement.style.setProperty('--cursor-offset-x', '0px')
            this.cursorElement.style.setProperty('--cursor-offset-y', '0px')
            this.cursorElement.classList.remove('is-visible')
            this.cursorElement.classList.remove('is-over-choice')
        }
    }

    startValveTurningSound()
    {
        if(this.isValveTurningSoundPlaying)
        {
            return
        }

        this.experience?.sound?.unlock?.()
        const didPlay = this.experience?.sound?.play?.(SceneDistributionValveControllerConstants.VALVE_TURNING_SOUND_NAME, {
            channel: SceneDistributionValveControllerConstants.VALVE_TURNING_CHANNEL
        }) === true
        this.isValveTurningSoundPlaying = didPlay
    }

    stopValveTurningSound()
    {
        this.experience?.sound?.stopChannel?.(SceneDistributionValveControllerConstants.VALVE_TURNING_CHANNEL)
        this.isValveTurningSoundPlaying = false
    }

    setPlayerLookEnabled(isEnabled = true)
    {
        const player = this.experience?.sceneManager?.currentScene?.world?.player ?? null
        player?.setLookEnabled?.(isEnabled)
    }

    destroy()
    {
        this.inputs?.off?.('mousemove.distributionValve')
        this.inputs?.off?.('sceneinteractdown.distributionValve')
        this.inputs?.off?.('sceneinteractup.distributionValve')
        window.removeEventListener('resize', this.onWindowResize)
        this.onMouseMove = null
        this.onInteractDown = null
        this.onInteractUp = null
        this.onWindowResize = null
        this.hoveredValve = null
        this.hoveredHitPointWorld = null
        this.activeValve = null
        this.activeHitPointWorld = null
        this.stopValveTurningSound()
        this.setPlayerLookEnabled(true)
        this.valves = []
        this.clearValveLights()
        this.valveByUuid.clear()
        this.accumulatedRightTurnByValveToken.clear()
        this.releaseCursor()
        this.clearValveHitBoxes()
        document.body.classList.remove(SceneDistributionValveControllerConstants.VALVE_DRAGGING_CLASS)

        if(this.indicatorGroup)
        {
            this.experience?.scene?.remove(this.indicatorGroup)
            this.indicatorLineGeometry?.dispose?.()
            this.indicatorLine?.material?.dispose?.()
            this.indicatorDot?.geometry?.dispose?.()
            this.indicatorDot?.material?.dispose?.()
            this.indicatorLabelSprite?.material?.map?.dispose?.()
            this.indicatorLabelSprite?.material?.dispose?.()
            this.indicatorGroup = null
        }

        if(this.createdCursorElement && this.cursorElement instanceof HTMLElement)
        {
            this.cursorElement.remove()
        }
        this.cursorElement = null
        this.createdCursorElement = false
        this.debugFolder?.dispose?.()
        this.debugFolder = null
    }

    setDebug()
    {
        setupSceneDistributionValveControllerDebug.call(this)
    }
}
