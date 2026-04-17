import * as THREE from 'three'
import Experience from '../../../Experience.js'
import CenterScreenRaycaster from '../../../Utils/CenterScreenRaycaster.js'

const CURSOR_OWNER_CLASS = 'is-scene1-material-cursor'
const BUTTON_PRESS_DEPTH = 0.045
const BUTTON_RELEASE_DURATION = 0.14
const MATERIAL_COLORS_BY_NAME = Object.freeze({
    materiau0: '#ff5b5b',
    materiau1: '#41d67a',
    materiau2: '#4da6ff'
})
const DEFAULT_MATERIAL_COLOR = '#4da6ff'
const INACTIVE_EMISSIVE_INTENSITY = 0.08
const ACTIVE_EMISSIVE_INTENSITY = 0.36

export default class Scene1MaterialButtons
{
    constructor({ scene1Model, isExternalHoverActive = null, onMaterialSelected = null } = {})
    {
        this.experience = new Experience()
        this.inputs = this.experience.inputs
        this.canvas = this.experience.canvas
        this.dialogueManager = this.experience.dialogueManager
        this.scene1Model = scene1Model
        this.isExternalHoverActive = typeof isExternalHoverActive === 'function'
            ? isExternalHoverActive
            : null
        this.onMaterialSelected = typeof onMaterialSelected === 'function'
            ? onMaterialSelected
            : null
        this.clickableMeshes = this.scene1Model?.getClickableMaterialMeshes?.() ?? []

        this.centerRaycaster = new CenterScreenRaycaster({
            getCamera: () => this.experience.camera?.instance ?? null
        })
        this.centerScreen = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5)
        this.hoveredMesh = null
        this.activePressedMeshUuid = null
        this.cursorElement = null
        this.ownsCursor = false
        this.buttonStates = new Map()
        this.createdCursorElement = false
        this.selectedMaterial = null

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

            const materialKey = this.getMaterialKeyFromMesh(mesh)
            const colorHex = MATERIAL_COLORS_BY_NAME[materialKey] || DEFAULT_MATERIAL_COLOR
            const runtimeMaterials = this.cloneAndSetupMeshMaterials(mesh)
            this.applyMaterialVisualState(runtimeMaterials, colorHex, false)

            this.buttonStates.set(mesh.uuid, {
                mesh,
                materialKey,
                colorHex,
                runtimeMaterials,
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
            if(!this.isInteractionActive())
            {
                return
            }

            const clickedMesh = this.getMaterialMeshAtCenter()
            if(!clickedMesh)
            {
                return
            }

            this.holdButton(clickedMesh)
        }

        this.onMouseUp = (event) =>
        {
            const clickedState = this.activePressedMeshUuid
                ? this.buttonStates.get(this.activePressedMeshUuid)
                : null
            this.releaseHeldButton()

            if(clickedState && this.isInteractionActive())
            {
                this.selectMaterialMesh(clickedState.mesh)
            }
        }

        this.onWindowBlur = () =>
        {
            this.releaseHeldButton()
        }

        this.onWindowResize = () =>
        {
            this.centerScreen.set(window.innerWidth * 0.5, window.innerHeight * 0.5)
        }

        this.inputs?.on?.('sceneinteractdown.scene1MaterialButtons', this.onMouseDown)
        this.inputs?.on?.('sceneinteractup.scene1MaterialButtons', this.onMouseUp)
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

        if(!this.centerRaycaster.hasCamera())
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
        this.hoveredMesh = this.getMaterialMeshAtCenter()
    }

    getMaterialMeshAtCenter()
    {
        return this.centerRaycaster.intersectFirst(this.clickableMeshes, false)
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
        const hasExternalHover = Boolean(this.isExternalHoverActive?.())
        this.cursorElement.classList.toggle('is-over-choice', Boolean(this.hoveredMesh) || hasExternalHover)
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

    getMaterialKeyFromMesh(mesh)
    {
        return String(mesh?.name || '')
            .toLowerCase()
            .replace(/[\s_-]+/g, '')
    }

    cloneAndSetupMeshMaterials(mesh)
    {
        const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const clonedMaterials = sourceMaterials.map((material) => material?.clone?.() ?? material)
        mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0]
        return clonedMaterials
    }

    applyMaterialVisualState(materials, colorHex, isSelected)
    {
        const emissiveIntensity = isSelected ? ACTIVE_EMISSIVE_INTENSITY : INACTIVE_EMISSIVE_INTENSITY

        for(const material of materials)
        {
            if(!material)
            {
                continue
            }

            if(material.color)
            {
                material.color.set(colorHex)
            }

            if(material.emissive)
            {
                material.emissive.set(colorHex)
                material.emissiveIntensity = emissiveIntensity
            }

            material.needsUpdate = true
        }
    }

    selectMaterialMesh(mesh)
    {
        if(!mesh)
        {
            return
        }

        const selectedState = this.buttonStates.get(mesh.uuid)
        if(!selectedState)
        {
            return
        }

        this.selectedMaterial = {
            meshUuid: selectedState.mesh.uuid,
            key: selectedState.materialKey,
            colorHex: selectedState.colorHex
        }

        for(const state of this.buttonStates.values())
        {
            this.applyMaterialVisualState(
                state.runtimeMaterials,
                state.colorHex,
                state.mesh.uuid === selectedState.mesh.uuid
            )
        }

        this.onMaterialSelected?.({ ...this.selectedMaterial })
    }

    getSelectedMaterial()
    {
        return this.selectedMaterial ? { ...this.selectedMaterial } : null
    }

    destroy()
    {
        this.inputs?.off?.('sceneinteractdown.scene1MaterialButtons')
        this.inputs?.off?.('sceneinteractup.scene1MaterialButtons')
        this.inputs?.off?.('blur.scene1MaterialButtons')
        window.removeEventListener('resize', this.onWindowResize)
        this.releaseHeldButton()
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
