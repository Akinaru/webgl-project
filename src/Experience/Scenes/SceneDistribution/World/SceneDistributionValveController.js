import * as THREE from 'three'
import CenterScreenRaycaster from '../../../Utils/CenterScreenRaycaster.js'

const CURSOR_OWNER_CLASS = 'is-distribution-vanne-cursor'
const DEFAULT_TURN_SPEED = 0.012

class Valve
{
    constructor(mesh, {
        turnSpeed = DEFAULT_TURN_SPEED
    } = {})
    {
        this.mesh = mesh
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

        return axisByName[0].vector
    }

    rotateFromMouseDelta(deltaX = 0)
    {
        if(!this.mesh || !Number.isFinite(deltaX))
        {
            return
        }

        this.mesh.rotateOnAxis(this.rotationAxis, deltaX * this.turnSpeed)
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
        this.mesh.rotateOnAxis(this.rotationAxis, deltaAlongTangent * this.turnSpeed)
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

            const valve = new Valve(mesh)
            this.valves.push(valve)
            this.valveByUuid.set(mesh.uuid, valve)
        }
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
            if(!(event?.buttons & 1))
            {
                this.activeValve = null
                this.activeHitPointWorld = null
                return
            }

            if(!this.activeValve && this.hoveredValve)
            {
                this.activeValve = this.hoveredValve
                this.activeHitPointWorld = this.hoveredHitPointWorld?.clone?.() ?? null
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
            this.activeValve.rotateFromScreenDelta({
                deltaX,
                deltaY,
                camera: this.camera,
                hitPointWorld: this.activeHitPointWorld
            })
        }

        this.onWindowResize = () =>
        {
            this.centerScreen.set(window.innerWidth * 0.5, window.innerHeight * 0.5)
        }

        this.inputs.on?.('mousemove.distributionValve', this.onMouseMove)
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
        this.cursorElement.classList.add('is-visible')
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
            this.cursorElement.classList.remove('is-visible')
            this.cursorElement.classList.remove('is-over-choice')
        }
    }

    destroy()
    {
        this.inputs?.off?.('mousemove.distributionValve')
        window.removeEventListener('resize', this.onWindowResize)
        this.onMouseMove = null
        this.onWindowResize = null
        this.hoveredValve = null
        this.hoveredHitPointWorld = null
        this.activeValve = null
        this.activeHitPointWorld = null
        this.valves = []
        this.valveByUuid.clear()
        this.releaseCursor()

        if(this.createdCursorElement && this.cursorElement instanceof HTMLElement)
        {
            this.cursorElement.remove()
        }
        this.cursorElement = null
        this.createdCursorElement = false
    }
}
