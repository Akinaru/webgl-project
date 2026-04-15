import * as THREE from 'three'
import Experience from '../../../Experience.js'

const CURSOR_OWNER_CLASS = 'is-scene1-material-cursor'
const BUTTON_PRESS_DEPTH = 0.045
const BUTTON_RELEASE_DURATION = 0.14

export default class Scene1MaterialButtons
{
    constructor({ scene1Model } = {})
    {
        this.experience = new Experience()
        this.inputs = this.experience.inputs
        this.camera = this.experience.camera?.instance
        this.canvas = this.experience.canvas
        this.dialogueManager = this.experience.dialogueManager
        this.scene1Model = scene1Model
        this.clickableMeshes = this.scene1Model?.getClickableMaterialMeshes?.() ?? []

        this.raycaster = new THREE.Raycaster()
        this.centerNdc = new THREE.Vector2(0, 0)
        this.centerScreen = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5)
        this.hoveredMesh = null
        this.activePressedMeshUuid = null
        this.cursorElement = null
        this.ownsCursor = false
        this.buttonStates = new Map()
        this.createdCursorElement = false

        this.setButtonStates()
        this.ensureCursorElement()
        this.setEvents()
    }

    setButtonStates()
    {
        this.buttonStates.clear()

        for(const mesh of this.clickableMeshes)
        {
            if(!mesh)
            {
                continue
            }

            this.buttonStates.set(mesh.uuid, {
                mesh,
                baseY: mesh.position.y,
                offsetY: 0,
                phase: 'idle',
                timer: 0
            })
        }
    }

    setEvents()
    {
        this.onMouseDown = (event) =>
        {
            if(event?.button !== 0 || !this.isInteractionActive())
            {
                return
            }

            if(!this.hoveredMesh)
            {
                return
            }

            this.holdButton(this.hoveredMesh)
        }

        this.onMouseUp = (event) =>
        {
            if(event?.button !== 0)
            {
                return
            }

            this.releaseHeldButton()
        }

        this.onWindowBlur = () =>
        {
            this.releaseHeldButton()
        }

        this.onWindowResize = () =>
        {
            this.centerScreen.set(window.innerWidth * 0.5, window.innerHeight * 0.5)
        }

        this.inputs?.on?.('mousedown.scene1MaterialButtons', this.onMouseDown)
        this.inputs?.on?.('mouseup.scene1MaterialButtons', this.onMouseUp)
        this.inputs?.on?.('blur.scene1MaterialButtons', this.onWindowBlur)
        window.addEventListener('resize', this.onWindowResize)
    }

    isInteractionBlocked()
    {
        return Boolean(this.dialogueManager?.isRunning?.())
    }

    isInteractionActive()
    {
        return true
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

    holdButton(mesh)
    {
        const state = this.buttonStates.get(mesh.uuid)
        if(!state)
        {
            return
        }

        this.activePressedMeshUuid = mesh.uuid
        state.phase = 'hold'
        state.offsetY = -BUTTON_PRESS_DEPTH
        state.timer = 0
    }

    releaseHeldButton()
    {
        if(!this.activePressedMeshUuid)
        {
            return
        }

        const state = this.buttonStates.get(this.activePressedMeshUuid)
        this.activePressedMeshUuid = null
        if(!state)
        {
            return
        }

        state.phase = 'release'
        state.timer = 0
    }

    update(deltaMs = this.experience.time.delta)
    {
        const deltaSeconds = Math.max(0.001, Math.min(0.05, (deltaMs || 16.67) * 0.001))

        this.updateButtons(deltaSeconds)
        this.ensureCursorElement()

        if(!this.camera)
        {
            this.hoveredMesh = null
            this.updateCursor()
            return
        }

        if(!this.isInteractionActive())
        {
            this.hoveredMesh = null
            this.updateCursor()
            return
        }

        this.updateHoveredMesh()
        this.updateCursor()
    }

    updateHoveredMesh()
    {
        if(this.clickableMeshes.length === 0)
        {
            this.hoveredMesh = null
            return
        }

        this.raycaster.setFromCamera(this.centerNdc, this.camera)
        const hits = this.raycaster.intersectObjects(this.clickableMeshes, false)
        this.hoveredMesh = hits[0]?.object ?? null
    }

    updateCursor()
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
        this.cursorElement.classList.toggle('is-over-choice', Boolean(this.hoveredMesh))
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

    updateButtons(deltaSeconds)
    {
        for(const state of this.buttonStates.values())
        {
            if(!state?.mesh)
            {
                continue
            }

            if(state.phase === 'hold')
            {
                state.offsetY = -BUTTON_PRESS_DEPTH
            }
            else if(state.phase === 'release')
            {
                state.timer += deltaSeconds
                const progress = Math.min(1, state.timer / BUTTON_RELEASE_DURATION)
                state.offsetY = -BUTTON_PRESS_DEPTH * (1 - progress)

                if(progress >= 1)
                {
                    state.phase = 'idle'
                    state.timer = 0
                    state.offsetY = 0
                }
            }

            state.mesh.position.y = state.baseY + state.offsetY
        }
    }

    destroy()
    {
        this.inputs?.off?.('mousedown.scene1MaterialButtons')
        this.inputs?.off?.('mouseup.scene1MaterialButtons')
        this.inputs?.off?.('blur.scene1MaterialButtons')
        window.removeEventListener('resize', this.onWindowResize)
        this.releaseCursor()

        for(const state of this.buttonStates.values())
        {
            if(state?.mesh)
            {
                state.mesh.position.y = state.baseY
            }
        }

        this.buttonStates.clear()
        this.hoveredMesh = null

        if(this.createdCursorElement && this.cursorElement instanceof HTMLElement)
        {
            this.cursorElement.remove()
        }

        this.cursorElement = null
    }
}
