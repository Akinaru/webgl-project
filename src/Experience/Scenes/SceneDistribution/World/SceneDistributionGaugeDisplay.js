import * as THREE from 'three'
import Experience from '../../../Experience.js'
import { DISTRIBUTION_CHANNEL_ORDER } from './SceneDistributionFlow.constants.js'

const CANVAS_WIDTH = 1024
const CANVAS_HEIGHT = 512
const BACKGROUND_COLOR = '#000000'
const TITLE_COLOR = '#dff2ff'
const SUBTITLE_COLOR = '#7ba7c4'
const TRACK_COLOR = '#163246'
const TRACK_BORDER_COLOR = '#29506a'
const TARGET_ZONE_COLOR = '#1d5d46'
const TARGET_ZONE_BORDER_COLOR = '#41c07f'
const FILL_COLOR = '#51b4ff'
const FILL_WARNING_COLOR = '#ffb85c'
const FILL_SOLVED_COLOR = '#4fd58a'
const LABEL_COLOR = '#d2e4f3'
const WARNING_COLOR = '#ffcc70'
const SOLVED_COLOR = '#8af0b0'
const CHIP_BG_COLOR = '#102534'
const CHIP_TEXT_COLOR = '#dcefff'

export default class SceneDistributionGaugeDisplay
{
    constructor({
        distributionModel = null,
        debugParentFolder = null
    } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.distributionModel = distributionModel
        this.debugParentFolder = debugParentFolder
        this.settings = {
            screenScaleX: 1.072,
            screenScaleY: 1.01,
            fitMode: 'contain'
        }
        this.state = {
            isSolved: false,
            channels: []
        }
        this.screenEntries = []

        this.setCanvas()
        this.setScreens()
        this.setDebug()
        this.render()
    }

    setCanvas()
    {
        this.canvas = document.createElement('canvas')
        this.canvas.width = CANVAS_WIDTH
        this.canvas.height = CANVAS_HEIGHT
        this.context = this.canvas.getContext('2d')
        this.texture = new THREE.CanvasTexture(this.canvas)
        this.texture.colorSpace = THREE.SRGBColorSpace
        this.texture.minFilter = THREE.LinearFilter
        this.texture.magFilter = THREE.LinearFilter
        this.texture.generateMipmaps = false
        this.texture.wrapS = THREE.ClampToEdgeWrapping
        this.texture.wrapT = THREE.ClampToEdgeWrapping
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

    autoFitToScreen()
    {
        const primaryEntry = this.screenEntries[0] ?? null
        const mesh = primaryEntry?.mesh ?? null
        if(!(mesh instanceof THREE.Mesh))
        {
            return
        }

        const bounds = new THREE.Box3().setFromObject(mesh)
        const size = bounds.getSize(new THREE.Vector3())
        const meshAspect = size.x > 1e-6 && size.y > 1e-6
            ? size.x / size.y
            : 1
        const textureAspect = CANVAS_WIDTH / CANVAS_HEIGHT

        let scaleX = 1
        let scaleY = 1

        if(this.settings.fitMode === 'cover')
        {
            if(meshAspect > textureAspect)
            {
                scaleX = meshAspect / textureAspect
            }
            else
            {
                scaleY = textureAspect / meshAspect
            }
        }
        else
        {
            if(meshAspect > textureAspect)
            {
                scaleY = textureAspect / meshAspect
            }
            else
            {
                scaleX = meshAspect / textureAspect
            }
        }

        this.settings.screenScaleX = scaleX
        this.settings.screenScaleY = scaleY
        this.applyTextureTransform()
    }

    setScreens()
    {
        const screenMeshes = this.distributionModel?.getMeshesForNameTokens?.(['screen-gris-foncé'], { exact: true }) ?? []
        const primaryScreen = this.resolvePrimaryScreenMesh(screenMeshes)
        if(!(primaryScreen instanceof THREE.Mesh))
        {
            return
        }

        const sourceMaterials = Array.isArray(primaryScreen.material) ? primaryScreen.material : [primaryScreen.material]
        const runtimeMaterials = sourceMaterials.map((material) =>
        {
            const runtimeMaterial = material?.clone?.() ?? material
            if(!runtimeMaterial)
            {
                return runtimeMaterial
            }

            runtimeMaterial.color?.set?.('#ffffff')
            runtimeMaterial.transparent = true
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
                runtimeMaterial.emissiveIntensity = 0.9
            }
            runtimeMaterial.needsUpdate = true
            return runtimeMaterial
        })

        primaryScreen.material = Array.isArray(primaryScreen.material) ? runtimeMaterials : runtimeMaterials[0]
        this.screenEntries.push({
            mesh: primaryScreen,
            materials: runtimeMaterials
        })
        this.autoFitToScreen()
    }

