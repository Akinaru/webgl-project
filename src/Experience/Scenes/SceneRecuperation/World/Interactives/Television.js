import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import CenterScreenRaycaster from '../../../../Utils/CenterScreenRaycaster.js'
import * as TelevisionConstants from './Television.constants.js'
export default class Television
{
    constructor({
        recuperationModel = null,
        debugParentFolder = null,
        isInteractionLocked = null,
        onTestRequest = null,
        onValidateRequest = null
    } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.resources = this.experience.resources
        this.recuperationModel = recuperationModel
        this.debugParentFolder = debugParentFolder
        this.dialogueManager = this.experience.dialogueManager
        this.isInteractionLocked = typeof isInteractionLocked === 'function'
            ? isInteractionLocked
            : null
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
        this.isPoweredOn = false
        this.powerTransition = 0
        this.buttonStates = new Map()
        this.textureCache = new Map()
        this.textureLoader = new THREE.TextureLoader()
        this.areButtonsUnlocked = false
        this.usesStaticScreenTexture = false
        this.televisionLight = null
        this.televisionLightAnchor = null
        this.screenLightRoot = null
        this.screenLightBasePosition = new THREE.Vector3()
        this.settings = {
            screenScaleX: 1.08,
            screenScaleY: 1.08,
            lightDefaultColor: new THREE.Color(TelevisionConstants.TELEVISION_LIGHT_DEFAULT_COLOR),
            lightValidatedColor: new THREE.Color(TelevisionConstants.TELEVISION_LIGHT_VALIDATED_COLOR),
            lightSimulationColor: new THREE.Color(TelevisionConstants.TELEVISION_LIGHT_SIMULATION_COLOR),
            lightIntensity: TelevisionConstants.TELEVISION_LIGHT_INTENSITY,
            lightDistance: TelevisionConstants.TELEVISION_LIGHT_DISTANCE,
            lightHeightOffset: TelevisionConstants.TELEVISION_LIGHT_HEIGHT_OFFSET,
            lightForwardOffset: TelevisionConstants.TELEVISION_LIGHT_FORWARD_OFFSET
        }
        this.lightPower = 0

        this.centerRaycaster = new CenterScreenRaycaster({
            getCamera: () => this.experience.camera?.instance ?? null
        })

        this.setCanvas()
        this.setScreens()
        this.setScreenLight()
        this.setButtons()
        this.setDebug()
        this.setEvents()
        this.renderScreen()
        this.syncButtons()
    }

    setCanvas()
    {
        const waitingTexture = this.resources?.items?.recuperationWaitingScreenTexture ?? null
        if(waitingTexture instanceof THREE.Texture)
        {
            this.texture = waitingTexture
            this.texture.colorSpace = THREE.SRGBColorSpace
            this.texture.flipY = false
            this.texture.minFilter = THREE.LinearFilter
            this.texture.magFilter = THREE.LinearFilter
            this.texture.wrapS = THREE.ClampToEdgeWrapping
            this.texture.wrapT = THREE.ClampToEdgeWrapping
            this.usesStaticScreenTexture = true
            this.applyTextureTransform()
            return
        }

        this.canvas = document.createElement('canvas')
        this.canvas.width = TelevisionConstants.CANVAS_WIDTH
        this.canvas.height = TelevisionConstants.CANVAS_HEIGHT
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

        if(this.usesStaticScreenTexture)
        {
            const sourceWidth = this.texture?.image?.width || this.texture?.source?.data?.width || TelevisionConstants.CANVAS_WIDTH
            const sourceHeight = this.texture?.image?.height || this.texture?.source?.data?.height || TelevisionConstants.CANVAS_HEIGHT
            const sourceAspect = sourceWidth / Math.max(1, sourceHeight)
            const targetAspect = TelevisionConstants.CANVAS_WIDTH / TelevisionConstants.CANVAS_HEIGHT

            let repeatX = 1
            let repeatY = 1

            if(sourceAspect > targetAspect)
            {
                repeatX = targetAspect / sourceAspect
            }
            else
            {
                repeatY = sourceAspect / targetAspect
            }

            repeatX /= scaleX
            repeatY /= scaleY
            this.texture.repeat.set(repeatX, repeatY)
            this.texture.offset.set(
                (1 - repeatX) * 0.5,
                (1 - repeatY) * 0.5
            )
        }
        else
        {
            this.texture.repeat.set(scaleX, -scaleY)
            this.texture.offset.set(
                (1 - scaleX) * 0.5,
                (1 + scaleY) * 0.5
            )
        }

        this.texture.needsUpdate = true
    }

