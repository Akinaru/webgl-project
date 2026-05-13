import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import CenterScreenRaycaster from '../../../../Utils/CenterScreenRaycaster.js'
import * as MateriauConstants from './Materiau.constants.js'
import MaterialSwapBurstEffect from './MaterialSwapBurstEffect.js'

export default class Materiau
{
    constructor({
        recuperationModel,
        isExternalHoverActive = null,
        isInteractionLocked = null,
        onSelectionChange = null
    } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.inputs = this.experience.inputs
        this.dialogueManager = this.experience.dialogueManager
        this.recuperationModel = recuperationModel
        this.isExternalHoverActive = typeof isExternalHoverActive === 'function'
            ? isExternalHoverActive
            : null
        this.isInteractionLocked = typeof isInteractionLocked === 'function'
            ? isInteractionLocked
            : null
        this.onSelectionChange = typeof onSelectionChange === 'function'
            ? onSelectionChange
            : null
        this.clickableMeshes = this.recuperationModel?.getClickableMaterialMeshes?.() ?? []
        this.buildingMeshes = this.recuperationModel?.getMeshesForNameTokens?.(MateriauConstants.BUILDING_TEST_BLEU_NAME_TOKENS, { exact: true }) ?? []

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
        this.buildingEffect = null
        this.buildingTransitionBounds = null
        this.whiteTexture = null
        this.indicatorGroup = null
        this.indicatorLabelTexture = null
        this.indicatorCurrentKey = null
        this.indicatorBounds = new THREE.Box3()
        this.indicatorCenter = new THREE.Vector3()
        this.indicatorSize = new THREE.Vector3()
        this.indicatorLinePoints = [
            new THREE.Vector3(),
            new THREE.Vector3()
        ]

        this.setWhiteTexture()
        this.setDefinitionTextures()
        this.setMaterialStates()
        this.setBuildingEntries()
        this.setBuildingEffect()
        this.setSceneIndicator()
        this.ensureCursorElement()
        this.setEvents()
    }

    setWhiteTexture()
    {
        const pixel = new Uint8Array([255, 255, 255, 255])
        this.whiteTexture = new THREE.DataTexture(pixel, 1, 1, THREE.RGBAFormat)
        this.whiteTexture.colorSpace = THREE.SRGBColorSpace
        this.whiteTexture.needsUpdate = true
    }

    setDefinitionTextures()
    {
        this.definitionTextures.clear()

        for(const definition of MateriauConstants.MATERIAL_DEFINITIONS)
        {
            this.definitionTextures.set(definition.key, this.createTextureForDefinition(definition))
        }
    }

