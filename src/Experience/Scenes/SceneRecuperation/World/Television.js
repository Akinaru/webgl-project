import * as THREE from 'three'
import Experience from '../../../Experience.js'
import CenterScreenRaycaster from '../../../Utils/CenterScreenRaycaster.js'
import {
    BACKGROUND_COLOR,
    BODY_COLOR,
    BORDER_COLOR,
    BUTTON_ENABLED_LIFT,
    BUTTON_LEFT_EXACT_NAME_TOKENS,
    BUTTON_LOCKED_OFFSET_Y,
    BUTTON_NAME_TOKENS,
    BUTTON_PRESS_DEPTH,
    BUTTON_RELEASE_DURATION,
    BUTTON_RIGHT_EXACT_NAME_TOKENS,
    BUTTON_TEXTURE_BY_KEY,
    CANVAS_HEIGHT,
    CANVAS_WIDTH,
    DISABLED_BUTTON_COLOR,
    SCREEN_VISIBLE_EXACT_NAME_TOKENS,
    SCREEN_VISIBLE_FALLBACK_NAME_TOKENS,
    TEST_BUTTON_COLOR,
    TEXT_COLOR,
    TITLE_COLOR,
    VALIDATE_BUTTON_COLOR
} from './Television.constants.js'

export default class Television
{
    constructor({
        recuperationModel = null,
        debugParentFolder = null,
        onTestRequest = null,
        onValidateRequest = null
    } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.resources = this.experience.resources
        this.recuperationModel = recuperationModel
        this.debugParentFolder = debugParentFolder
        this.onTestRequest = typeof onTestRequest === 'function' ? onTestRequest : null
        this.onValidateRequest = typeof onValidateRequest === 'function' ? onValidateRequest : null
        this.inputs = this.experience.inputs

        this.screenEntries = []
        this.leftButton = null
        this.rightButton = null
        this.hoveredButtonKey = null
        this.activePressedButtonKey = null
        this.selectedMaterial = null
        this.testResult = null
        this.screenMode = 'idle'
        this.buttonStates = new Map()
        this.areButtonsUnlocked = false
        this.settings = {
            screenScaleX: 1.08,
            screenScaleY: 1.08
        }

        this.centerRaycaster = new CenterScreenRaycaster({
            getCamera: () => this.experience.camera?.instance ?? null
        })

        this.setCanvas()
        this.setScreens()
        this.setButtons()
        this.setDebug()
        this.setEvents()
        this.renderScreen()
        this.syncButtons()
    }

    setCanvas()
    {
        this.canvas = document.createElement('canvas')
        this.canvas.width = CANVAS_WIDTH
        this.canvas.height = CANVAS_HEIGHT
        this.context = this.canvas.getContext('2d')
        this.texture = new THREE.CanvasTexture(this.canvas)
        this.texture.colorSpace = THREE.SRGBColorSpace
        this.texture.wrapS = THREE.RepeatWrapping
        this.texture.wrapT = THREE.RepeatWrapping
        this.texture.minFilter = THREE.LinearFilter
        this.texture.magFilter = THREE.LinearFilter
        this.applyTextureTransform()
    }

    applyTextureTransform()
    {
        if(!this.texture)
        {
            return
        }

        const scaleX = this.settings.screenScaleX
        const scaleY = this.settings.screenScaleY

        this.texture.repeat.set(scaleX, -scaleY)
        this.texture.offset.set(
            (1 - scaleX) * 0.5,
            (1 + scaleY) * 0.5
        )
        this.texture.needsUpdate = true
    }

    setScreens()
    {
        const exactContentMeshes = this.recuperationModel?.getMeshesForNameTokens?.(SCREEN_VISIBLE_EXACT_NAME_TOKENS, { exact: true }) ?? []
        const fallbackContentMeshes = this.recuperationModel?.getMeshesForNameTokens?.(SCREEN_VISIBLE_FALLBACK_NAME_TOKENS, { exact: false }) ?? []
        const screenMeshes = exactContentMeshes.length > 0 ? exactContentMeshes : fallbackContentMeshes

        for(const mesh of screenMeshes)
        {
            if(!(mesh instanceof THREE.Mesh))
            {
                continue
            }

            const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const runtimeMaterials = sourceMaterials.map((material) =>
            {
                const runtimeMaterial = material?.clone?.() ?? material
                if(!runtimeMaterial)
                {
                    return runtimeMaterial
                }

                runtimeMaterial.color?.set?.('#ffffff')
                if('map' in runtimeMaterial)
                {
                    runtimeMaterial.map = this.texture
                }
                if('emissiveMap' in runtimeMaterial)
                {
                    runtimeMaterial.emissiveMap = this.texture
                }
                if(runtimeMaterial.emissive)
                {
                    runtimeMaterial.emissive.set('#ffffff')
                    runtimeMaterial.emissiveIntensity = 0.85
                }
                runtimeMaterial.needsUpdate = true
                return runtimeMaterial
            })

            mesh.material = Array.isArray(mesh.material) ? runtimeMaterials : runtimeMaterials[0]
            this.screenEntries.push({
                mesh,
                materials: runtimeMaterials
            })
        }
    }