    setScreens()
    {
        const exactContentMeshes = this.recuperationModel?.getMeshesForNameTokens?.(TelevisionConstants.SCREEN_VISIBLE_EXACT_NAME_TOKENS, { exact: true }) ?? []
        const fallbackContentMeshes = this.recuperationModel?.getMeshesForNameTokens?.(TelevisionConstants.SCREEN_VISIBLE_FALLBACK_NAME_TOKENS, { exact: false }) ?? []
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

                runtimeMaterial.color?.set?.('#000000')
                runtimeMaterial.transparent = false
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
                    runtimeMaterial.emissiveIntensity = 0
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

        this.applyPowerEffects()
    }

    setButtons()
    {
        this.leftButton = this.resolveButtonObject(TelevisionConstants.BUTTON_LEFT_EXACT_NAME_TOKENS[0], TelevisionConstants.BUTTON_NAME_TOKENS.test)
        this.rightButton = this.resolveButtonObject(TelevisionConstants.BUTTON_RIGHT_EXACT_NAME_TOKENS[0], TelevisionConstants.BUTTON_NAME_TOKENS.validate)

        this.buttonStates.clear()
        this.registerButton('test', this.leftButton, TelevisionConstants.TEST_BUTTON_COLOR, TelevisionConstants.BUTTON_TEXTURE_BY_KEY.test)
        this.registerButton('validate', this.rightButton, TelevisionConstants.VALIDATE_BUTTON_COLOR, TelevisionConstants.BUTTON_TEXTURE_BY_KEY.validate)
    }

