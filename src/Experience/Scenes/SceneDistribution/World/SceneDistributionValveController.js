import * as THREE from 'three'
import CenterScreenRaycaster from '../../../Utils/CenterScreenRaycaster.js'

const CURSOR_OWNER_CLASS = 'is-distribution-vanne-cursor'
const VALVE_DRAGGING_CLASS = 'is-distribution-valve-dragging'
const DEFAULT_TURN_SPEED = 0.012
const GESTURE_POINTER_MIN_RADIUS = 24
const GESTURE_POINTER_MAX_RADIUS = 180
const GESTURE_ROTATION_GAIN = 1
const GESTURE_MIN_RADIUS_SQ = GESTURE_POINTER_MIN_RADIUS * GESTURE_POINTER_MIN_RADIUS
const CURSOR_VISUAL_OFFSET_MAX = 12

class Valve
{
    constructor(mesh, {
        axisMeshes = [],
        turnSpeed = DEFAULT_TURN_SPEED
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
        valveMeshes = []
    } = {})
    {
        this.experience = experience
        this.inputs = this.experience?.inputs
        this.canvas = this.experience?.canvas
        this.camera = this.experience?.camera?.instance

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

        this.valves = []
        this.valveByUuid = new Map()
        this.hoveredValve = null
        this.hoveredHitPointWorld = null
        this.activeValve = null
        this.activeHitPointWorld = null

        this.setValves(valveMeshes)
        this.setEvents()
    }

    setValves(valveMeshes = [])
    {
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

            if(!this.hasNameInHierarchy(mesh, ['vanne']))
            {
                continue
            }

            const valve = new Valve(mesh, {
                axisMeshes: this.resolveLinkedAxisMeshes(mesh)
            })
            this.valves.push(valve)
            this.valveByUuid.set(mesh.uuid, valve)
        }
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
            if(!this.hoveredValve)
            {
                return
            }

            this.activeValve = this.hoveredValve
            this.activeHitPointWorld = this.hoveredHitPointWorld?.clone?.() ?? null
            this.resetGesturePointerFromActiveValve()
            document.body.classList.add(VALVE_DRAGGING_CLASS)
        }

        this.onInteractUp = () =>
        {
            this.activeValve = null
            this.activeHitPointWorld = null
            document.body.classList.remove(VALVE_DRAGGING_CLASS)
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

    update()
    {
        this.ensureCursorElement()
        this.updateHoveredValveAtCenter()
        this.updateCursorAtCenter()
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
        const hits = this.raycaster.intersectObjects(this.valves.map((valve) => valve.mesh), true)
        const firstHit = hits[0]
        const mesh = firstHit?.object ?? null
        this.hoveredValve = mesh
            ? (this.valveByUuid.get(mesh.uuid) ?? this.findValveInAncestors(mesh))
            : null
        this.hoveredHitPointWorld = firstHit?.point?.clone?.() ?? null
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
        document.body.classList.add(CURSOR_OWNER_CLASS)
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
        if(length > GESTURE_POINTER_MAX_RADIUS)
        {
            this.gesturePointer.multiplyScalar(GESTURE_POINTER_MAX_RADIUS / Math.max(length, 1e-6))
        }
        else if(length < GESTURE_POINTER_MIN_RADIUS)
        {
            this.gesturePointer.multiplyScalar(GESTURE_POINTER_MIN_RADIUS / Math.max(length, 1e-6))
        }

        if(!Number.isFinite(signedAngularDelta) || Math.abs(signedAngularDelta) < 1e-6)
        {
            return
        }

        this.activeValve.rotateByAngle(signedAngularDelta * GESTURE_ROTATION_GAIN)
        this.updateCursorVisualOffsetFromGesture()
    }

    resetGesturePointerFromActiveValve()
    {
        if(!this.activeValve || !this.camera)
        {
            this.gesturePointer.set(GESTURE_POINTER_MIN_RADIUS, 0)
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
            this.gesturePointer.set(GESTURE_POINTER_MIN_RADIUS, 0)
        }

        const length = this.gesturePointer.length()
        if(length < GESTURE_POINTER_MIN_RADIUS)
        {
            this.gesturePointer.set(GESTURE_POINTER_MIN_RADIUS, 0)
        }
        else if(length > GESTURE_POINTER_MAX_RADIUS)
        {
            this.gesturePointer.multiplyScalar(GESTURE_POINTER_MAX_RADIUS / length)
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

        const scale = CURSOR_VISUAL_OFFSET_MAX / Math.max(length, 1)
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
        document.body.classList.remove(CURSOR_OWNER_CLASS)

        if(this.cursorElement instanceof HTMLElement)
        {
            this.cursorElement.style.setProperty('--cursor-offset-x', '0px')
            this.cursorElement.style.setProperty('--cursor-offset-y', '0px')
            this.cursorElement.classList.remove('is-visible')
            this.cursorElement.classList.remove('is-over-choice')
        }
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
        this.valves = []
        this.valveByUuid.clear()
        this.releaseCursor()
        document.body.classList.remove(VALVE_DRAGGING_CLASS)

        if(this.createdCursorElement && this.cursorElement instanceof HTMLElement)
        {
            this.cursorElement.remove()
        }
        this.cursorElement = null
        this.createdCursorElement = false
    }
}