    setButtons()
    {
        this.leftButton = this.resolveButtonObject(BUTTON_LEFT_EXACT_NAME_TOKENS[0], BUTTON_NAME_TOKENS.test)
        this.rightButton = this.resolveButtonObject(BUTTON_RIGHT_EXACT_NAME_TOKENS[0], BUTTON_NAME_TOKENS.validate)

        this.buttonStates.clear()
        this.registerButton('test', this.leftButton, TEST_BUTTON_COLOR, BUTTON_TEXTURE_BY_KEY.test)
        this.registerButton('validate', this.rightButton, VALIDATE_BUTTON_COLOR, BUTTON_TEXTURE_BY_KEY.validate)
    }

    resolveButtonObject(exactName = '', fallbackTokens = [])
    {
        const normalizedExactName = typeof exactName === 'string' ? exactName.trim() : ''
        if(normalizedExactName !== '')
        {
            const exactObject = this.recuperationModel?.getFirstObjectForNameTokens?.([normalizedExactName], { exact: true }) ?? null
            if(exactObject instanceof THREE.Object3D)
            {
                return exactObject
            }
        }

        const matches = this.recuperationModel?.getMeshesForNameTokens?.(fallbackTokens, { exact: false }) ?? []
        return matches.find((mesh) => mesh instanceof THREE.Mesh)?.parent ?? null
    }

    registerButton(key, object, colorHex, textureResourceName = '')
    {
        if(!(object instanceof THREE.Object3D))
        {
            return
        }

        const buttonMeshes = this.collectButtonMeshes(object)
        if(buttonMeshes.length === 0)
        {
            return
        }

        const runtimeMaterials = []
        for(const mesh of buttonMeshes)
        {
            const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const nextMaterials = sourceMaterials.map((material) => material?.clone?.() ?? material)
            mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0]
            runtimeMaterials.push(...nextMaterials)
        }
        const texture = this.getButtonTexture(textureResourceName)

        if(texture)
        {
            this.applyButtonTexture(runtimeMaterials, texture)
        }

