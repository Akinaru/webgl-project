import * as THREE from 'three'
import Experience from '../../../Experience.js'
import CenterScreenRaycaster from '../../../Utils/CenterScreenRaycaster.js'

const CURSOR_OWNER_CLASS = 'is-recuperation-material-cursor'
const BUTTON_PRESS_DEPTH = 0.045
const BUTTON_RELEASE_DURATION = 0.14
const FLOAT_AMPLITUDE = 0.04
const FLOAT_SPEED = 2.4
const SELECTED_EMISSIVE_INTENSITY = 0.35
const IDLE_EMISSIVE_INTENSITY = 0.08
const TEXTURE_SIZE = 512

const MATERIAL_DEFINITIONS = Object.freeze([
    {
        key: 'materiau0',
        label: 'Carapace de Scarabe',
        description: 'Materiau organique',
        accentColor: '#7a4a21'
    },
    {
        key: 'materiau1',
        label: 'Verre',
        description: 'Materiau translucide',
        accentColor: '#7ec6df'
    },
    {
        key: 'materiau2',
        label: 'Vegetation',
        description: 'Materiau vivant',
        accentColor: '#4f9f57'
    }
])

export default class Materiau
{
    constructor({ recuperationModel, isExternalHoverActive = null, onSelectionChange = null } = {})
    {
        this.experience = new Experience()
        this.inputs = this.experience.inputs
        this.dialogueManager = this.experience.dialogueManager
        this.recuperationModel = recuperationModel
        this.isExternalHoverActive = typeof isExternalHoverActive === 'function'
            ? isExternalHoverActive
            : null
        this.onSelectionChange = typeof onSelectionChange === 'function'
            ? onSelectionChange
            : null
        this.clickableMeshes = this.recuperationModel?.getClickableMaterialMeshes?.() ?? []
        this.buildingMeshes = this.recuperationModel?.getMeshesForNameTokens?.(['building_test-Bleu'], { exact: true }) ?? []

        this.centerRaycaster = new CenterScreenRaycaster({
            getCamera: () => this.experience.camera?.instance ?? null
        })
        this.centerScreen = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5)
        this.cursorElement = null
        this.createdCursorElement = false
        this.ownsCursor = false
        this.hoveredMesh = null
        this.activePressedMeshUuid = null
        this.selectedMaterialKey = null
        this.materialStates = new Map()
        this.definitionTextures = new Map()
        this.buildingEntries = []