    resolvePrimaryScreenMesh(screenMeshes = [])
    {
        const worldBounds = new THREE.Box3()
        const worldSize = new THREE.Vector3()
        let bestMesh = null
        let bestArea = -Infinity

        for(const mesh of screenMeshes)
        {
            if(!(mesh instanceof THREE.Mesh))
            {
                continue
            }

            worldBounds.setFromObject(mesh)
            worldBounds.getSize(worldSize)
            const area = worldSize.x * worldSize.y
            if(area <= bestArea)
            {
                continue
            }

            bestArea = area
            bestMesh = mesh
        }

        return bestMesh
    }

    setState(nextState = {})
    {
        const safeState = nextState && typeof nextState === 'object' ? nextState : {}
        const channelByToken = new Map((safeState.channels ?? []).map((channel) => [channel.token, channel]))
        this.state = {
            isSolved: Boolean(safeState.isSolved),
            channels: DISTRIBUTION_CHANNEL_ORDER.map((token) => ({
                token,
                label: channelByToken.get(token)?.label ?? token,
                normalizedFill: channelByToken.get(token)?.normalizedFill ?? 0,
                targetWindow: channelByToken.get(token)?.targetWindow ?? { min: 0, max: 0 },
                isInGreenZone: Boolean(channelByToken.get(token)?.isInGreenZone),
                status: channelByToken.get(token)?.status ?? 'probleme'
            }))
        }
        this.render()
    }

    render()
    {
        if(!this.context)
        {
            return
        }

        const { context } = this
        context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
        context.fillStyle = BACKGROUND_COLOR
        context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

        context.fillStyle = TITLE_COLOR
        context.font = '700 44px sans-serif'
        context.fillText('Stabilisation du reseau', 84, 102)

        context.fillStyle = SUBTITLE_COLOR
        context.font = '500 22px sans-serif'
        context.fillText('Ajuste les vannes jusqu a avoir 3 voyants verts.', 84, 140)

        this.renderGauges()
        this.renderFooter()

        this.texture.needsUpdate = true
    }