        this.buttonStates.set(key, {
            key,
            object,
            meshes: buttonMeshes,
            runtimeMaterials,
            texture,
            colorHex,
            baseY: object.position.y,
            lockedOffsetY: 0,
            pressOffsetY: 0,
            enabledLift: 0,
            isEnabled: false,
            phase: 'idle',
            timer: 0
        })
    }

    collectButtonMeshes(object)
    {
        const meshes = []
        object.traverse((child) =>
        {
            if(child instanceof THREE.Mesh)
            {
                meshes.push(child)
            }
        })
        return meshes
    }

    getButtonTexture(resourceName = '')
    {
        const normalizedName = typeof resourceName === 'string' ? resourceName.trim() : ''
        if(normalizedName === '')
        {
            return null
        }

        const texture = this.resources?.items?.[normalizedName] ?? null
        if(!(texture instanceof THREE.Texture))
        {
            return null
        }

        texture.colorSpace = THREE.SRGBColorSpace
        texture.flipY = false
        texture.needsUpdate = true
        return texture
    }

    applyButtonTexture(materials = [], texture = null)
    {
        if(!(texture instanceof THREE.Texture))
        {
            return
        }

        for(const material of materials)
        {
            if(!material)
            {
                continue
            }

            if('map' in material)
            {
                material.map = texture
            }
            if('emissiveMap' in material)
            {
                material.emissiveMap = texture
            }
            material.color?.set?.('#ffffff')
            material.transparent = true
            material.needsUpdate = true
        }
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('Tele', {
            parent: this.debugParentFolder || this.debug.ui,
            expanded: false
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'screenScaleX', {
            label: 'screen scale X',
            min: 1,
            max: 1.3,
            step: 0.001
        }).on('change', () =>
        {
            this.applyTextureTransform()
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'screenScaleY', {
            label: 'screen scale Y',
            min: 1,
            max: 1.3,
            step: 0.001
        }).on('change', () =>
        {
            this.applyTextureTransform()
        })
    }

    setEvents()
    {
        this.onMouseDown = () =>
        {
            if(!this.isInteractionActive())
            {
                return
            }

            const buttonKey = this.getButtonKeyAtCenter()
            if(!buttonKey)
            {
                return
            }

            const state = this.buttonStates.get(buttonKey)
            if(!state?.isEnabled)
            {
                return
            }

            this.activePressedButtonKey = buttonKey
            state.phase = 'hold'
            state.pressOffsetY = -BUTTON_PRESS_DEPTH
            state.timer = 0
        }

        this.onMouseUp = () =>
        {
            const pressedButtonKey = this.activePressedButtonKey
            if(pressedButtonKey)
            {
                const state = this.buttonStates.get(pressedButtonKey)
                if(state)
                {
                    state.phase = 'release'
                    state.timer = 0
                }
            }

            this.activePressedButtonKey = null
            if(!pressedButtonKey || !this.isInteractionActive())
            {
                return
            }

            const hoveredButtonKey = this.getButtonKeyAtCenter()
            if(hoveredButtonKey !== pressedButtonKey)
            {
                return
            }

            if(pressedButtonKey === 'test')
            {
                this.onTestRequest?.()
            }
            else if(pressedButtonKey === 'validate')
            {
                this.onValidateRequest?.()
            }
        }

        this.onWindowBlur = () =>
        {
            this.activePressedButtonKey = null
        }

        this.inputs?.on?.('sceneinteractdown.recuperationTele', this.onMouseDown)
        this.inputs?.on?.('sceneinteractup.recuperationTele', this.onMouseUp)
        this.inputs?.on?.('blur.recuperationTele', this.onWindowBlur)
    }

    isInteractionActive()
    {
        return true
    }

    getInteractiveButtonObjects()
    {
        const objects = []
        for(const state of this.buttonStates.values())
        {
            if(Array.isArray(state?.meshes))
            {
                objects.push(...state.meshes)
            }
        }
        return objects
    }

    getButtonKeyAtCenter()
    {
        const hit = this.centerRaycaster.intersectFirst(this.getInteractiveButtonObjects(), false)
        if(!hit)
        {
            return null
        }

        for(const [key, state] of this.buttonStates.entries())
        {
            if(state.object === hit || state.meshes?.includes?.(hit))
            {
                return key
            }
        }

        return null
    }

    isHoveringInteractive()
    {
        return Boolean(this.hoveredButtonKey)
    }

    setSelection(selection)
    {
        this.selectedMaterial = selection ? { ...selection } : null
        if(this.screenMode === 'idle' || this.screenMode === 'selected' || this.screenMode === 'validated')
        {
            this.screenMode = this.selectedMaterial ? 'selected' : 'idle'
        }
        this.syncButtons()
        this.renderScreen()
    }

    setTestingState(isTesting)
    {
        this.screenMode = isTesting ? 'testing' : (this.selectedMaterial ? 'selected' : 'idle')
        this.syncButtons()
        this.renderScreen()
    }

    setTestResult(result)
    {
        this.testResult = result ? { ...result } : null
        this.screenMode = result ? 'result' : (this.selectedMaterial ? 'selected' : 'idle')
        this.syncButtons()
        this.renderScreen()
    }

    setValidated(isValidated)
    {
        this.screenMode = isValidated ? 'validated' : (this.selectedMaterial ? 'selected' : 'idle')
        this.syncButtons()
        this.renderScreen()
    }

    setButtonsUnlocked(isUnlocked)
    {
        this.areButtonsUnlocked = Boolean(isUnlocked)
        this.syncButtons()
    }

    syncButtons()
    {
        const hasSelection = Boolean(this.selectedMaterial)
        const isTesting = this.screenMode === 'testing'
        const canUseButtons = this.areButtonsUnlocked

        const testState = this.buttonStates.get('test')
        if(testState)
        {
            testState.isEnabled = canUseButtons && hasSelection && !isTesting
        }

        const validateState = this.buttonStates.get('validate')
        if(validateState)
        {
            validateState.isEnabled = canUseButtons && hasSelection && !isTesting
        }
    }

    renderScreen()
    {
        if(!this.context)
        {
            return
        }

        const ctx = this.context
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

        ctx.fillStyle = BACKGROUND_COLOR
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

        ctx.strokeStyle = BORDER_COLOR
        ctx.lineWidth = 10
        

        ctx.fillStyle = TITLE_COLOR
        ctx.font = '600 42px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText('Station de test', 72, 110)

        if(this.screenMode === 'testing' && this.selectedMaterial)
        {
            this.drawMaterialHeader(this.selectedMaterial.label)
            ctx.fillStyle = BODY_COLOR
            ctx.font = '400 36px sans-serif'
            this.drawWrappedText('Test en cours sous la douche. Analyse de la reaction a l eau...', 72, 320, 880, 46)
        }
        else if(this.screenMode === 'result' && this.selectedMaterial && this.testResult)
        {
            this.drawMaterialHeader(this.selectedMaterial.label)
            ctx.fillStyle = BODY_COLOR
            ctx.font = '400 34px sans-serif'
            this.drawWrappedText(this.testResult.summary, 72, 320, 880, 42)
        }
        else if(this.screenMode === 'validated' && this.selectedMaterial)
        {
            this.drawMaterialHeader(this.selectedMaterial.label)
            ctx.fillStyle = BODY_COLOR
            ctx.font = '400 36px sans-serif'
            this.drawWrappedText('Choix valide. La porte est ouverte.', 72, 320, 880, 46)
        }
        else if(this.selectedMaterial)
        {
            this.drawMaterialHeader(this.selectedMaterial.label)
            ctx.fillStyle = BODY_COLOR
            ctx.font = '400 36px sans-serif'
            this.drawWrappedText('Lancez un test avec le bouton gauche, puis validez votre choix avec le bouton droit.', 72, 320, 880, 46)
        }
        else
        {
            ctx.fillStyle = TEXT_COLOR
            ctx.font = '700 62px sans-serif'
            this.drawWrappedText('Aucun materiau', 72, 236, 880, 72)

            ctx.fillStyle = BODY_COLOR
            ctx.font = '400 34px sans-serif'
            this.drawWrappedText('Choisissez un materiau pour afficher ses informations.', 72, 332, 880, 42)
        }

        this.texture.needsUpdate = true
    }

    drawMaterialHeader(label)
    {
        this.context.fillStyle = TEXT_COLOR
        this.context.font = '700 76px sans-serif'
        this.drawWrappedText(label, 72, 236, 880, 88)
    }

    drawWrappedText(text, x, startY, maxWidth, lineHeight)
    {
        const content = String(text || '').trim()
        if(content === '')
        {
            return
        }

        const words = content.split(/\s+/)
        let line = ''
        let y = startY

        for(const word of words)
        {
            const candidate = line === '' ? word : `${line} ${word}`
            const candidateWidth = this.context.measureText(candidate).width
            if(line !== '' && candidateWidth > maxWidth)
            {
                this.context.fillText(line, x, y)
                line = word
                y += lineHeight
                continue
            }

            line = candidate
        }

        if(line !== '')
        {
            this.context.fillText(line, x, y)
        }
    }

    update(deltaMs = this.experience.time.delta)
    {
        const deltaSeconds = Math.max(0.001, Math.min(0.05, (deltaMs || 16.67) * 0.001))
        this.hoveredButtonKey = this.getButtonKeyAtCenter()

        for(const state of this.buttonStates.values())
        {
            if(!state?.object)
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

            const targetLockedOffset = this.areButtonsUnlocked ? 0 : BUTTON_LOCKED_OFFSET_Y
            state.lockedOffsetY = THREE.MathUtils.damp(state.lockedOffsetY, targetLockedOffset, 10, deltaSeconds)
            const targetLift = this.areButtonsUnlocked && state.isEnabled ? BUTTON_ENABLED_LIFT : 0
            state.enabledLift = THREE.MathUtils.damp(state.enabledLift, targetLift, 10, deltaSeconds)
            state.object.position.y = state.baseY + state.lockedOffsetY + state.enabledLift + state.pressOffsetY

            const isHovered = this.hoveredButtonKey === state.key
            for(const material of state.runtimeMaterials)
            {
                if(!material)
                {
                    continue
                }

                const hasTexture = state.texture instanceof THREE.Texture
                const displayColor = state.isEnabled ? state.colorHex : DISABLED_BUTTON_COLOR
                material.color?.set?.(hasTexture ? '#ffffff' : displayColor)
                material.opacity = this.areButtonsUnlocked
                    ? (state.isEnabled ? 1 : 0.45)
                    : 0.3
                if(material.emissive)
                {
                    material.emissive.set(hasTexture ? '#ffffff' : displayColor)
                    material.emissiveIntensity = state.isEnabled && this.areButtonsUnlocked
                        ? (isHovered ? 0.52 : 0.26)
                        : 0.04
                }
                material.needsUpdate = true
            }
        }
    }

    destroy()
    {
        this.inputs?.off?.('sceneinteractdown.recuperationTele')
        this.inputs?.off?.('sceneinteractup.recuperationTele')
        this.inputs?.off?.('blur.recuperationTele')
        this.debugFolder?.dispose?.()
        this.screenEntries = []
        this.buttonStates.clear()
        this.texture?.dispose?.()
        this.texture = null
        this.context = null
        this.canvas = null
        this.leftButton = null
        this.rightButton = null
        this.recuperationModel = null
    }
}