    setScreenLight()
    {
        const screenMesh = this.screenEntries[0]?.mesh ?? null
        if(!(screenMesh instanceof THREE.Mesh))
        {
            return
        }

        this.screenLightRoot = screenMesh.parent instanceof THREE.Object3D
            ? screenMesh.parent
            : screenMesh

        const bounds = new THREE.Box3().setFromObject(screenMesh)
        const center = new THREE.Vector3()
        if(!bounds.isEmpty())
        {
            bounds.getCenter(center)
            this.screenLightRoot.worldToLocal(center)
        }

        this.televisionLightAnchor = new THREE.Object3D()
        this.televisionLightAnchor.position.copy(center)
        this.screenLightBasePosition.copy(center)
        this.televisionLightAnchor.position.y += this.settings.lightHeightOffset
        this.televisionLightAnchor.position.z += this.settings.lightForwardOffset

        this.televisionLight = new THREE.PointLight(
            this.getActiveScreenLightColor(),
            0,
            this.settings.lightDistance
        )
        this.televisionLight.castShadow = false
        this.televisionLightAnchor.add(this.televisionLight)
        this.screenLightRoot.add(this.televisionLightAnchor)
        this.applyScreenLight()
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

        this.debug.addThreeColorBinding(this.debugFolder, this.settings, 'lightDefaultColor', {
            label: 'light color'
        })?.on?.('change', () =>
        {
            this.applyScreenLight()
        })

        this.debug.addThreeColorBinding(this.debugFolder, this.settings, 'lightValidatedColor', {
            label: 'light validated'
        })?.on?.('change', () =>
        {
            this.applyScreenLight()
        })

        this.debug.addThreeColorBinding(this.debugFolder, this.settings, 'lightSimulationColor', {
            label: 'light simulation'
        })?.on?.('change', () =>
        {
            this.applyScreenLight()
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'lightIntensity', {
            label: 'light intensity',
            min: 0,
            max: 8,
            step: 0.01
        })?.on?.('change', () =>
        {
            this.applyScreenLight()
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'lightDistance', {
            label: 'light distance',
            min: 0,
            max: 10,
            step: 0.01
        })?.on?.('change', () =>
        {
            this.applyScreenLight()
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'lightHeightOffset', {
            label: 'light height',
            min: -1,
            max: 1,
            step: 0.01
        })?.on?.('change', () =>
        {
            this.applyScreenLight()
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'lightForwardOffset', {
            label: 'light forward',
            min: -1,
            max: 1,
            step: 0.01
        })?.on?.('change', () =>
        {
            this.applyScreenLight()
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
            state.pressOffsetY = -TelevisionConstants.BUTTON_PRESS_DEPTH
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
        return !this.isButtonsInteractionLocked()
    }

    isButtonsInteractionLocked()
    {
        return Boolean(this.dialogueManager?.isRunning?.()) || Boolean(this.isInteractionLocked?.())
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
        const hit = this.centerRaycaster.intersectFirstHit(this.getInteractiveButtonObjects(), false)
        if(!hit)
        {
            return null
        }

        if(
            Number.isFinite(hit.distance)
            && hit.distance > TelevisionConstants.BUTTON_INTERACTION_MAX_DISTANCE
        )
        {
            return null
        }

        for(const [key, state] of this.buttonStates.entries())
        {
            if(state.object === hit.object || state.meshes?.includes?.(hit.object))
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
        this.applyScreenLight()
        this.renderScreen()
    }

    setTestingState(isTesting)
    {
        this.screenMode = isTesting ? 'testing' : (this.selectedMaterial ? 'selected' : 'idle')
        this.syncButtons()
        this.applyScreenLight()
        this.renderScreen()
    }

    setTestResult(result)
    {
        this.testResult = result ? { ...result } : null
        this.screenMode = result ? 'result' : (this.selectedMaterial ? 'selected' : 'idle')
        this.syncButtons()
        this.applyScreenLight()
        this.renderScreen()
    }

    setValidated(isValidated)
    {
        this.screenMode = isValidated ? 'validated' : (this.selectedMaterial ? 'selected' : 'idle')
        this.syncButtons()
        this.applyScreenLight()
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
        const canUseButtons = this.areButtonsUnlocked && !this.isButtonsInteractionLocked()

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

    async renderScreen()
    {
        const texturePath = this.getScreenTexturePath()
        if(!texturePath)
        {
            return
        }

        let nextTexture = this.textureCache.get(texturePath)
        if(!nextTexture)
        {
            try
            {
                nextTexture = await this.loadTexture(texturePath)
                this.textureCache.set(texturePath, nextTexture)
            }
            catch(error)
            {
                console.error(`[Television] Failed to load texture: ${texturePath}`, error)
                return
            }
        }

        if(this.texture === nextTexture)
        {
            return
        }

        this.texture = nextTexture
        this.applyTextureTransform()

        for(const entry of this.screenEntries)
        {
            const materials = Array.isArray(entry.mesh.material) ? entry.mesh.material : [entry.mesh.material]
            for(const material of materials)
            {
                if(!material) continue
                if('map' in material) material.map = this.texture
                if('emissiveMap' in material) material.emissiveMap = this.texture
                material.needsUpdate = true
            }
        }
    }

    getScreenTexturePath()
    {
        const materialKey = this.selectedMaterial?.key // materiau0, materiau1, materiau2
        const materialSuffixMap = {
            'materiau0': 'carapace',
            'materiau1': 'verre',
            'materiau2': 'vegetation'
        }
        const suffix = materialSuffixMap[materialKey]

        if(this.screenMode === 'testing')
        {
            return 'textures/recuperation/screen/simulation.png'
        }

        if(this.screenMode === 'result' && suffix)
        {
            return `textures/recuperation/screen/res_${suffix}.png`
        }

        if(this.screenMode === 'validated' && suffix)
        {
            return `textures/recuperation/screen/val_${suffix}.png`
        }

        if(this.screenMode === 'selected' && suffix)
        {
            return `textures/recuperation/screen/sel_${suffix}.png`
        }

        return 'textures/recuperation/screen/waiting.png'
    }

    loadTexture(path)
    {
        return new Promise((resolve, reject) =>
        {
            this.textureLoader.load(
                path,
                (texture) =>
                {
                    texture.colorSpace = THREE.SRGBColorSpace
                    texture.flipY = false
                    texture.minFilter = THREE.LinearFilter
                    texture.magFilter = THREE.LinearFilter
                    texture.wrapS = THREE.ClampToEdgeWrapping
                    texture.wrapT = THREE.ClampToEdgeWrapping
                    resolve(texture)
                },
                undefined,
                reject
            )
        })
    }

    drawMaterialHeader(label)
    {
        this.context.fillStyle = TelevisionConstants.TEXT_COLOR
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

    setPowered(isPoweredOn)
    {
        this.isPoweredOn = Boolean(isPoweredOn)
        this.renderScreen()
    }

    applyPowerEffects()
    {
        // On utilise smoothstep pour une transition de luminosité très douce
        const easedPower = THREE.MathUtils.smoothstep(this.powerTransition, 0, 1)
        
        // Un zoom extrêmement léger pour donner vie à l'écran
        const scale = 1.0 - (0.02 * (1.0 - easedPower))
        
        if(this.texture)
        {
            this.texture.repeat.set(1 / (this.settings.screenScaleX * scale), 1 / (this.settings.screenScaleY * scale))
            this.texture.offset.set(
                (1 - (1 / (this.settings.screenScaleX * scale))) * 0.5,
                (1 - (1 / (this.settings.screenScaleY * scale))) * 0.5
            )
        }

        for(const entry of this.screenEntries)
        {
            for(const material of entry.materials)
            {
                if(!material) continue
                
                // On ne touche plus à .opacity (reste à 1)
                // On fait varier la couleur de noir (0,0,0) à blanc (1,1,1)
                // Cela "teinte" la texture de l'image
                material.color.setRGB(easedPower, easedPower, easedPower)
                
                // L'émissivité suit la même courbe pour l'éclat
                material.emissiveIntensity = easedPower * 0.85
                
                // Petit effet de "buzz" électrique aléatoire à l'allumage complet
                if(this.isPoweredOn && easedPower > 0.98)
                {
                    material.emissiveIntensity += (Math.random() - 0.5) * 0.02
                }
            }
        }

        this.applyScreenLight()
    }

    applyScreenLight()
    {
        if(this.televisionLightAnchor)
        {
            this.televisionLightAnchor.position.copy(this.screenLightBasePosition)
            this.televisionLightAnchor.position.y += this.settings.lightHeightOffset
            this.televisionLightAnchor.position.z += this.settings.lightForwardOffset
        }

        if(!(this.televisionLight instanceof THREE.PointLight))
        {
            return
        }

        this.televisionLight.color.copy(this.getActiveScreenLightColor())
        this.televisionLight.distance = this.settings.lightDistance
        this.televisionLight.intensity = this.settings.lightIntensity * this.lightPower
    }

    getActiveScreenLightColor()
    {
        if(this.screenMode === 'validated')
        {
            return this.settings.lightValidatedColor
        }

        if(this.screenMode === 'testing')
        {
            return this.settings.lightSimulationColor
        }

        return this.settings.lightDefaultColor
    }

    update(deltaMs = this.experience.time.delta)
    {
        const deltaSeconds = Math.max(0.001, Math.min(0.05, (deltaMs || 16.67) * 0.001))
        
        // Power transition animation
        const targetPower = this.isPoweredOn ? 1 : 0
        if(Math.abs(this.powerTransition - targetPower) > 0.001)
        {
            this.powerTransition = THREE.MathUtils.damp(this.powerTransition, targetPower, 8, deltaSeconds)
            this.applyPowerEffects()
        }

        const nextLightPower = THREE.MathUtils.damp(
            this.lightPower,
            this.isPoweredOn ? 1 : 0,
            TelevisionConstants.TELEVISION_LIGHT_TRANSITION_SPEED,
            deltaSeconds
        )
        if(Math.abs(nextLightPower - this.lightPower) > 0.0001)
        {
            this.lightPower = Math.abs((this.isPoweredOn ? 1 : 0) - nextLightPower) <= 0.001
                ? (this.isPoweredOn ? 1 : 0)
                : nextLightPower
            this.applyScreenLight()
        }

        this.hoveredButtonKey = this.getButtonKeyAtCenter()

        for(const state of this.buttonStates.values())
        {
            if(!state?.object)
            {
                continue
            }

            if(state.phase === 'hold')
            {
                state.pressOffsetY = -TelevisionConstants.BUTTON_PRESS_DEPTH
            }
            else if(state.phase === 'release')
            {
                state.timer += deltaSeconds
                const progress = Math.min(1, state.timer / TelevisionConstants.BUTTON_RELEASE_DURATION)
                state.pressOffsetY = -TelevisionConstants.BUTTON_PRESS_DEPTH * (1 - progress)
                if(progress >= 1)
                {
                    state.phase = 'idle'
                    state.timer = 0
                    state.pressOffsetY = 0
                }
            }

            const areButtonsAvailable = this.areButtonsUnlocked && !this.isButtonsInteractionLocked()
            const targetLockedOffset = this.areButtonsUnlocked ? 0 : TelevisionConstants.BUTTON_LOCKED_OFFSET_Y
            state.lockedOffsetY = THREE.MathUtils.damp(state.lockedOffsetY, targetLockedOffset, 10, deltaSeconds)
            const targetLift = areButtonsAvailable && state.isEnabled ? TelevisionConstants.BUTTON_ENABLED_LIFT : 0
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
                const displayColor = state.isEnabled ? state.colorHex : TelevisionConstants.DISABLED_BUTTON_COLOR
                material.color?.set?.(hasTexture ? '#ffffff' : displayColor)
                material.opacity = this.areButtonsUnlocked
                    ? (state.isEnabled ? 1 : 0.45)
                    : 0.3
                if(material.emissive)
                {
                    material.emissive.set(hasTexture ? '#ffffff' : displayColor)
                    material.emissiveIntensity = state.isEnabled && areButtonsAvailable
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
        this.screenLightRoot?.remove?.(this.televisionLightAnchor)
        this.televisionLight = null
        this.televisionLightAnchor = null
        this.screenLightRoot = null
        this.screenLightBasePosition.set(0, 0, 0)
        this.screenEntries = []
        this.buttonStates.clear()
        
        // Dispose of all cached textures
        for(const texture of this.textureCache.values())
        {
            texture.dispose()
        }
        this.textureCache.clear()

        if(!this.usesStaticScreenTexture)
        {
            this.texture?.dispose?.()
        }
        this.texture = null
        this.context = null
        this.canvas = null
        this.leftButton = null
        this.rightButton = null
        this.recuperationModel = null
    }
}