    renderGauges()
    {
        const gaugeX = 230
        const gaugeWidth = 610
        const gaugeHeight = 30
        const topY = 190
        const rowGap = 88

        for(let index = 0; index < this.state.channels.length; index++)
        {
            const channel = this.state.channels[index]
            const y = topY + index * rowGap
            const fillWidth = gaugeWidth * THREE.MathUtils.clamp(channel.normalizedFill, 0, 1)
            const targetZoneStart = gaugeX + gaugeWidth * THREE.MathUtils.clamp(channel.targetWindow?.min ?? 0, 0, 1)
            const targetZoneWidth = gaugeWidth * Math.max(0, (channel.targetWindow?.max ?? 0) - (channel.targetWindow?.min ?? 0))
            const fillColor = this.state.isSolved
                ? FILL_SOLVED_COLOR
                : (channel.isInGreenZone ? FILL_COLOR : FILL_WARNING_COLOR)

            this.context.fillStyle = LABEL_COLOR
            this.context.font = '700 27px sans-serif'
            this.context.textAlign = 'start'
            this.context.fillText(channel.label, 90, y + 24)

            this.context.fillStyle = TRACK_COLOR
            this.context.strokeStyle = TRACK_BORDER_COLOR
            this.context.lineWidth = 3
            this.roundRect(this.context, gaugeX, y, gaugeWidth, gaugeHeight, 16)
            this.context.fill()
            this.context.stroke()

            this.context.fillStyle = TARGET_ZONE_COLOR
            this.context.strokeStyle = TARGET_ZONE_BORDER_COLOR
            this.context.lineWidth = 2
            this.roundRect(
                this.context,
                targetZoneStart,
                y + 4,
                targetZoneWidth,
                gaugeHeight - 8,
                10
            )
            this.context.fill()
            this.context.stroke()

            this.context.fillStyle = fillColor
            this.roundRect(
                this.context,
                gaugeX + 4,
                y + 4,
                Math.max(18, fillWidth - 8),
                gaugeHeight - 8,
                10
            )
            this.context.fill()

            this.renderStatusChip({
                x: 865,
                y: y - 6,
                text: channel.status,
                isActive: channel.isInGreenZone
            })
        }
    }

    renderStatusChip({
        x = 0,
        y = 0,
        text = '',
        isActive = false
    } = {})
    {
        const width = 110
        const height = 42

        this.context.fillStyle = isActive ? TARGET_ZONE_BORDER_COLOR : CHIP_BG_COLOR
        this.roundRect(this.context, x, y, width, height, 14)
        this.context.fill()

        this.context.fillStyle = isActive ? '#052012' : CHIP_TEXT_COLOR
        this.context.font = '700 22px sans-serif'
        this.context.textAlign = 'center'
        this.context.fillText(text.toUpperCase(), x + width * 0.5, y + 28)
        this.context.textAlign = 'start'
    }

    renderFooter()
    {
        const message = this.state.isSolved
            ? 'Reseau stabilise. Les portes de sortie sont ouvertes.'
            : 'Place les 3 niveaux dans la zone verte pour stabiliser la pression.'
        const messageColor = this.state.isSolved ? SOLVED_COLOR : WARNING_COLOR

        this.context.fillStyle = messageColor
        this.context.font = '600 24px sans-serif'
        this.context.fillText(message, 84, 432)
    }

    roundRect(context, x, y, width, height, radius)
    {
        const safeWidth = Math.max(0, width)
        const safeHeight = Math.max(0, height)
        const clampedRadius = Math.min(radius, safeWidth * 0.5, safeHeight * 0.5)
        context.beginPath()
        context.moveTo(x + clampedRadius, y)
        context.arcTo(x + safeWidth, y, x + safeWidth, y + safeHeight, clampedRadius)
        context.arcTo(x + safeWidth, y + safeHeight, x, y + safeHeight, clampedRadius)
        context.arcTo(x, y + safeHeight, x, y, clampedRadius)
        context.arcTo(x, y, x + safeWidth, y, clampedRadius)
        context.closePath()
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('Distribution screen', {
            parent: this.debugParentFolder || this.debug.ui,
            expanded: false
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'screenScaleX', {
            label: 'screen scale X',
            min: 1,
            max: 1.2,
            step: 0.001
        }).on('change', () =>
        {
            this.applyTextureTransform()
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'screenScaleY', {
            label: 'screen scale Y',
            min: 0.2,
            max: 2,
            step: 0.001
        }).on('change', () =>
        {
            this.applyTextureTransform()
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'fitMode', {
            label: 'fit mode',
            options: {
                contain: 'contain',
                cover: 'cover'
            }
        })

        this.debug.addButton(this.debugFolder, {
            title: 'Auto-fit screen',
            onClick: () =>
            {
                this.autoFitToScreen()
            }
        })
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugFolder = null
        this.screenEntries = []
        this.distributionModel = null
        this.canvas = null
        this.context = null
        this.texture?.dispose?.()
        this.texture = null
    }
}
