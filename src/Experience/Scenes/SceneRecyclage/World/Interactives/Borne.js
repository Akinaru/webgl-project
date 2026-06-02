import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import CenterScreenRaycaster from '../../../../Utils/CenterScreenRaycaster.js'
import * as BorneConstants from './Borne.constants.js'
import * as MateriauConstants from '../../../SceneRecuperation/World/Interactives/Materiau.constants.js'

const DEBUG_FOLDER_TITLE = 'Borne'

export default class Borne
{
    constructor({ world = null, onActivate = null, debugParentFolder = null } = {})
    {
        this.experience = new Experience()
        this.world = world
        this.onActivate = typeof onActivate === 'function' ? onActivate : null
        this.debug = this.experience.debug
        this.debugParentFolder = debugParentFolder
        this.inputs = this.experience.inputs
        this.enabled = false
        this.screenAwake = true
        this.borneRoot = null
        this.borneMesh = null
        this.screenMesh = null
        this.hoveredMesh = null
        this.cursorElement = null
        this.createdCursorElement = false
        this.ownsCursor = false
        this.centerScreen = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5)
        this.screenOriginalMaterial = null
        this.screenMaterial = null
        this.screenOverlay = null
        this.screenOverlayMaterial = null
        this.screenOverlayGeometry = null
        this.screenColor = new THREE.Color(BorneConstants.BORNE_SCREEN_AWAKE_COLOR)
        this.screenOnColor = new THREE.Color(BorneConstants.BORNE_SCREEN_ON_COLOR)
        this.centerRaycaster = new CenterScreenRaycaster({
            getCamera: () => this.experience.camera?.instance ?? null
        })
        this.debugState = {
            rootFound: false,
            borneFound: false,
            screenFound: false,
            rootName: 'introuvable',
            borneName: 'introuvable',
            screenName: 'introuvable',
            enabled: false,
            screenAwake: true,
            forceOverlayVisible: true,
            overlayX: BorneConstants.BORNE_SCREEN_OVERLAY_DEFAULTS.x,
            overlayY: BorneConstants.BORNE_SCREEN_OVERLAY_DEFAULTS.y,
            overlayZ: BorneConstants.BORNE_SCREEN_OVERLAY_DEFAULTS.z,
            overlayRotationZ: BorneConstants.BORNE_SCREEN_OVERLAY_DEFAULTS.rotationZ,
            overlayScaleX: BorneConstants.BORNE_SCREEN_OVERLAY_DEFAULTS.scaleX,
            overlayScaleY: BorneConstants.BORNE_SCREEN_OVERLAY_DEFAULTS.scaleY,
            rootX: 0,
            rootY: 0,
            rootZ: 0,
            screenX: 0,
            screenY: 0,
            screenZ: 0
        }

        this.indicatorLinePoints = [new THREE.Vector3(), new THREE.Vector3()]
        this.indicatorBounds = new THREE.Box3()
        this.indicatorCenter = new THREE.Vector3()
        this.indicatorSize = new THREE.Vector3()

