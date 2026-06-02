import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import CenterScreenRaycaster from '../../../../Utils/CenterScreenRaycaster.js'
import * as ChampignonConstants from './ChampignonInteraction.constants.js'

const HIGHLIGHT_COLOR = new THREE.Color('#9ffb6b')
const HIGHLIGHT_EMISSIVE = new THREE.Color('#b7ff8f')
const SLOT_HOVER_COLOR = new THREE.Color(ChampignonConstants.CHAMPIGNON_SLOT_HOVER_COLOR)
const SLOT_HOVER_EMISSIVE = new THREE.Color(ChampignonConstants.CHAMPIGNON_SLOT_HOVER_EMISSIVE)
const SLOT_IDLE_GLOW_COLOR = new THREE.Color(ChampignonConstants.CHAMPIGNON_SLOT_IDLE_GLOW_COLOR)
const SLOT_IDLE_GLOW_EMISSIVE = new THREE.Color(ChampignonConstants.CHAMPIGNON_SLOT_IDLE_GLOW_EMISSIVE)
const WHITE_COLOR = new THREE.Color('#ffffff')

export default class ChampignonInteraction
{
    constructor({
        world = null,
        onPlacedAll = null,
        onLightingProgress = null,
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
        this.onLightingProgress = typeof onLightingProgress === 'function' ? onLightingProgress : null
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
        this.hoveredSlot = null
        this.hoveredChampignon = null
        this.slotInteractionRay = new THREE.Ray()
        this.slotInteractionHitPoint = new THREE.Vector3()
        this.slotInteractionSize = new THREE.Vector3()
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
            const isChampignonRoot = normalizedName.startsWith(ChampignonConstants.CHAMPIGNON_NAME_PREFIX)
                && !(child instanceof THREE.Mesh)
            if(isChampignonRoot)
            {
                this.champignons.push(this.createChampignonEntry(child))
                return
            }

            if(child instanceof THREE.Mesh && normalizedName.startsWith(ChampignonConstants.CHAMPIGNON_SLOT_NAME_PREFIX))
            {
                this.slots.push(this.createSlotEntry(child, this.slots.length))
            }
        })

