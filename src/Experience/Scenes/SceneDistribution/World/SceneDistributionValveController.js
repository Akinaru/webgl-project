import * as THREE from 'three'

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
        this.pointerNdc = new THREE.Vector2(0, 0)
        this.cursorElement = null
        this.createdCursorElement = false
        this.ownsCursor = false
        this.cursorPosition = { x: 0, y: 0 }
        this.lastMouseClientX = 0

        this.valves = []
        this.valveByUuid = new Map()
        this.hoveredValve = null
        this.activeValve = null

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
            this.updateHoveredValve(event)
            this.updateCursor(event)

            if(!(event?.buttons & 1))
            {
                this.activeValve = null
                return
            }

            if(!this.activeValve && this.hoveredValve)
            {
                this.activeValve = this.hoveredValve
            }

            if(!this.activeValve)
            {
                return
            }

            const deltaX = Number.isFinite(event?.movementX)
                ? event.movementX
                : ((Number.isFinite(event?.clientX) ? event.clientX : this.lastMouseClientX) - this.lastMouseClientX)
            this.activeValve.rotateFromMouseDelta(deltaX)
        }

        this.inputs.on?.('mousemove.distributionValve', this.onMouseMove)
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

    updateHoveredValve(event)
    {
        if(
            !this.canvas
            || !this.camera
            || !Array.isArray(this.valves)
            || this.valves.length === 0
        )
        {
            this.hoveredValve = null
            this.setCursorHover(false)
            return
        }

        const clientX = Number.isFinite(event?.clientX) ? event.clientX : this.lastMouseClientX
        const clientY = Number.isFinite(event?.clientY) ? event.clientY : null
        if(Number.isFinite(clientX))
        {
            this.lastMouseClientX = clientX
        }

        if(!Number.isFinite(clientX) || !Number.isFinite(clientY))
        {
            this.hoveredValve = null
            this.setCursorHover(false)
            return
        }

        const rect = this.canvas.getBoundingClientRect()
        const isInsideCanvas =
            clientX >= rect.left
            && clientX <= rect.right
            && clientY >= rect.top
            && clientY <= rect.bottom
        if(!isInsideCanvas)
        {
            this.hoveredValve = null
            this.setCursorHover(false)
            return
        }

        this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1
        this.pointerNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1)
        this.raycaster.setFromCamera(this.pointerNdc, this.camera)
        const meshes = this.valves.map((valve) => valve.mesh)
        const firstHit = this.raycaster.intersectObjects(meshes, true)[0]

        this.hoveredValve = firstHit
            ? (this.valveByUuid.get(firstHit.object.uuid) ?? this.findValveInAncestors(firstHit.object))
            : null
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

    updateCursor(event)
    {
        this.cursorElement = this.cursorElement || document.querySelector('.dialogue__cursor')
        if(!(this.cursorElement instanceof HTMLElement))
        {
            return
        }

        if(Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY))
        {
            this.cursorPosition.x = event.clientX
            this.cursorPosition.y = event.clientY
        }

        this.ownsCursor = true
        document.body.classList.add(CURSOR_OWNER_CLASS)
        this.cursorElement.style.left = `${this.cursorPosition.x}px`
        this.cursorElement.style.top = `${this.cursorPosition.y}px`
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
        this.onMouseMove = null
        this.hoveredValve = null
        this.activeValve = null
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