        this.findScreenMesh()
        this.createIndicator()
        this.bindEvents()
        this.setDebug()
    }

    findScreenMesh()
    {
        const root = this.world?.recyclageModel?.model ?? null
        if(!root)
        {
            return
        }

        root.traverse((child) =>
        {
            if(this.borneRoot || !(child instanceof THREE.Object3D))
            {
                return
            }

            const normalizedName = String(child.name || '').trim().toLowerCase()
            if(normalizedName === BorneConstants.BORNE_ROOT_NAME)
            {
                this.borneRoot = child
            }
        })

        this.debugState.rootFound = Boolean(this.borneRoot)
        this.debugState.rootName = this.borneRoot?.name ?? 'introuvable'

        this.borneRoot?.traverse((child) =>
        {
            if(!(child instanceof THREE.Object3D))
            {
                return
            }

            const normalizedName = String(child.name || '').trim().toLowerCase()
            if(!this.borneMesh && normalizedName === BorneConstants.BORNE_MESH_NAME)
            {
                this.borneMesh = child
            }
        })

        this.debugState.borneFound = Boolean(this.borneMesh)
        this.debugState.borneName = this.borneMesh?.name ?? 'introuvable'

        const screenSearchRoot = this.borneMesh ?? this.borneRoot
        screenSearchRoot?.traverse((child) =>
        {
            if(this.screenMesh || !(child instanceof THREE.Mesh))
            {
                return
            }

            const normalizedName = String(child.name || '').trim().toLowerCase()
            if(normalizedName === BorneConstants.BORNE_SCREEN_NAME)
            {
                this.screenMesh = child
            }
        })

        this.debugState.screenFound = Boolean(this.screenMesh)
        this.debugState.screenName = this.screenMesh?.name ?? 'introuvable'
        this.syncDebugTransformState()

        this.setupScreenMaterials()
    }

    setupScreenMaterials()
    {
        if(!(this.screenMesh instanceof THREE.Mesh))
        {
            return
        }

        this.screenOriginalMaterial = this.screenMesh.material
        this.screenMaterial = new THREE.MeshBasicMaterial({
            color: BorneConstants.BORNE_SCREEN_OFF_COLOR,
            side: THREE.DoubleSide,
            toneMapped: false
        })
        this.screenMesh.material = this.screenMaterial
        this.screenMesh.renderOrder = 18
        this.createScreenOverlay()
        this.applyScreenState(0)
    }

    createScreenOverlay()
    {
        this.screenOverlayGeometry = new THREE.PlaneGeometry(1, 1)
        this.screenOverlayMaterial = new THREE.MeshBasicMaterial({
            color: BorneConstants.BORNE_SCREEN_AWAKE_COLOR,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.92,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        })
        this.screenOverlay = new THREE.Mesh(this.screenOverlayGeometry, this.screenOverlayMaterial)
        this.screenOverlay.name = 'BorneScreenDebugOverlay'
        this.screenOverlay.renderOrder = 999
        this.screenMesh.add(this.screenOverlay)
        this.applyOverlayTransform()
    }

    createIndicator()
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

        this.indicatorLabelTexture = this.createIndicatorLabelTexture(BorneConstants.BORNE_INDICATOR_LABEL)
        this.indicatorLabelSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: this.indicatorLabelTexture,
                transparent: true,
                depthWrite: false
            })
        )
        this.indicatorLabelSprite.scale.set(1.1, 0.2, 1)

        this.indicatorGroup.add(this.indicatorLine)
        this.indicatorGroup.add(this.indicatorDot)
        this.indicatorGroup.add(this.indicatorLabelSprite)
        this.experience.scene.add(this.indicatorGroup)
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
        context.font = '600 36px "Helvetica Neue", Arial, sans-serif'
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

    bindEvents()
    {
        this.onInteractDown = () =>
        {
            if(!this.enabled || !this.screenMesh)
            {
                return
            }

            const hit = this.centerRaycaster.intersectFirstHit([this.screenMesh], false)
            if(!hit?.object || !Number.isFinite(hit.distance) || hit.distance > BorneConstants.BORNE_MAX_INTERACTION_DISTANCE)
            {
                return
            }

            this.onActivate?.()
        }

        this.onWindowResize = () =>
        {
            this.centerScreen.set(window.innerWidth * 0.5, window.innerHeight * 0.5)
            this.syncCursor()
        }

        this.inputs?.on?.('sceneinteractdown.recyclageBorne', this.onInteractDown)
        window.addEventListener('resize', this.onWindowResize)
    }

    setEnabled(isEnabled = true)
    {
        this.enabled = isEnabled === true
        this.debugState.enabled = this.enabled
        if(this.enabled === true)
        {
            this.screenAwake = true
            this.debugState.screenAwake = true
            this.ensureCursorElement()
            this.syncCursor()
            this.showCursor()
            this.applyScreenState(performance.now())
            return
        }

        this.hideCursor()
        this.applyScreenState(performance.now())
        if(this.enabled !== true)
        {
            this.hideIndicator()
        }
    }

    setScreenAwake(isAwake = true)
    {
        this.screenAwake = isAwake === true
        this.debugState.screenAwake = this.screenAwake
        this.applyScreenState(performance.now())
    }

    ensureCursorElement()
    {
        this.cursorElement = this.cursorElement || document.querySelector('.dialogue__cursor')
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

    syncCursor()
    {
        if(!(this.cursorElement instanceof HTMLElement))
        {
            return
        }

        this.cursorElement.style.left = `${this.centerScreen.x}px`
        this.cursorElement.style.top = `${this.centerScreen.y}px`
        this.cursorElement.style.setProperty('--cursor-offset-x', `${BorneConstants.BORNE_CURSOR_X_OFFSET}px`)
        this.cursorElement.style.setProperty('--cursor-offset-y', `${BorneConstants.BORNE_CURSOR_Y_OFFSET}px`)
    }

    showCursor()
    {
        if(!(this.cursorElement instanceof HTMLElement))
        {
            return
        }

        this.ownsCursor = true
        document.body.classList.add(MateriauConstants.CURSOR_OWNER_CLASS)
        this.cursorElement.classList.add('is-visible')
    }

    hideCursor()
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

    applyScreenState(elapsedMs = 0)
    {
        const isOn = this.enabled === true
        const isAwake = this.screenAwake === true || isOn
        const pulse = isOn
            ? 0.72 + ((Math.sin((elapsedMs * 0.001) * BorneConstants.BORNE_SCREEN_PULSE_SPEED) + 1) * 0.14)
            : 1
        const screenColor = isOn
            ? this.screenOnColor
            : (isAwake ? this.screenColor : BorneConstants.BORNE_SCREEN_OFF_COLOR)
        const screenIntensity = isOn
            ? pulse
            : (isAwake ? 0.78 : 1)

        if(this.screenMaterial?.color)
        {
            this.screenMaterial.color.set(screenColor).multiplyScalar(screenIntensity)
            this.screenMaterial.needsUpdate = true
        }

        if(this.screenOverlayMaterial?.color)
        {
            this.screenOverlayMaterial.color.set(screenColor).multiplyScalar(screenIntensity)
            this.screenOverlayMaterial.opacity = isAwake ? 0.96 : 0
            this.screenOverlayMaterial.needsUpdate = true
        }

        if(this.screenOverlay)
        {
            this.screenOverlay.visible = this.debugState.forceOverlayVisible === true && isAwake
        }
    }

    applyOverlayTransform()
    {
        if(!this.screenOverlay)
        {
            return
        }

        this.screenOverlay.position.set(
            this.debugState.overlayX,
            this.debugState.overlayY,
            this.debugState.overlayZ
        )
        this.screenOverlay.rotation.set(0, 0, this.debugState.overlayRotationZ)
        this.screenOverlay.scale.set(
            this.debugState.overlayScaleX,
            this.debugState.overlayScaleY,
            1
        )
    }

    syncDebugTransformState()
    {
        if(this.borneRoot)
        {
            this.debugState.rootX = this.borneRoot.position.x
            this.debugState.rootY = this.borneRoot.position.y
            this.debugState.rootZ = this.borneRoot.position.z
        }

        if(this.screenMesh)
        {
            this.debugState.screenX = this.screenMesh.position.x
            this.debugState.screenY = this.screenMesh.position.y
            this.debugState.screenZ = this.screenMesh.position.z
        }
    }

    applyDebugRootTransform()
    {
        this.borneRoot?.position?.set?.(
            this.debugState.rootX,
            this.debugState.rootY,
            this.debugState.rootZ
        )
    }

    applyDebugScreenTransform()
    {
        this.screenMesh?.position?.set?.(
            this.debugState.screenX,
            this.debugState.screenY,
            this.debugState.screenZ
        )
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled || !this.debugParentFolder)
        {
            return
        }

        this.debugFolder = this.debug.addFolder(DEBUG_FOLDER_TITLE, {
            parent: this.debugParentFolder,
            expanded: true
        })

        this.debug.addManualBinding(this.debugFolder, this.debugState, 'rootFound', {
            label: 'Int_dome trouve',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'borneFound', {
            label: 'Borne trouvee',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'screenFound', {
            label: 'Ecran trouve',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'rootName', {
            label: 'Nom Int_dome',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'borneName', {
            label: 'Nom borne',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugFolder, this.debugState, 'screenName', {
            label: 'Nom ecran',
            readonly: true
        }, 'auto')

        this.debug.addBinding(this.debugFolder, this.debugState, 'enabled', { label: 'Cliquable' })
            ?.on?.('change', (event) => this.setEnabled(event.value))
        this.debug.addBinding(this.debugFolder, this.debugState, 'screenAwake', { label: 'Ecran bleu' })
            ?.on?.('change', (event) => this.setScreenAwake(event.value))
        this.debug.addBinding(this.debugFolder, this.debugState, 'forceOverlayVisible', { label: 'Overlay visible' })
            ?.on?.('change', () => this.applyScreenState(performance.now()))

        this.debug.addColorBinding(this.debugFolder, this, 'screenColor', { label: 'Bleu dialogue' })
            ?.on?.('change', () =>
            {
                this.applyScreenState(performance.now())
            })

        this.setDebugTransformBindings()
    }

    setDebugTransformBindings()
    {
        const rootFolder = this.debug.addFolder('Position borne', {
            parent: this.debugFolder,
            expanded: false
        })
        for(const key of ['rootX', 'rootY', 'rootZ'])
        {
            this.debug.addBinding(rootFolder, this.debugState, key, {
                label: key,
                min: -20,
                max: 20,
                step: 0.01
            })?.on?.('change', () => this.applyDebugRootTransform())
        }

        const screenFolder = this.debug.addFolder('Position ecran', {
            parent: this.debugFolder,
            expanded: false
        })
        for(const key of ['screenX', 'screenY', 'screenZ'])
        {
            this.debug.addBinding(screenFolder, this.debugState, key, {
                label: key,
                min: -2,
                max: 2,
                step: 0.001
            })?.on?.('change', () => this.applyDebugScreenTransform())
        }

        const overlayFolder = this.debug.addFolder('Overlay bleu', {
            parent: this.debugFolder,
            expanded: true
        })
        for(const key of ['overlayX', 'overlayY', 'overlayZ'])
        {
            this.debug.addBinding(overlayFolder, this.debugState, key, {
                label: key,
                min: -1,
                max: 1,
                step: 0.001
            })?.on?.('change', () => this.applyOverlayTransform())
        }
        this.debug.addBinding(overlayFolder, this.debugState, 'overlayRotationZ', {
            label: 'rotationZ',
            min: -Math.PI,
            max: Math.PI,
            step: 0.001
        })?.on?.('change', () => this.applyOverlayTransform())
        for(const key of ['overlayScaleX', 'overlayScaleY'])
        {
            this.debug.addBinding(overlayFolder, this.debugState, key, {
                label: key,
                min: 0.01,
                max: 2,
                step: 0.001
            })?.on?.('change', () => this.applyOverlayTransform())
        }
    }

    update(delta = this.experience?.time?.delta ?? 0)
    {
        this.syncCursor()
        this.applyScreenState(performance.now())

        if(this.enabled !== true || !this.screenMesh || !this.centerRaycaster.hasCamera())
        {
            this.hoveredMesh = null
            if(this.cursorElement instanceof HTMLElement)
            {
                this.cursorElement.classList.remove('is-over-choice')
            }
            this.hideIndicator()
            return
        }

        this.hoveredMesh = this.centerRaycaster.intersectFirst([this.screenMesh], false) ? this.screenMesh : null
        if(this.cursorElement instanceof HTMLElement)
        {
            this.cursorElement.classList.toggle('is-over-choice', Boolean(this.hoveredMesh))
        }
        if(!this.hoveredMesh)
        {
            this.hideIndicator()
            return
        }

        this.indicatorBounds.setFromObject(this.hoveredMesh)
        if(this.indicatorBounds.isEmpty())
        {
            this.hideIndicator()
            return
        }

        this.indicatorBounds.getCenter(this.indicatorCenter)
        this.indicatorBounds.getSize(this.indicatorSize)
        const anchorY = this.indicatorBounds.max.y + 0.04
        const labelY = anchorY + Math.max(0.18, this.indicatorSize.y * 0.65) + 0.08

        this.indicatorLinePoints[0].set(this.indicatorCenter.x, anchorY, this.indicatorCenter.z)
        this.indicatorLinePoints[1].set(this.indicatorCenter.x, labelY - 0.05, this.indicatorCenter.z)
        this.indicatorLineGeometry.setFromPoints(this.indicatorLinePoints)
        this.indicatorDot.position.copy(this.indicatorLinePoints[0])
        this.indicatorLabelSprite.position.set(this.indicatorCenter.x, labelY, this.indicatorCenter.z)
        this.indicatorGroup.visible = true
    }

    hideIndicator()
    {
        if(this.indicatorGroup)
        {
            this.indicatorGroup.visible = false
        }
    }

    destroy()
    {
        this.inputs?.off?.('sceneinteractdown.recyclageBorne')
        window.removeEventListener('resize', this.onWindowResize)
        this.hideIndicator()
        this.hideCursor()

        if(this.indicatorGroup)
        {
            this.experience.scene.remove(this.indicatorGroup)
            this.indicatorLineGeometry?.dispose?.()
            this.indicatorLine?.material?.dispose?.()
            this.indicatorDot?.geometry?.dispose?.()
            this.indicatorDot?.material?.dispose?.()
            this.indicatorLabelSprite?.material?.map?.dispose?.()
            this.indicatorLabelSprite?.material?.dispose?.()
        }

        if(this.createdCursorElement && this.cursorElement instanceof HTMLElement)
        {
            this.cursorElement.remove()
        }

        if(this.screenMesh && this.screenOriginalMaterial)
        {
            this.screenMesh.material = this.screenOriginalMaterial
        }

        this.screenMaterial?.dispose?.()
        this.screenOverlayGeometry?.dispose?.()
        this.screenOverlayMaterial?.dispose?.()
        this.debugFolder?.dispose?.()
        this.indicatorGroup = null
        this.screenMesh = null
        this.hoveredMesh = null
        this.cursorElement = null
        this.screenOriginalMaterial = null
        this.screenMaterial = null
        this.screenOverlay = null
        this.screenOverlayGeometry = null
        this.screenOverlayMaterial = null
        this.debugFolder = null
    }
}