    createTextureForDefinition(definition)
    {
        const canvas = document.createElement('canvas')
        canvas.width = MateriauConstants.TEXTURE_SIZE
        canvas.height = MateriauConstants.TEXTURE_SIZE
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
        context.fillRect(0, 0, MateriauConstants.TEXTURE_SIZE, MateriauConstants.TEXTURE_SIZE)

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
            context.lineTo(x, MateriauConstants.TEXTURE_SIZE)
            context.stroke()
        }
    }

    drawGlassTexture(context)
    {
        const gradient = context.createLinearGradient(0, 0, MateriauConstants.TEXTURE_SIZE, MateriauConstants.TEXTURE_SIZE)
        gradient.addColorStop(0, '#dff7ff')
        gradient.addColorStop(0.5, '#86d4ea')
        gradient.addColorStop(1, '#3f7ea7')
        context.fillStyle = gradient
        context.fillRect(0, 0, MateriauConstants.TEXTURE_SIZE, MateriauConstants.TEXTURE_SIZE)

        context.strokeStyle = 'rgba(255, 255, 255, 0.45)'
        context.lineWidth = 6
        for(let index = -4; index < 12; index++)
        {
            const offset = index * 48
            context.beginPath()
            context.moveTo(offset, 0)
            context.lineTo(offset + 180, MateriauConstants.TEXTURE_SIZE)
            context.stroke()
        }
    }

    drawVegetationTexture(context)
    {
        context.fillStyle = '#183821'
        context.fillRect(0, 0, MateriauConstants.TEXTURE_SIZE, MateriauConstants.TEXTURE_SIZE)

        for(let index = 0; index < 140; index++)
        {
            const x = Math.random() * MateriauConstants.TEXTURE_SIZE
            const y = Math.random() * MateriauConstants.TEXTURE_SIZE
            const radius = 10 + Math.random() * 22
            context.fillStyle = MateriauConstants.MATERIAL_TEXTURE_COLORS[index % MateriauConstants.MATERIAL_TEXTURE_COLORS.length]
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
                selectedOffsetY: 0,
                phase: 'idle',
                timer: 0
            })
        }
    }

    getDefinitionByKey(key)
    {
        return MateriauConstants.MATERIAL_DEFINITIONS.find((definition) => definition.key === key) ?? null
    }

    setBuildingEntries()
    {
        this.buildingEntries = []
        this.buildingTransitionBounds = new THREE.Box3()
        let hasBounds = false

        for(const mesh of this.buildingMeshes)
        {
            if(!(mesh instanceof THREE.Mesh))
            {
                continue
            }

            const runtimeMaterials = this.cloneAndSetupMeshMaterials(mesh)
            const meshBounds = new THREE.Box3().setFromObject(mesh)
            if(!meshBounds.isEmpty())
            {
                if(!hasBounds)
                {
                    this.buildingTransitionBounds.copy(meshBounds)
                    hasBounds = true
                }
                else
                {
                    this.buildingTransitionBounds.union(meshBounds)
                }
            }

            for(const material of runtimeMaterials)
            {
                this.setupBuildingTransitionMaterial(material)
            }

            this.buildingEntries.push({
                mesh,
                runtimeMaterials
            })
        }

        if(!hasBounds)
        {
            this.buildingTransitionBounds = null
        }

        this.applyBuildingSelection(null)
    }

    setBuildingEffect()
    {
        this.buildingEffect?.destroy?.()
        this.buildingEffect = new MaterialSwapBurstEffect({
            targets: this.buildingEntries.map((entry) => entry?.mesh).filter(Boolean)
        })
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
                    this.startBuildingTransition(material, {
                        nextTexture: this.whiteTexture,
                        nextColor: MateriauConstants.BUILDING_DEFAULT_COLOR,
                        edgeColor: MateriauConstants.DEFAULT_BUILDING_BURST_COLOR
                    })
                }
                continue
            }

            const texture = this.definitionTextures.get(definition.key) ?? this.whiteTexture
            for(const material of entry.runtimeMaterials)
            {
                this.startBuildingTransition(material, {
                    nextTexture: texture,
                    nextColor: '#ffffff',
                    edgeColor: definition.accentColor
                })
            }
        }
    }

    setupBuildingTransitionMaterial(material)
    {
        if(!material || material.userData?.hasBuildingTransitionPatch)
        {
            return
        }

        const bounds = this.buildingTransitionBounds
        const minY = bounds?.min?.y ?? 0
        const maxY = bounds?.max?.y ?? 1
        const baseColor = new THREE.Color(MateriauConstants.BUILDING_DEFAULT_COLOR)
        const edgeColor = new THREE.Color(MateriauConstants.DEFAULT_BUILDING_BURST_COLOR)
        const transitionState = {
            progress: 1,
            prevTexture: this.whiteTexture,
            nextTexture: this.whiteTexture,
            prevColor: baseColor.clone(),
            nextColor: baseColor.clone(),
            edgeColor: edgeColor.clone()
        }

        material.color?.set?.('#ffffff')
        material.map = null
        material.userData.hasBuildingTransitionPatch = true
        material.userData.buildingTransitionState = transitionState
        material.customProgramCacheKey = () => 'recuperationBuildingTransitionV2'
        material.onBeforeCompile = (shader) =>
        {
            transitionState.shader = shader
            shader.uniforms.uTransitionProgress = { value: transitionState.progress }
            shader.uniforms.uTransitionPrevMap = { value: transitionState.prevTexture }
            shader.uniforms.uTransitionNextMap = { value: transitionState.nextTexture }
            shader.uniforms.uTransitionPrevColor = { value: transitionState.prevColor.clone() }
            shader.uniforms.uTransitionNextColor = { value: transitionState.nextColor.clone() }
            shader.uniforms.uTransitionEdgeColor = { value: transitionState.edgeColor.clone() }
            shader.uniforms.uTransitionMinY = { value: minY }
            shader.uniforms.uTransitionMaxY = { value: maxY }
            shader.uniforms.uTransitionEdgeThickness = { value: MateriauConstants.BUILDING_TRANSITION_EDGE_THICKNESS }

            shader.vertexShader = shader.vertexShader
                .replace(
                    '#include <common>',
                    `#include <common>
                    varying vec3 vTransitionWorldPosition;
                    varying vec2 vTransitionUv;`
                )
                .replace(
                    '#include <begin_vertex>',
                    `#include <begin_vertex>
                    vTransitionUv = uv;
                    vTransitionWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`
                )

            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <common>',
                    `#include <common>
                    varying vec3 vTransitionWorldPosition;
                    varying vec2 vTransitionUv;
                    uniform float uTransitionProgress;
                    uniform float uTransitionMinY;
                    uniform float uTransitionMaxY;
                    uniform float uTransitionEdgeThickness;
                    uniform sampler2D uTransitionPrevMap;
                    uniform sampler2D uTransitionNextMap;
                    uniform vec3 uTransitionPrevColor;
                    uniform vec3 uTransitionNextColor;
                    uniform vec3 uTransitionEdgeColor;`
                )
                .replace(
                    '#include <map_fragment>',
                    `
                    float revealY = mix(
                        uTransitionMinY - uTransitionEdgeThickness,
                        uTransitionMaxY + uTransitionEdgeThickness,
                        uTransitionProgress
                    );
                    float transitionMask = 1.0 - smoothstep(
                        revealY - uTransitionEdgeThickness,
                        revealY + uTransitionEdgeThickness,
                        vTransitionWorldPosition.y
                    );
                    vec4 previousSurface = vec4(uTransitionPrevColor, diffuseColor.a) * texture2D(uTransitionPrevMap, vTransitionUv);
                    vec4 nextSurface = vec4(uTransitionNextColor, diffuseColor.a) * texture2D(uTransitionNextMap, vTransitionUv);
                    diffuseColor = mix(previousSurface, nextSurface, transitionMask);

                    float edgeBand = 1.0 - smoothstep(
                        0.0,
                        uTransitionEdgeThickness * 2.1,
                        abs(vTransitionWorldPosition.y - revealY)
                    );
                    diffuseColor.rgb += uTransitionEdgeColor * edgeBand * 0.22 * (1.0 - step(0.999, uTransitionProgress));
                    `
                )
        }

        material.needsUpdate = true
    }

    startBuildingTransition(material, {
        nextTexture = this.whiteTexture,
        nextColor = '#ffffff',
        edgeColor = MateriauConstants.DEFAULT_BUILDING_BURST_COLOR
    } = {})
    {
        const transitionState = material?.userData?.buildingTransitionState
        if(!transitionState)
        {
            return
        }

        const resolvedNextTexture = nextTexture ?? this.whiteTexture
        const resolvedNextColor = new THREE.Color(nextColor)

        transitionState.prevTexture = transitionState.nextTexture ?? this.whiteTexture
        transitionState.prevColor.copy(transitionState.nextColor ?? resolvedNextColor)
        transitionState.nextTexture = resolvedNextTexture
        transitionState.nextColor.copy(resolvedNextColor)
        transitionState.edgeColor.set(edgeColor)
        transitionState.progress = 0
        material.needsUpdate = true

        this.syncBuildingTransitionShader(material)
    }

    syncBuildingTransitionShader(material)
    {
        const transitionState = material?.userData?.buildingTransitionState
        const shader = transitionState?.shader
        if(!transitionState || !shader?.uniforms)
        {
            return
        }

        shader.uniforms.uTransitionProgress.value = transitionState.progress
        shader.uniforms.uTransitionPrevMap.value = transitionState.prevTexture ?? this.whiteTexture
        shader.uniforms.uTransitionNextMap.value = transitionState.nextTexture ?? this.whiteTexture
        shader.uniforms.uTransitionPrevColor.value.copy(transitionState.prevColor)
        shader.uniforms.uTransitionNextColor.value.copy(transitionState.nextColor)
        shader.uniforms.uTransitionEdgeColor.value.copy(transitionState.edgeColor)
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
                    ? Math.max(baseEmissiveIntensity, MateriauConstants.SELECTED_EMISSIVE_INTENSITY)
                    : Math.max(baseEmissiveIntensity, MateriauConstants.IDLE_EMISSIVE_INTENSITY)
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
        return !Boolean(this.dialogueManager?.isRunning?.()) && !Boolean(this.isInteractionLocked?.())
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
            new THREE.LineBasicMaterial({
                color: MateriauConstants.INDICATOR_LINE_COLOR,
                transparent: true,
                opacity: 0.9,
                depthWrite: false
            })
        )

        this.indicatorDot = new THREE.Mesh(
            new THREE.SphereGeometry(0.022, 12, 12),
            new THREE.MeshBasicMaterial({
                color: MateriauConstants.INDICATOR_RING_COLOR,
                transparent: true,
                opacity: 0.95,
                depthWrite: false
            })
        )

        this.indicatorLabelTexture = this.createIndicatorLabelTexture('')
        this.indicatorLabelSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: this.indicatorLabelTexture,
                transparent: true,
                depthWrite: false
            })
        )
        this.indicatorLabelSprite.scale.set(0.72, 0.18, 1)

        this.indicatorGroup.add(this.indicatorLine)
        this.indicatorGroup.add(this.indicatorDot)
        this.indicatorGroup.add(this.indicatorLabelSprite)
        this.scene.add(this.indicatorGroup)
    }

    createIndicatorLabelTexture(text)
    {
        const canvas = document.createElement('canvas')
        canvas.width = 512
        canvas.height = 128
        const context = canvas.getContext('2d')
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = MateriauConstants.INDICATOR_LABEL_BACKGROUND
        context.strokeStyle = 'rgba(135, 219, 255, 0.62)'
        context.lineWidth = 4
        this.drawRoundedRect(context, 10, 18, 492, 92, 32)
        context.fill()
        context.stroke()
        context.fillStyle = MateriauConstants.INDICATOR_LABEL_TEXT_COLOR
        context.font = '600 40px "Helvetica Neue", Arial, sans-serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(String(text || ''), 256, 66)

        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.needsUpdate = true
        return texture
    }

    drawRoundedRect(context, x, y, width, height, radius)
    {
        context.beginPath()
        context.moveTo(x + radius, y)
        context.lineTo(x + width - radius, y)
        context.quadraticCurveTo(x + width, y, x + width, y + radius)
        context.lineTo(x + width, y + height - radius)
        context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
        context.lineTo(x + radius, y + height)
        context.quadraticCurveTo(x, y + height, x, y + height - radius)
        context.lineTo(x, y + radius)
        context.quadraticCurveTo(x, y, x + radius, y)
        context.closePath()
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
        state.pressOffsetY = -MateriauConstants.BUTTON_PRESS_DEPTH
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
        const previousSelectionKey = this.selectedMaterialKey
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
        this.playSelectionFeedback(previousSelectionKey)

        this.onSelectionChange?.(this.getSelectedMaterial())
    }

    playSelectionFeedback(previousSelectionKey = null)
    {
        if(previousSelectionKey === this.selectedMaterialKey)
        {
            return
        }

        const definition = this.getDefinitionByKey(this.selectedMaterialKey)
        const burstColor = definition?.accentColor ?? MateriauConstants.DEFAULT_BUILDING_BURST_COLOR

        this.experience.sound?.play?.('changeMateriau', {
            force: true,
            volume: 1
        })
        this.buildingEffect?.trigger?.({
            color: burstColor
        })
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

    getHoveredDefinition()
    {
        if(!this.hoveredMesh)
        {
            return null
        }

        const state = this.materialStates.get(this.hoveredMesh.uuid)
        return state?.definition ?? null
    }

    update(deltaMs = this.experience.time.delta)
    {
        const deltaSeconds = Math.max(0.001, Math.min(0.05, (deltaMs || 16.67) * 0.001))

        this.updateMeshes(deltaSeconds)
        this.buildingEffect?.update?.(deltaMs)
        this.ensureCursorElement()

        if(!this.centerRaycaster.hasCamera() || !this.isInteractionActive())
        {
            this.hoveredMesh = null
            this.updateCursor()
            this.updateSceneIndicator()
            return
        }

        this.hoveredMesh = this.getMaterialMeshAtCenter()
        this.updateCursor()
        this.updateSceneIndicator()
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
                state.pressOffsetY = -MateriauConstants.BUTTON_PRESS_DEPTH
            }
            else if(state.phase === 'release')
            {
                state.timer += deltaSeconds
                const progress = Math.min(1, state.timer / MateriauConstants.BUTTON_RELEASE_DURATION)
                state.pressOffsetY = -MateriauConstants.BUTTON_PRESS_DEPTH * (1 - progress)

                if(progress >= 1)
                {
                    state.phase = 'idle'
                    state.timer = 0
                    state.pressOffsetY = 0
                }
            }

            const targetSelectedOffset = state.key === this.selectedMaterialKey
                ? MateriauConstants.SELECTED_PLATE_OFFSET_Y
                : 0
            state.selectedOffsetY = THREE.MathUtils.damp(
                state.selectedOffsetY,
                targetSelectedOffset,
                10,
                deltaSeconds
            )

            state.mesh.position.y = state.baseY + state.pressOffsetY + state.selectedOffsetY
        }

        for(const entry of this.buildingEntries)
        {
            for(const material of entry?.runtimeMaterials ?? [])
            {
                const transitionState = material?.userData?.buildingTransitionState
                if(!transitionState || transitionState.progress >= 1)
                {
                    continue
                }

                transitionState.progress = Math.min(
                    1,
                    transitionState.progress + (deltaSeconds / MateriauConstants.BUILDING_TRANSITION_DURATION)
                )
                this.syncBuildingTransitionShader(material)
            }
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
        document.body.classList.add(MateriauConstants.CURSOR_OWNER_CLASS)
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
        document.body.classList.remove(MateriauConstants.CURSOR_OWNER_CLASS)

        if(this.cursorElement instanceof HTMLElement)
        {
            this.cursorElement.classList.remove('is-visible')
            this.cursorElement.classList.remove('is-over-choice')
        }
    }

    updateSceneIndicator()
    {
        const hoveredDefinition = this.getHoveredDefinition()
        if(!this.hoveredMesh || !hoveredDefinition)
        {
            if(this.indicatorGroup)
            {
                this.indicatorGroup.visible = false
            }
            this.indicatorCurrentKey = null
            return
        }

        if(this.indicatorCurrentKey !== hoveredDefinition.key)
        {
            this.indicatorCurrentKey = hoveredDefinition.key
            const nextTexture = this.createIndicatorLabelTexture(hoveredDefinition.label)
            this.indicatorLabelSprite.material.map?.dispose?.()
            this.indicatorLabelSprite.material.map = nextTexture
            this.indicatorLabelSprite.material.needsUpdate = true
        }

        this.indicatorBounds.setFromObject(this.hoveredMesh)
        if(this.indicatorBounds.isEmpty())
        {
            this.indicatorGroup.visible = false
            return
        }

        this.indicatorBounds.getCenter(this.indicatorCenter)
        this.indicatorBounds.getSize(this.indicatorSize)
        const anchorY = this.indicatorBounds.max.y + 0.04
        const labelY = anchorY + Math.max(0.2, this.indicatorSize.y * 0.28) + 0.08

        this.indicatorLinePoints[0].set(this.indicatorCenter.x, anchorY, this.indicatorCenter.z)
        this.indicatorLinePoints[1].set(this.indicatorCenter.x, labelY - 0.05, this.indicatorCenter.z)
        this.indicatorLineGeometry.setFromPoints(this.indicatorLinePoints)

        this.indicatorDot.position.copy(this.indicatorLinePoints[0])
        this.indicatorLabelSprite.position.set(this.indicatorCenter.x, labelY, this.indicatorCenter.z)
        this.indicatorGroup.visible = true
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
        this.whiteTexture?.dispose?.()
        this.whiteTexture = null
        this.buildingEntries = []
        this.hoveredMesh = null
        this.buildingEffect?.destroy?.()
        this.buildingEffect = null

        if(this.createdCursorElement && this.cursorElement instanceof HTMLElement)
        {
            this.cursorElement.remove()
        }
        if(this.indicatorGroup)
        {
            this.scene.remove(this.indicatorGroup)
            this.indicatorLineGeometry?.dispose?.()
            this.indicatorLine?.material?.dispose?.()
            this.indicatorDot?.geometry?.dispose?.()
            this.indicatorDot?.material?.dispose?.()
            this.indicatorLabelSprite?.material?.map?.dispose?.()
            this.indicatorLabelSprite?.material?.dispose?.()
        }

        this.cursorElement = null
        this.indicatorGroup = null
        this.recuperationModel = null
    }
}
