import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import CenterScreenRaycaster from '../../../../Utils/CenterScreenRaycaster.js'
import * as ChampignonConstants from './ChampignonInteraction.constants.js'

const HIGHLIGHT_COLOR = new THREE.Color('#9ffb6b')
const HIGHLIGHT_EMISSIVE = new THREE.Color('#b7ff8f')

export default class ChampignonInteraction
{
    constructor({
        world = null,
        onPlacedAll = null,
        onComplete = null,
        debugParentFolder = null
    } = {})
    {
        this.experience = new Experience()
        this.world = world
        this.inputs = this.experience.inputs
        this.debug = this.experience.debug
        this.debugParentFolder = debugParentFolder
        this.onPlacedAll = typeof onPlacedAll === 'function' ? onPlacedAll : null
        this.onComplete = typeof onComplete === 'function' ? onComplete : null
        this.phase = ChampignonConstants.CHAMPIGNON_PHASE_PLACING
        this.isActive = false
        this.hasCompleted = false
        this.champignons = []
        this.slots = []
        this.placedChampignons = new Set()
        this.slotAssignments = new Map()
        this.centerRaycaster = new CenterScreenRaycaster({
            getCamera: () => this.experience.camera?.instance ?? null
        })
        this.centerScreen = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5)
        this.cursorElement = null
        this.createdCursorElement = false
        this.ownsCursor = false
        this.debugState = {
            active: false,
            completed: false,
            phase: this.phase,
            champignonsFound: 0,
            slotsFound: 0,
            placed: 0,
            litAboveThreshold: 0
        }