        this.setDefinitionTextures()
        this.setMaterialStates()
        this.setBuildingEntries()
        this.ensureCursorElement()
        this.setEvents()
    }

    setDefinitionTextures()
    {
        this.definitionTextures.clear()

        for(const definition of MATERIAL_DEFINITIONS)
        {
            this.definitionTextures.set(definition.key, this.createTextureForDefinition(definition))
        }
    }

    createTextureForDefinition(definition)
    {
        const canvas = document.createElement('canvas')
        canvas.width = TEXTURE_SIZE
        canvas.height = TEXTURE_SIZE
        const context = canvas.getContext('2d')

        if(definition.key === 'materiau0')
        {
            this.drawScarabShellTexture(context)
        }
        else if(definition.key === 'materiau1')
        {
            this.drawGlassTexture(context)
        }
        else
        {
            this.drawVegetationTexture(context)
        }

        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.needsUpdate = true
        return texture
    }

    drawScarabShellTexture(context)
    {
        context.fillStyle = '#2b170b'
        context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)

        for(let row = 0; row < 8; row++)
        {
            for(let column = 0; column < 8; column++)
            {
                const x = column * 64
                const y = row * 64
                context.fillStyle = (row + column) % 2 === 0 ? '#6f401d' : '#8d5524'
                context.beginPath()
                context.roundRect(x + 6, y + 8, 52, 48, 16)
                context.fill()
            }
        }

        context.strokeStyle = '#b7863b'
        context.lineWidth = 5
        for(let index = 0; index <= 8; index++)
        {
            const x = index * 64
            context.beginPath()
            context.moveTo(x, 0)
            context.lineTo(x, TEXTURE_SIZE)
            context.stroke()
        }
    }

    drawGlassTexture(context)
    {
        const gradient = context.createLinearGradient(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
        gradient.addColorStop(0, '#dff7ff')
        gradient.addColorStop(0.5, '#86d4ea')
        gradient.addColorStop(1, '#3f7ea7')
        context.fillStyle = gradient
        context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)

        context.strokeStyle = 'rgba(255, 255, 255, 0.45)'
        context.lineWidth = 6
        for(let index = -4; index < 12; index++)
        {
            const offset = index * 48
            context.beginPath()
            context.moveTo(offset, 0)
            context.lineTo(offset + 180, TEXTURE_SIZE)
            context.stroke()
        }
    }

    drawVegetationTexture(context)
    {
        context.fillStyle = '#183821'
        context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)

        for(let index = 0; index < 140; index++)
        {
            const x = Math.random() * TEXTURE_SIZE
            const y = Math.random() * TEXTURE_SIZE
            const radius = 10 + Math.random() * 22
            context.fillStyle = ['#2f6f39', '#4a9a49', '#74b75b'][index % 3]
            context.beginPath()
            context.arc(x, y, radius, 0, Math.PI * 2)
            context.fill()
        }
    }

    setMaterialStates()
    {
        this.materialStates.clear()

        for(const mesh of this.clickableMeshes)
        {
            if(!mesh)
            {
                continue
            }

            const key = this.getMaterialKeyFromMesh(mesh)
            const definition = this.getDefinitionByKey(key)
            if(!definition)
            {
                continue
            }

            const runtimeMaterials = this.cloneAndSetupMeshMaterials(mesh)
            this.applyTextureToMaterials(runtimeMaterials, definition)
            this.applySelectionVisualState(runtimeMaterials, false)

            this.materialStates.set(mesh.uuid, {
                mesh,
                key,
                definition,
                runtimeMaterials,
                baseY: mesh.position.y,
                pressOffsetY: 0,
                floatPhase: Math.random() * Math.PI * 2,
                floatWeight: 0,
                phase: 'idle',
                timer: 0
            })
        }
    }

    getDefinitionByKey(key)
    {
        return MATERIAL_DEFINITIONS.find((definition) => definition.key === key) ?? null
    }

    setBuildingEntries()
    {
        this.buildingEntries = []

        for(const mesh of this.buildingMeshes)
        {
            if(!(mesh instanceof THREE.Mesh))
            {
                continue
            }

            const runtimeMaterials = this.cloneAndSetupMeshMaterials(mesh)
            this.buildingEntries.push({
                mesh,
                runtimeMaterials
            })
        }

        this.applyBuildingSelection(null)
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
        const clonedMaterials = sourceMaterials.map((material) =>
        {
            const runtimeMaterial = material?.clone?.() ?? material
            if(runtimeMaterial)
            {
                runtimeMaterial.userData = {
                    ...(runtimeMaterial.userData || {}),
                    baseEmissiveIntensity: runtimeMaterial.emissiveIntensity ?? 0,
                    baseColor: runtimeMaterial.color?.clone?.() ?? null,
                    baseEmissive: runtimeMaterial.emissive?.clone?.() ?? null
                }
            }
            return runtimeMaterial
        })

        mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0]
        return clonedMaterials
    }

    applyTextureToMaterials(materials, definition)
    {
        const texture = this.definitionTextures.get(definition.key)
        for(const material of materials)
        {
            if(!material)
            {
                continue
            }

            material.color?.set?.('#ffffff')
            if('map' in material)
            {
                material.map = texture
            }
            material.needsUpdate = true
        }
    }

    applyBuildingSelection(definition)
    {
        for(const entry of this.buildingEntries)
        {
            if(!entry?.runtimeMaterials)
            {
                continue
            }

            if(!definition)
            {
                for(const material of entry.runtimeMaterials)
                {
                    if(!material)
                    {
                        continue
                    }

                    material.map = null
                    material.color?.set?.('#4f78b8')
                    material.needsUpdate = true
                }
                continue
            }

            this.applyTextureToMaterials(entry.runtimeMaterials, definition)
        }
    }

    applySelectionVisualState(materials, isSelected)
    {
        for(const material of materials)
        {
            if(!material)
            {
                continue
            }

            const baseEmissiveIntensity = material.userData?.baseEmissiveIntensity ?? 0
            if(material.emissive)
            {
                material.emissiveIntensity = isSelected
                    ? Math.max(baseEmissiveIntensity, SELECTED_EMISSIVE_INTENSITY)
                    : Math.max(baseEmissiveIntensity, IDLE_EMISSIVE_INTENSITY)
            }

            material.needsUpdate = true
        }
    }

    setEvents()
    {
        this.onMouseDown = () =>
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

            this.holdMaterial(clickedMesh)
        }

        this.onMouseUp = () =>
        {
            const clickedState = this.activePressedMeshUuid
                ? this.materialStates.get(this.activePressedMeshUuid)
                : null
            this.releaseHeldMaterial()

            if(clickedState && this.isInteractionActive())
            {
                this.toggleSelection(clickedState.key)
            }
        }

        this.onWindowBlur = () =>
        {
            this.releaseHeldMaterial()
        }

        this.onWindowResize = () =>
        {
            this.centerScreen.set(window.innerWidth * 0.5, window.innerHeight * 0.5)
        }

        this.inputs?.on?.('sceneinteractdown.recuperationMateriau', this.onMouseDown)
        this.inputs?.on?.('sceneinteractup.recuperationMateriau', this.onMouseUp)
        this.inputs?.on?.('blur.recuperationMateriau', this.onWindowBlur)
        window.addEventListener('resize', this.onWindowResize)
    }

    isInteractionActive()
    {
        return !Boolean(this.dialogueManager?.isRunning?.())
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

    holdMaterial(mesh)
    {
        const state = this.materialStates.get(mesh.uuid)
        if(!state)
        {
            return
        }

        this.activePressedMeshUuid = mesh.uuid
        state.phase = 'hold'
        state.pressOffsetY = -BUTTON_PRESS_DEPTH
        state.timer = 0
    }

    releaseHeldMaterial()
    {
        if(!this.activePressedMeshUuid)
        {
            return
        }

        const state = this.materialStates.get(this.activePressedMeshUuid)
        this.activePressedMeshUuid = null
        if(!state)
        {
            return
        }

        state.phase = 'release'
        state.timer = 0
    }

    toggleSelection(materialKey)
    {
        if(this.selectedMaterialKey === materialKey)
        {
            this.selectedMaterialKey = null
        }
        else
        {
            this.selectedMaterialKey = materialKey
        }

        for(const state of this.materialStates.values())
        {
            const isSelected = state.key === this.selectedMaterialKey
            this.applySelectionVisualState(state.runtimeMaterials, isSelected)
        }

        this.applyBuildingSelection(this.getDefinitionByKey(this.selectedMaterialKey))

        this.onSelectionChange?.(this.getSelectedMaterial())
    }

    getSelectedMaterial()
    {
        if(!this.selectedMaterialKey)
        {
            return null
        }

        const state = [...this.materialStates.values()].find((entry) => entry.key === this.selectedMaterialKey)
        if(!state)
        {
            return null
        }

        return {
            key: state.key,
            label: state.definition.label,
            description: state.definition.description,
            accentColor: state.definition.accentColor,
            meshUuid: state.mesh.uuid
        }
    }

    getMaterialMeshAtCenter()
    {
        return this.centerRaycaster.intersectFirst(this.clickableMeshes, false)
    }

    update(deltaMs = this.experience.time.delta)
    {
        const deltaSeconds = Math.max(0.001, Math.min(0.05, (deltaMs || 16.67) * 0.001))

        this.updateMeshes(deltaSeconds)
        this.ensureCursorElement()

        if(!this.centerRaycaster.hasCamera() || !this.isInteractionActive())
        {
            this.hoveredMesh = null
            this.updateCursor()
            return
        }

        this.hoveredMesh = this.getMaterialMeshAtCenter()
        this.updateCursor()
    }

    updateMeshes(deltaSeconds)
    {
        for(const state of this.materialStates.values())
        {
            if(!state?.mesh)
            {
                continue
            }

            if(state.phase === 'hold')
            {
                state.pressOffsetY = -BUTTON_PRESS_DEPTH
            }
            else if(state.phase === 'release')
            {
                state.timer += deltaSeconds
                const progress = Math.min(1, state.timer / BUTTON_RELEASE_DURATION)
                state.pressOffsetY = -BUTTON_PRESS_DEPTH * (1 - progress)

                if(progress >= 1)
                {
                    state.phase = 'idle'
                    state.timer = 0
                    state.pressOffsetY = 0
                }
            }

            const targetFloatWeight = state.key === this.selectedMaterialKey ? 1 : 0
            state.floatWeight = THREE.MathUtils.damp(
                state.floatWeight,
                targetFloatWeight,
                6,
                deltaSeconds
            )
            state.floatPhase += deltaSeconds * FLOAT_SPEED

            const floatOffset = Math.sin(state.floatPhase) * FLOAT_AMPLITUDE * state.floatWeight
            state.mesh.position.y = state.baseY + state.pressOffsetY + floatOffset
        }
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

    destroy()
    {
        this.inputs?.off?.('sceneinteractdown.recuperationMateriau')
        this.inputs?.off?.('sceneinteractup.recuperationMateriau')
        this.inputs?.off?.('blur.recuperationMateriau')
        window.removeEventListener('resize', this.onWindowResize)
        this.releaseHeldMaterial()
        this.releaseCursor()

        for(const state of this.materialStates.values())
        {
            if(state?.mesh)
            {
                state.mesh.position.y = state.baseY
            }
        }

        this.materialStates.clear()
        for(const texture of this.definitionTextures.values())
        {
            texture?.dispose?.()
        }
        this.definitionTextures.clear()
        this.buildingEntries = []
        this.hoveredMesh = null

        if(this.createdCursorElement && this.cursorElement instanceof HTMLElement)
        {
            this.cursorElement.remove()
        }

        this.cursorElement = null
        this.recuperationModel = null
    }
}