        this.debugState.champignonsFound = this.champignons.length
        this.debugState.slotsFound = this.slots.length
    }

    createSlotEntry(mesh, slotIndex = 0)
    {
        const interactionBounds = new THREE.Box3().setFromObject(mesh)
        if(!interactionBounds.isEmpty())
        {
            interactionBounds.getSize(this.slotInteractionSize)
            interactionBounds.expandByVector(new THREE.Vector3(
                ChampignonConstants.CHAMPIGNON_SLOT_INTERACTION_PADDING_XZ,
                0,
                ChampignonConstants.CHAMPIGNON_SLOT_INTERACTION_PADDING_XZ
            ))

            const missingHeight = Math.max(0, ChampignonConstants.CHAMPIGNON_SLOT_INTERACTION_MIN_HEIGHT - this.slotInteractionSize.y)
            if(missingHeight > 0)
            {
                interactionBounds.min.y -= missingHeight * 0.5
                interactionBounds.max.y += missingHeight * 0.5
            }
        }

        const sourceMaterials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]
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

        mesh.material = Array.isArray(mesh.material)
            ? materials.map(({ instance }) => instance)
            : (materials[0]?.instance ?? mesh.material)

        return {
            mesh,
            materials,
            interactionBounds,
            assignedChampignon: null,
            isHovered: false,
            pulseStrength: 0,
            pulsePhaseOffset: slotIndex * ChampignonConstants.CHAMPIGNON_SLOT_IDLE_GLOW_PHASE_OFFSET
        }
    }

    createChampignonEntry(root)
    {
        const champignonIndex = this.champignons.length
        const lightColor = new THREE.Color(
            ChampignonConstants.CHAMPIGNON_LIGHT_COLOR_PALETTE[
                champignonIndex % ChampignonConstants.CHAMPIGNON_LIGHT_COLOR_PALETTE.length
            ]
        )
        const surfaceTintColor = lightColor.clone().lerp(WHITE_COLOR, 0.2)
        const outlineColor = lightColor.clone().lerp(WHITE_COLOR, 0.35)
        const surfaceTexture = this.createChampignonSurfaceTexture(surfaceTintColor)
        const meshes = []
        const lightMeshes = []
        const outlineSpecs = []
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
                    baseMap: clone.map ?? null,
                    baseEmissive: clone.emissive?.clone?.() ?? null,
                    baseEmissiveIntensity: Number.isFinite(clone.emissiveIntensity) ? clone.emissiveIntensity : 0
                }
            })

            child.material = Array.isArray(child.material)
                ? materials.map(({ instance }) => instance)
                : (materials[0]?.instance ?? child.material)

            const normalizedName = String(child.name || '').trim().toLowerCase()
            const isLightMesh = ChampignonConstants.CHAMPIGNON_LIGHT_MESH_NAMES.includes(normalizedName)

            meshes.push({
                mesh: child,
                materials,
                isLightMesh
            })

            if(isLightMesh)
            {
                lightMeshes.push(child)
            }
            else
            {
                for(const materialState of materials)
                {
                    if(materialState.instance)
                    {
                        materialState.instance.map = surfaceTexture
                    }
                }
            }

            outlineSpecs.push({
                geometry: child.geometry,
                position: child.position.clone(),
                quaternion: child.quaternion.clone(),
                scale: child.scale.clone(),
                renderOrder: child.renderOrder || 0
            })
        })

        const outlineGroup = new THREE.Group()
        outlineGroup.visible = false
        for(const outlineSpec of outlineSpecs)
        {
            const outlineMaterial = new THREE.MeshBasicMaterial({
                color: outlineColor,
                side: THREE.BackSide,
                transparent: true,
                opacity: ChampignonConstants.CHAMPIGNON_OUTLINE_OPACITY,
                depthWrite: false
            })
            const outlineMesh = new THREE.Mesh(outlineSpec.geometry, outlineMaterial)
            outlineMesh.position.copy(outlineSpec.position)
            outlineMesh.quaternion.copy(outlineSpec.quaternion)
            outlineMesh.scale.copy(outlineSpec.scale).multiplyScalar(ChampignonConstants.CHAMPIGNON_OUTLINE_SCALE)
            outlineMesh.renderOrder = outlineSpec.renderOrder + 1
            outlineGroup.add(outlineMesh)
        }
        root.add(outlineGroup)

        const pointLight = new THREE.PointLight(
            lightColor,
            0,
            ChampignonConstants.CHAMPIGNON_POINT_LIGHT_DISTANCE
        )
        pointLight.position.set(0, 0.18, 0)
        pointLight.visible = false
        root.add(pointLight)

        return {
            root,
            meshes,
            lightMeshes: lightMeshes.length > 0 ? lightMeshes : meshes.map(({ mesh }) => mesh),
            outlineGroup,
            pointLight,
            lightColor,
            outlineColor,
            surfaceTintColor,
            surfaceTexture,
            energy: 0,
            placed: false,
            slot: null,
            baseScale: root.scale.clone(),
            appearProgress: 0,
            animatedScale: 0
        }
    }

    createChampignonSurfaceTexture(surfaceColor)
    {
        const textureSize = ChampignonConstants.CHAMPIGNON_TEXTURE_SIZE
        const canvas = document.createElement('canvas')
        canvas.width = textureSize
        canvas.height = textureSize

        const context = canvas.getContext('2d')
        if(!context)
        {
            return null
        }

        const baseHex = `#${surfaceColor.getHexString()}`
        const highlightHex = `#${surfaceColor.clone().lerp(WHITE_COLOR, 0.32).getHexString()}`
        const shadowHex = `#${surfaceColor.clone().multiplyScalar(0.68).getHexString()}`

        context.fillStyle = baseHex
        context.fillRect(0, 0, textureSize, textureSize)

        const gradient = context.createLinearGradient(0, 0, 0, textureSize)
        gradient.addColorStop(0, highlightHex)
        gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.08)')
        gradient.addColorStop(1, shadowHex)
        context.fillStyle = gradient
        context.fillRect(0, 0, textureSize, textureSize)

        context.fillStyle = 'rgba(255, 255, 255, 0.18)'
        for(let index = 0; index < 8; index++)
        {
            const radius = 8 + ((index % 3) * 4)
            const x = 14 + ((index * 17) % 96)
            const y = 18 + ((index * 23) % 88)
            context.beginPath()
            context.arc(x, y, radius, 0, Math.PI * 2)
            context.fill()
        }

        context.fillStyle = 'rgba(0, 0, 0, 0.14)'
        for(let index = 0; index < 6; index++)
        {
            const stripeY = 12 + (index * 18)
            context.fillRect(0, stripeY, textureSize, 4)
        }

        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.repeat.set(1.25, 1.25)
        texture.needsUpdate = true
        return texture
    }

    hideAllChampignons()
    {
        for(const champignon of this.champignons)
        {
            champignon.root.visible = false
            champignon.appearProgress = 0
            champignon.animatedScale = 0
            champignon.root.scale.set(0, 0, 0)
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
            slot.mesh.getWorldPosition(slotPosition)
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
                bestChampignon.slot = slot.mesh
                slot.assignedChampignon = bestChampignon
                this.slotAssignments.set(slot.mesh, bestChampignon)
                availableChampignons.splice(availableChampignons.indexOf(bestChampignon), 1)
            }
        }
    }

    getHoveredUnplacedSlot()
    {
        const interactionRay = this.centerRaycaster.getRay(this.slotInteractionRay)
        if(!interactionRay)
        {
            return null
        }

        let closestSlot = null
        let closestDistance = Infinity

        for(const slot of this.slots)
        {
            if(slot?.assignedChampignon?.placed === true || !(slot?.interactionBounds instanceof THREE.Box3))
            {
                continue
            }

            const hitPoint = interactionRay.intersectBox(slot.interactionBounds, this.slotInteractionHitPoint)
            if(!hitPoint)
            {
                continue
            }

            const distance = interactionRay.origin.distanceTo(hitPoint)
            if(!Number.isFinite(distance) || distance > ChampignonConstants.CHAMPIGNON_MAX_INTERACTION_DISTANCE)
            {
                continue
            }

            if(distance < closestDistance)
            {
                closestDistance = distance
                closestSlot = slot
            }
        }

        return closestSlot
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
        this.focusGameCanvas()
    }

    focusGameCanvas()
    {
        const canvas = this.experience?.canvas
        if(!(canvas instanceof HTMLElement))
        {
            return
        }

        if(!canvas.hasAttribute('tabindex'))
        {
            canvas.setAttribute('tabindex', '0')
        }

        canvas.focus({ preventScroll: true })
    }

    handleInteraction()
    {
        if(this.isActive !== true || this.hasCompleted)
        {
            return
        }

        if(this.phase === ChampignonConstants.CHAMPIGNON_PHASE_PLACING)
        {
            if(this.handlePlacingInteraction())
            {
                return
            }

            this.handleLightingInteraction()
            return
        }

        if(this.phase === ChampignonConstants.CHAMPIGNON_PHASE_LIGHTING)
        {
            this.handleLightingInteraction()
        }
    }

    handlePlacingInteraction()
    {
        const hoveredSlot = this.getHoveredUnplacedSlot()
        if(!hoveredSlot)
        {
            return false
        }

        const champignon = hoveredSlot.assignedChampignon ?? this.slotAssignments.get(hoveredSlot.mesh)
        if(!champignon || champignon.placed === true)
        {
            return false
        }

        this.placeChampignon(champignon)
        return true
    }

    placeChampignon(champignon)
    {
        champignon.root.visible = true
        champignon.placed = true
        champignon.appearProgress = 0
        champignon.animatedScale = 0
        champignon.root.scale.set(0, 0, 0)
        this.placedChampignons.add(champignon)
        this.debugState.placed = this.placedChampignons.size

        if(this.placedChampignons.size >= this.champignons.length)
        {
            this.startLightingPhase()
        }
    }

    placeAllChampignons()
    {
        for(const champignon of this.champignons)
        {
            if(champignon.placed !== true)
            {
                this.placeChampignon(champignon)
            }
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
            return false
        }

        const champignon = this.champignons.find((entry) =>
        {
            return entry.meshes.some(({ mesh }) => mesh === hit.object)
        })
        if(!champignon)
        {
            return false
        }

        champignon.energy = Math.min(1, champignon.energy + ChampignonConstants.CHAMPIGNON_LIGHT_INCREMENT)
        this.applyChampignonEnergy(champignon)
        this.refreshLightingProgress()
        this.checkLightingCompletion()
        return true
    }

    applyChampignonEnergy(champignon)
    {
        const energy = THREE.MathUtils.clamp(champignon.energy, 0, 1)
        const lightScaleBoost = 1 + (energy * ChampignonConstants.CHAMPIGNON_LIGHT_SCALE_BOOST)
        const appearScale = Number.isFinite(champignon.animatedScale) ? champignon.animatedScale : 1
        champignon.root.scale.copy(champignon.baseScale).multiplyScalar(lightScaleBoost * appearScale)

        for(const meshEntry of champignon.meshes)
        {
            for(const materialState of meshEntry.materials)
            {
                const material = materialState.instance
                if(material.color && materialState.baseColor)
                {
                    if(meshEntry.isLightMesh)
                    {
                        material.color.copy(materialState.baseColor).multiplyScalar(0.28 + (energy * 0.72))
                        material.color.lerp(champignon.lightColor, energy * 0.4)
                        material.color.lerp(HIGHLIGHT_COLOR, energy * 0.18)
                    }
                    else
                    {
                        material.color.copy(materialState.baseColor)
                        material.color.lerp(
                            champignon.surfaceTintColor,
                            ChampignonConstants.CHAMPIGNON_SURFACE_TINT_STRENGTH
                        )
                        material.color.multiplyScalar(
                            1 - (energy * ChampignonConstants.CHAMPIGNON_SURFACE_SHADE_STRENGTH)
                        )
                    }
                }

                if(material.emissive)
                {
                    if(meshEntry.isLightMesh)
                    {
                        material.emissive.setRGB(0, 0, 0)
                        material.emissive.lerp(champignon.lightColor, energy * 0.9)
                        material.emissive.lerp(HIGHLIGHT_EMISSIVE, energy * 0.22)
                        material.emissiveIntensity = energy * 1.8
                    }
                    else if(materialState.baseEmissive)
                    {
                        material.emissive.copy(materialState.baseEmissive)
                        material.emissiveIntensity = materialState.baseEmissiveIntensity
                    }
                }

                material.needsUpdate = true
            }
        }

        if(champignon.pointLight)
        {
            champignon.pointLight.visible = champignon.placed === true && energy > 0.01
            champignon.pointLight.color.copy(champignon.lightColor)
            champignon.pointLight.intensity = energy * ChampignonConstants.CHAMPIGNON_POINT_LIGHT_INTENSITY
        }
    }

    refreshLightingProgress()
    {
        this.debugState.litAboveThreshold = this.champignons.filter((champignon) =>
        {
            return champignon.placed === true
                && champignon.energy >= ChampignonConstants.CHAMPIGNON_LIGHT_SUCCESS_THRESHOLD
        }).length

        this.onLightingProgress?.({
            litCount: this.debugState.litAboveThreshold,
            totalCount: this.champignons.length
        })
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

    lightAllChampignons()
    {
        this.placeAllChampignons()

        for(const champignon of this.champignons)
        {
            champignon.energy = 1
            this.applyChampignonEnergy(champignon)
        }

        this.refreshLightingProgress()
        this.checkLightingCompletion()
    }

    update(delta = this.experience.time.delta)
    {
        this.ensureCursorElement()
        this.updateCursor()
        this.updateSlotHover()
        this.updateSlotIdleGlow()
        this.updateChampignonHover()
        this.updatePlacementAnimations(delta)

        if(this.isActive !== true || this.hasCompleted)
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

            let nextEnergy = Math.max(0, champignon.energy - (ChampignonConstants.CHAMPIGNON_LIGHT_DECAY_PER_SECOND * deltaSeconds))
            if(nextEnergy <= ChampignonConstants.CHAMPIGNON_LIGHT_OFF_SNAP_THRESHOLD)
            {
                nextEnergy = 0
            }

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

    updatePlacementAnimations(delta)
    {
        const deltaSeconds = Math.min(delta, 50) * 0.001

        for(const champignon of this.champignons)
        {
            if(champignon.placed !== true || champignon.appearProgress >= 1)
            {
                continue
            }

            champignon.appearProgress = Math.min(
                1,
                champignon.appearProgress + (deltaSeconds * ChampignonConstants.CHAMPIGNON_APPEAR_GROW_SPEED)
            )

            const easedProgress = 1 - Math.pow(1 - champignon.appearProgress, 4)
            const overshoot = Math.sin(easedProgress * Math.PI) * (1 - easedProgress)
            champignon.animatedScale = easedProgress * (
                1 + overshoot * (ChampignonConstants.CHAMPIGNON_APPEAR_OVERSHOOT_SCALE - 1) * ChampignonConstants.CHAMPIGNON_APPEAR_BOUNCE_SPEED
            )

            if(champignon.appearProgress >= 1)
            {
                champignon.animatedScale = 1
            }

            this.applyChampignonEnergy(champignon)
        }
    }

    updateChampignonHover()
    {
        if(this.isActive !== true || this.hasCompleted)
        {
            this.setHoveredChampignon(null)
            return
        }

        const targetMeshes = this.champignons
            .filter((champignon) => champignon.placed === true)
            .flatMap((champignon) => champignon.meshes.map(({ mesh }) => mesh))
        const hit = this.centerRaycaster.intersectFirstHit(targetMeshes, false)
        if(!hit?.object || !Number.isFinite(hit.distance) || hit.distance > ChampignonConstants.CHAMPIGNON_MAX_INTERACTION_DISTANCE)
        {
            this.setHoveredChampignon(null)
            return
        }

        const champignon = this.champignons.find((entry) =>
        {
            return entry.meshes.some(({ mesh }) => mesh === hit.object)
        }) ?? null
        this.setHoveredChampignon(champignon)
    }

    setHoveredChampignon(champignon)
    {
        if(this.hoveredChampignon === champignon)
        {
            return
        }

        const previousChampignon = this.hoveredChampignon
        this.hoveredChampignon = champignon

        if(previousChampignon)
        {
            previousChampignon.outlineGroup.visible = false
        }

        if(this.hoveredChampignon)
        {
            this.hoveredChampignon.outlineGroup.traverse((child) =>
            {
                if(child.material?.color)
                {
                    child.material.color.copy(this.hoveredChampignon.outlineColor)
                }
            })
            this.hoveredChampignon.outlineGroup.visible = true
        }
    }

    updateSlotHover()
    {
        if(this.phase !== ChampignonConstants.CHAMPIGNON_PHASE_PLACING || this.isActive !== true || this.hasCompleted)
        {
            this.setHoveredSlot(null)
            return
        }

        const targetMeshes = this.slots
            .map((slot) => slot.mesh)
            .filter((mesh) => this.slotAssignments.get(mesh)?.placed !== true)
        if(targetMeshes.length === 0)
        {
            this.setHoveredSlot(null)
            return
        }

        this.setHoveredSlot(this.getHoveredUnplacedSlot())
    }

    setHoveredSlot(slotEntry)
    {
        if(this.hoveredSlot === slotEntry)
        {
            return
        }

        if(this.hoveredSlot)
        {
            this.applySlotHover(this.hoveredSlot, false)
        }

        this.hoveredSlot = slotEntry

        if(this.hoveredSlot)
        {
            this.applySlotHover(this.hoveredSlot, true)
        }
    }

    applySlotHover(slotEntry, isHovered)
    {
        slotEntry.isHovered = isHovered
        this.applySlotVisualState(slotEntry)
    }

    updateSlotIdleGlow()
    {
        const shouldPulse = this.phase === ChampignonConstants.CHAMPIGNON_PHASE_PLACING
            && this.isActive === true
            && this.hasCompleted !== true
        const elapsedSeconds = (this.experience.time.elapsed || 0) * 0.001

        for(const slotEntry of this.slots)
        {
            const assignedChampignon = slotEntry.assignedChampignon ?? this.slotAssignments.get(slotEntry.mesh)
            const isAvailable = assignedChampignon?.placed !== true
            const nextPulseStrength = shouldPulse && isAvailable
                ? (Math.sin(
                    (elapsedSeconds * ChampignonConstants.CHAMPIGNON_SLOT_IDLE_GLOW_SPEED)
                    + slotEntry.pulsePhaseOffset
                ) * 0.5) + 0.5
                : 0

            if(Math.abs(nextPulseStrength - slotEntry.pulseStrength) < 1e-3)
            {
                continue
            }

            slotEntry.pulseStrength = nextPulseStrength
            this.applySlotVisualState(slotEntry)
        }
    }

    applySlotVisualState(slotEntry)
    {
        const idleGlowIntensity = THREE.MathUtils.lerp(
            ChampignonConstants.CHAMPIGNON_SLOT_IDLE_GLOW_MIN_INTENSITY,
            ChampignonConstants.CHAMPIGNON_SLOT_IDLE_GLOW_MAX_INTENSITY,
            slotEntry.pulseStrength
        )

        for(const materialState of slotEntry.materials)
        {
            const material = materialState.instance

            if(material.color && materialState.baseColor)
            {
                material.color.copy(materialState.baseColor)
                material.color.lerp(SLOT_IDLE_GLOW_COLOR, 0.08 + (slotEntry.pulseStrength * 0.12))
                if(slotEntry.isHovered)
                {
                    material.color.lerp(SLOT_HOVER_COLOR, 0.55)
                }
            }

            if(material.emissive && materialState.baseEmissive)
            {
                material.emissive.copy(materialState.baseEmissive)
                material.emissive.lerp(SLOT_IDLE_GLOW_EMISSIVE, 0.25 + (slotEntry.pulseStrength * 0.35))
                material.emissiveIntensity = Math.max(
                    materialState.baseEmissiveIntensity,
                    idleGlowIntensity
                )
                if(slotEntry.isHovered)
                {
                    material.emissive.lerp(SLOT_HOVER_EMISSIVE, 0.85)
                    material.emissiveIntensity = Math.max(
                        materialState.baseEmissiveIntensity,
                        material.emissiveIntensity,
                        ChampignonConstants.CHAMPIGNON_SLOT_HOVER_EMISSIVE_INTENSITY
                    )
                }
            }

            material.needsUpdate = true
        }
    }

    complete()
    {
        if(this.hasCompleted)
        {
            return
        }

        for(const champignon of this.champignons)
        {
            if(champignon.placed !== true)
            {
                continue
            }

            champignon.energy = 1
            this.applyChampignonEnergy(champignon)
        }
        this.refreshLightingProgress()

        this.isActive = false
        this.hasCompleted = true
        this.phase = ChampignonConstants.CHAMPIGNON_PHASE_COMPLETED
        this.debugState.active = false
        this.debugState.completed = true
        this.debugState.phase = this.phase
        this.experience.isChampignonInteracting = false
        this.setHoveredChampignon(null)
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
            label: 'Champignons allumes',
            readonly: true
        }, 'auto')
        this.debug.addButton(this.debugFolder, {
            title: 'Poser tous',
            onClick: () => this.placeAllChampignons()
        })
        this.debug.addButton(this.debugFolder, {
            title: 'Allumer tous',
            onClick: () => this.lightAllChampignons()
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
        this.setHoveredSlot(null)
        this.setHoveredChampignon(null)
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

            champignon.outlineGroup?.traverse((child) =>
            {
                child.material?.dispose?.()
            })
            champignon.surfaceTexture?.dispose?.()
        }

        this.champignons = []
        this.slots = []
        this.placedChampignons.clear()
        this.slotAssignments.clear()
        this.cursorElement = null
    }
}