        this.collectObjects()
        this.hideAllChampignons()
        this.assignChampignonsToSlots()
        this.bindEvents()
        this.setDebug()
    }

    collectObjects()
    {
        const root = this.world?.recyclageModel?.model
        if(!root)
        {
            return
        }

        root.traverse((child) =>
        {
            const normalizedName = String(child.name || '').trim().toLowerCase()
            if(normalizedName.startsWith(ChampignonConstants.CHAMPIGNON_NAME_PREFIX))
            {
                this.champignons.push(this.createChampignonEntry(child))
                return
            }

            if(child instanceof THREE.Mesh && normalizedName.startsWith(ChampignonConstants.CHAMPIGNON_SLOT_NAME_PREFIX))
            {
                this.slots.push(child)
            }
        })

        this.debugState.champignonsFound = this.champignons.length
        this.debugState.slotsFound = this.slots.length
    }

    createChampignonEntry(root)
    {
        const meshes = []
        root.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            const sourceMaterials = Array.isArray(child.material)
                ? child.material
                : [child.material]
            const materials = sourceMaterials.filter(Boolean).map((material) =>
            {
                const clone = material.clone?.() ?? material
                return {
                    instance: clone,
                    baseColor: clone.color?.clone?.() ?? null,
                    baseEmissive: clone.emissive?.clone?.() ?? null,
                    baseEmissiveIntensity: Number.isFinite(clone.emissiveIntensity) ? clone.emissiveIntensity : 0
                }
            })

            child.material = Array.isArray(child.material)
                ? materials.map(({ instance }) => instance)
                : (materials[0]?.instance ?? child.material)

            meshes.push({
                mesh: child,
                materials
            })
        })

        return {
            root,
            meshes,
            energy: 0,
            placed: false,
            slot: null,
            baseScale: root.scale.clone()
        }
    }

    hideAllChampignons()
    {
        for(const champignon of this.champignons)
        {
            champignon.root.visible = false
            this.applyChampignonEnergy(champignon)
        }

        this.placedChampignons.clear()
        this.debugState.placed = 0
        this.debugState.litAboveThreshold = 0
    }

    assignChampignonsToSlots()
    {
        const availableChampignons = [...this.champignons]
        const slotPosition = new THREE.Vector3()
        const champignonPosition = new THREE.Vector3()

        for(const slot of this.slots)
        {
            slot.getWorldPosition(slotPosition)
            let bestChampignon = null
            let bestDistance = Infinity

            for(const champignon of availableChampignons)
            {
                champignon.root.getWorldPosition(champignonPosition)
                const distance = slotPosition.distanceToSquared(champignonPosition)
                if(distance < bestDistance)
                {
                    bestDistance = distance
                    bestChampignon = champignon
                }
            }

            if(bestChampignon)
            {
                bestChampignon.slot = slot
                this.slotAssignments.set(slot, bestChampignon)
                availableChampignons.splice(availableChampignons.indexOf(bestChampignon), 1)
            }
        }
    }

    bindEvents()
    {
        this.onMouseDown = (event) =>
        {
            if(event?.button !== 0)
            {
                return
            }

            this.handleInteraction()
        }
        this.onWindowBlur = () =>
        {
            this.releaseCursor()
        }
        this.onWindowResize = () =>
        {
            this.centerScreen.set(window.innerWidth * 0.5, window.innerHeight * 0.5)
        }

        this.inputs?.on?.('mousedown.recyclageChampignons', this.onMouseDown)
        this.inputs?.on?.('blur.recyclageChampignons', this.onWindowBlur)
        window.addEventListener('resize', this.onWindowResize)
    }

    start()
    {
        if(this.hasCompleted || this.isActive)
        {
            return
        }

        this.isActive = true
        this.phase = ChampignonConstants.CHAMPIGNON_PHASE_PLACING
        this.debugState.active = true
        this.debugState.phase = this.phase
        this.experience.isChampignonInteracting = true
        this.inputs?.exitPointerLock?.()
    }

    handleInteraction()
    {
        if(this.isActive !== true || this.hasCompleted)
        {
            return
        }

        if(this.phase === ChampignonConstants.CHAMPIGNON_PHASE_PLACING)
        {
            this.handlePlacingInteraction()
            return
        }

        if(this.phase === ChampignonConstants.CHAMPIGNON_PHASE_LIGHTING)
        {
            this.handleLightingInteraction()
        }
    }

    handlePlacingInteraction()
    {
        const hit = this.centerRaycaster.intersectFirstHit(this.slots, false)
        if(!hit?.object || !Number.isFinite(hit.distance) || hit.distance > ChampignonConstants.CHAMPIGNON_MAX_INTERACTION_DISTANCE)
        {
            return
        }

        const champignon = this.slotAssignments.get(hit.object)
        if(!champignon || champignon.placed === true)
        {
            return
        }

        this.placeChampignon(champignon)
    }

    placeChampignon(champignon)
    {
        champignon.root.visible = true
        champignon.placed = true
        this.placedChampignons.add(champignon)
        this.debugState.placed = this.placedChampignons.size

        if(this.placedChampignons.size >= this.champignons.length)
        {
            this.startLightingPhase()
        }
    }

    startLightingPhase()
    {
        this.phase = ChampignonConstants.CHAMPIGNON_PHASE_LIGHTING
        this.debugState.phase = this.phase
        this.onPlacedAll?.()
    }

    handleLightingInteraction()
    {
        const targetMeshes = this.champignons
            .filter((champignon) => champignon.placed === true)
            .flatMap((champignon) => champignon.meshes.map(({ mesh }) => mesh))

        const hit = this.centerRaycaster.intersectFirstHit(targetMeshes, false)
        if(!hit?.object || !Number.isFinite(hit.distance) || hit.distance > ChampignonConstants.CHAMPIGNON_MAX_INTERACTION_DISTANCE)
        {
            return
        }

        const champignon = this.champignons.find((entry) =>
        {
            return entry.meshes.some(({ mesh }) => mesh === hit.object)
        })
        if(!champignon)
        {
            return
        }

        champignon.energy = Math.min(1, champignon.energy + ChampignonConstants.CHAMPIGNON_LIGHT_INCREMENT)
        this.applyChampignonEnergy(champignon)
        this.refreshLightingProgress()
        this.checkLightingCompletion()
    }

    applyChampignonEnergy(champignon)
    {
        const energy = THREE.MathUtils.clamp(champignon.energy, 0, 1)
        const scaleBoost = 1 + (energy * ChampignonConstants.CHAMPIGNON_LIGHT_SCALE_BOOST)
        champignon.root.scale.copy(champignon.baseScale).multiplyScalar(scaleBoost)

        for(const meshEntry of champignon.meshes)
        {
            for(const materialState of meshEntry.materials)
            {
                const material = materialState.instance
                if(material.color && materialState.baseColor)
                {
                    material.color.copy(materialState.baseColor).lerp(HIGHLIGHT_COLOR, energy * 0.75)
                }

                if(material.emissive && materialState.baseEmissive)
                {
                    material.emissive.copy(materialState.baseEmissive).lerp(HIGHLIGHT_EMISSIVE, energy)
                    material.emissiveIntensity = materialState.baseEmissiveIntensity + (energy * 1.8)
                }

                material.needsUpdate = true
            }
        }
    }

    refreshLightingProgress()
    {
        this.debugState.litAboveThreshold = this.champignons.filter((champignon) =>
        {
            return champignon.placed === true
                && champignon.energy >= ChampignonConstants.CHAMPIGNON_LIGHT_SUCCESS_THRESHOLD
        }).length
    }

    checkLightingCompletion()
    {
        const areAllLit = this.champignons.every((champignon) =>
        {
            return champignon.placed === true
                && champignon.energy >= ChampignonConstants.CHAMPIGNON_LIGHT_SUCCESS_THRESHOLD
        })

        if(areAllLit)
        {
            this.complete()
        }
    }

    update(delta = this.experience.time.delta)
    {
        this.ensureCursorElement()
        this.updateCursor()

        if(this.isActive !== true || this.phase !== ChampignonConstants.CHAMPIGNON_PHASE_LIGHTING || this.hasCompleted)
        {
            return
        }

        const deltaSeconds = Math.min(delta, 50) * 0.001
        let changed = false

        for(const champignon of this.champignons)
        {
            if(champignon.placed !== true || champignon.energy <= 0)
            {
                continue
            }

            const nextEnergy = Math.max(0, champignon.energy - (ChampignonConstants.CHAMPIGNON_LIGHT_DECAY_PER_SECOND * deltaSeconds))
            if(Math.abs(nextEnergy - champignon.energy) < 1e-4)
            {
                continue
            }

            champignon.energy = nextEnergy
            this.applyChampignonEnergy(champignon)
            changed = true
        }

        if(changed)
        {
            this.refreshLightingProgress()
        }
    }

    complete()
    {
        if(this.hasCompleted)
        {
            return
        }

        this.isActive = false
        this.hasCompleted = true
        this.phase = ChampignonConstants.CHAMPIGNON_PHASE_COMPLETED
        this.debugState.active = false
        this.debugState.completed = true
        this.debugState.phase = this.phase
        this.experience.isChampignonInteracting = false
        this.releaseCursor()
        this.onComplete?.()
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

    updateCursor()
    {
        if(!(this.cursorElement instanceof HTMLElement))
        {
            return
        }

        if(this.isActive !== true || this.hasCompleted)
        {
            this.releaseCursor()
            return
        }

        this.ownsCursor = true
        document.body.classList.add(ChampignonConstants.CHAMPIGNON_CURSOR_OWNER_CLASS)
        this.cursorElement.style.left = `${this.centerScreen.x}px`
        this.cursorElement.style.top = `${this.centerScreen.y}px`
        this.cursorElement.classList.add('is-visible')
        this.cursorElement.classList.remove('is-over-choice')
    }

    releaseCursor()
    {
        if(this.ownsCursor)
        {
            this.ownsCursor = false
            document.body.classList.remove(ChampignonConstants.CHAMPIGNON_CURSOR_OWNER_CLASS)
        }

        if(this.cursorElement instanceof HTMLElement)
        {
            this.cursorElement.classList.remove('is-visible')
            this.cursorElement.classList.remove('is-over-choice')
        }
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled || !this.debugParentFolder)
        {
            return
        }

        this.debugFolder = this.debug.addFolder(ChampignonConstants.CHAMPIGNON_DEBUG_FOLDER_TITLE, {
            parent: this.debugParentFolder,
            expanded: true
        })
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'active', {
            label: 'Interaction active',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'completed', {
            label: 'Interaction finie',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'phase', {
            label: 'Phase',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'champignonsFound', {
            label: 'Champignons trouves',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'slotsFound', {
            label: 'Emplacements trouves',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'placed', {
            label: 'Champignons poses',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'litAboveThreshold', {
            label: 'Tous presques allumes',
            readonly: true
        }, 'auto')
        this.debug.addButton(this.debugFolder, {
            title: 'Poser tous',
            onClick: () =>
            {
                for(const champignon of this.champignons)
                {
                    if(champignon.placed !== true)
                    {
                        this.placeChampignon(champignon)
                    }
                }
            }
        })
        this.debug.addButton(this.debugFolder, {
            title: 'Allumer tous',
            onClick: () =>
            {
                for(const champignon of this.champignons)
                {
                    champignon.energy = 1
                    this.applyChampignonEnergy(champignon)
                }
                this.refreshLightingProgress()
                this.checkLightingCompletion()
            }
        })
    }

    destroy()
    {
        this.inputs?.off?.('mousedown.recyclageChampignons')
        this.inputs?.off?.('blur.recyclageChampignons')
        window.removeEventListener('resize', this.onWindowResize)
        this.debugFolder?.dispose?.()
        this.debugFolder = null
        this.experience.isChampignonInteracting = false
        this.releaseCursor()

        if(this.createdCursorElement && this.cursorElement instanceof HTMLElement)
        {
            this.cursorElement.remove()
        }

        for(const champignon of this.champignons)
        {
            for(const meshEntry of champignon.meshes)
            {
                for(const materialState of meshEntry.materials)
                {
                    materialState.instance?.dispose?.()
                }
            }
        }

        this.champignons = []
        this.slots = []
        this.placedChampignons.clear()
        this.slotAssignments.clear()
        this.cursorElement = null
    }
}
