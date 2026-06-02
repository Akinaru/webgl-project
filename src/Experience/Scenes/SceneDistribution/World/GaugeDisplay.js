import * as THREE from 'three'
import Experience from '../../../Experience.js'
import * as SceneDistributionGaugeDisplayConstants from './GaugeDisplay.constants.js'

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
            totalUsagePercent: 0,
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
        this.canvas.width = SceneDistributionGaugeDisplayConstants.CANVAS_WIDTH
        this.canvas.height = SceneDistributionGaugeDisplayConstants.CANVAS_HEIGHT
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
        const textureAspect = SceneDistributionGaugeDisplayConstants.CANVAS_WIDTH / SceneDistributionGaugeDisplayConstants.CANVAS_HEIGHT

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
        const screenMeshes = this.distributionModel?.getMeshesForNameTokens?.(SceneDistributionGaugeDisplayConstants.SCREEN_GRIS_FONCE_NAME_TOKENS, { exact: true }) ?? []
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
        this.state = {
            isSolved: Boolean(nextState.isSolved),
            totalUsageRatio: Number(nextState.totalUsageRatio) || 0,
            totalUsagePercent: Number(nextState.totalUsagePercent) || Math.max(0, Math.round((Number(nextState.totalUsageRatio) || 0) * 100)),
            isOverLimit: Boolean(nextState.isOverLimit),
            channels: (nextState.channels || []).map((channel) => ({
                token: channel.token,
                label: channel.config?.label ?? channel.token,
                normalizedFill: channel.normalizedFill ?? 0,
                currentLevel: channel.currentLevel
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
        context.clearRect(0, 0, SceneDistributionGaugeDisplayConstants.CANVAS_WIDTH, SceneDistributionGaugeDisplayConstants.CANVAS_HEIGHT)
        context.fillStyle = SceneDistributionGaugeDisplayConstants.BACKGROUND_COLOR
        context.fillRect(0, 0, SceneDistributionGaugeDisplayConstants.CANVAS_WIDTH, SceneDistributionGaugeDisplayConstants.CANVAS_HEIGHT)

        this.renderPanel()
        this.renderHeader()
        this.renderResourceLimit()
        this.renderGauges()

        this.texture.needsUpdate = true
    }

    renderPanel()
    {
        const { context } = this
        const panelX = 60
        const panelY = 34
        const panelWidth = 904
        const panelHeight = 444
        const gradient = context.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight)
        gradient.addColorStop(0, SceneDistributionGaugeDisplayConstants.PANEL_TOP_COLOR)
        gradient.addColorStop(0.24, SceneDistributionGaugeDisplayConstants.PANEL_MID_COLOR)
        gradient.addColorStop(1, SceneDistributionGaugeDisplayConstants.PANEL_BOTTOM_COLOR)

        context.fillStyle = gradient
        this.roundRect(context, panelX, panelY, panelWidth, panelHeight, 28)
        context.fill()

        context.strokeStyle = SceneDistributionGaugeDisplayConstants.PANEL_BORDER_COLOR
        context.lineWidth = 2
        this.roundRect(context, panelX, panelY, panelWidth, panelHeight, 28)
        context.stroke()

        context.strokeStyle = SceneDistributionGaugeDisplayConstants.PANEL_INNER_GLOW_COLOR
        context.lineWidth = 1
        this.roundRect(context, panelX + 10, panelY + 10, panelWidth - 20, panelHeight - 20, 22)
        context.stroke()
    }

    renderHeader()
    {
        const { context } = this
        context.fillStyle = SceneDistributionGaugeDisplayConstants.TITLE_COLOR
        context.font = '700 40px "Nunito", "Segoe UI", sans-serif'
        context.textAlign = 'center'
        context.fillText('Réseau de distribution', SceneDistributionGaugeDisplayConstants.CANVAS_WIDTH * 0.5, 96)
        context.textAlign = 'start'
    }

    renderGauges()
    {
        const channels = this.state.channels.slice(0, 3)
        const gaugeWidth = 82
        const gaugeHeight = 182
        const gaugeY = 210
        const gaugeGap = 96
        const totalWidth = channels.length * gaugeWidth + Math.max(0, channels.length - 1) * gaugeGap
        const startX = (SceneDistributionGaugeDisplayConstants.CANVAS_WIDTH - totalWidth) * 0.5

        for(let index = 0; index < channels.length; index++)
        {
            const channel = channels[index]
            const x = startX + index * (gaugeWidth + gaugeGap)
            this.renderVerticalGauge({
                x,
                y: gaugeY,
                width: gaugeWidth,
                height: gaugeHeight,
                label: SceneDistributionGaugeDisplayConstants.DISPLAY_LABELS[channel.token] ?? channel.label,
                normalizedFill: channel.normalizedFill
            })
        }
    }

    renderVerticalGauge({
        x = 0,
        y = 0,
        width = 0,
        height = 0,
        label = '',
        normalizedFill = 0
    } = {})
    {
        const { context } = this
        const clampedFill = THREE.MathUtils.clamp(normalizedFill, 0, 1)
        const fillHeight = height * clampedFill
        const fillY = y + height - fillHeight
        const segmentHeight = height / 4

        context.fillStyle = SceneDistributionGaugeDisplayConstants.TRACK_COLOR
        this.topRoundedRect(context, x, y, width, height, 20)
        context.fill()

        context.strokeStyle = SceneDistributionGaugeDisplayConstants.TRACK_BORDER_COLOR
        context.lineWidth = 2
        this.topRoundedRect(context, x, y, width, height, 20)
        context.stroke()
        this.renderInnerShadow({
            drawShape: () => this.topRoundedRect(context, x, y, width, height, 20)
        })

        if(fillHeight > 0)
        {
            context.save()
            this.topRoundedRect(context, x, y, width, height, 20)
            context.clip()
            context.fillStyle = this.resolveFillColor()
            context.fillRect(x, fillY, width, fillHeight)

            const shineGradient = context.createLinearGradient(x, fillY, x + width, fillY)
            shineGradient.addColorStop(0, 'rgba(255, 255, 255, 0)')
            shineGradient.addColorStop(0.5, SceneDistributionGaugeDisplayConstants.BAR_SHINE_COLOR)
            shineGradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
            context.fillStyle = shineGradient
            context.fillRect(x, fillY, width, Math.min(28, fillHeight))
            context.restore()
        }

        for(let index = 1; index < 4; index++)
        {
            const lineY = y + segmentHeight * index
            context.strokeStyle = SceneDistributionGaugeDisplayConstants.DIVIDER_COLOR
            context.lineWidth = 2
            context.beginPath()
            context.moveTo(x + 14, lineY)
            context.lineTo(x + width - 14, lineY)
            context.stroke()
        }

        const labelBoxY = y + height
        const labelBoxHeight = 48
        context.fillStyle = SceneDistributionGaugeDisplayConstants.TRACK_COLOR
        this.roundRect(context, x - 16, labelBoxY, width + 32, labelBoxHeight, 16)
        context.fill()

        context.strokeStyle = SceneDistributionGaugeDisplayConstants.PANEL_BORDER_COLOR
        context.lineWidth = 2
        this.roundRect(context, x - 16, labelBoxY, width + 32, labelBoxHeight, 16)
        context.stroke()
        this.renderInnerShadow({
            drawShape: () => this.roundRect(context, x - 16, labelBoxY, width + 32, labelBoxHeight, 16)
        })

        context.fillStyle = SceneDistributionGaugeDisplayConstants.LABEL_COLOR
        context.font = '700 20px "Nunito", "Segoe UI", sans-serif'
        context.textAlign = 'center'
        context.fillText(label, x + width * 0.5, labelBoxY + 31)
        context.textAlign = 'start'
    }

    renderResourceLimit()
    {
        const x = 164
        const y = 148
        const width = 696
        const height = 28
        const displayPercent = Math.max(0, this.state.totalUsagePercent ?? Math.round(this.state.totalUsageRatio * 100))
        const barWidth = width * THREE.MathUtils.clamp(this.state.totalUsageRatio, 0, 1)

        this.context.fillStyle = SceneDistributionGaugeDisplayConstants.SECTION_LABEL_COLOR
        this.context.font = '700 22px "Nunito", "Segoe UI", sans-serif'
        this.context.textAlign = 'center'
        this.context.fillText('Eau distribuée', SceneDistributionGaugeDisplayConstants.CANVAS_WIDTH * 0.5, y - 16)

        this.context.fillStyle = SceneDistributionGaugeDisplayConstants.TRACK_COLOR
        this.roundRect(this.context, x, y, width, height, 14)
        this.context.fill()

        this.context.strokeStyle = SceneDistributionGaugeDisplayConstants.TRACK_BORDER_COLOR
        this.context.lineWidth = 2
        this.roundRect(this.context, x, y, width, height, 14)
        this.context.stroke()
        this.renderInnerShadow({
            drawShape: () => this.roundRect(this.context, x, y, width, height, 14)
        })

        if(barWidth > 0)
        {
            this.context.fillStyle = this.resolveFillColor()
            this.roundRect(this.context, x + 3, y + 3, Math.max(0, barWidth - 6), height - 6, 11)
            this.context.fill()
        }

        this.context.fillStyle = SceneDistributionGaugeDisplayConstants.PERCENT_TEXT_COLOR
        this.context.font = '700 22px "Nunito", "Segoe UI", sans-serif'
        this.context.fillText(`${displayPercent}%`, SceneDistributionGaugeDisplayConstants.CANVAS_WIDTH * 0.5, y + 20)
        this.context.textAlign = 'start'
    }

    resolveFillColor()
    {
        const displayPercent = Math.max(0, this.state.totalUsagePercent ?? Math.round((this.state.totalUsageRatio ?? 0) * 100))
        const isExactlyFull = displayPercent === 100

        if(this.state.isOverLimit)
        {
            return SceneDistributionGaugeDisplayConstants.FILL_OVERLIMIT_COLOR
        }

        if(isExactlyFull)
        {
            return SceneDistributionGaugeDisplayConstants.FILL_SOLVED_COLOR
        }

        if(this.state.isSolved)
        {
            return SceneDistributionGaugeDisplayConstants.FILL_SOLVED_COLOR
        }

        return SceneDistributionGaugeDisplayConstants.FILL_COLOR
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

    topRoundedRect(context, x, y, width, height, radius)
    {
        const safeWidth = Math.max(0, width)
        const safeHeight = Math.max(0, height)
        const clampedRadius = Math.min(radius, safeWidth * 0.5, safeHeight)

        context.beginPath()
        context.moveTo(x, y + safeHeight)
        context.lineTo(x, y + clampedRadius)
        context.quadraticCurveTo(x, y, x + clampedRadius, y)
        context.lineTo(x + safeWidth - clampedRadius, y)
        context.quadraticCurveTo(x + safeWidth, y, x + safeWidth, y + clampedRadius)
        context.lineTo(x + safeWidth, y + safeHeight)
        context.closePath()
    }
    renderInnerShadow({ drawShape } = {})
    {
        if(typeof drawShape !== 'function')
        {
            return
        }

        this.context.save()
        drawShape()
        this.context.clip()
        this.context.strokeStyle = SceneDistributionGaugeDisplayConstants.INNER_SHADOW_COLOR
        this.context.lineWidth = 6
        drawShape()
        this.context.stroke()
        this.context.restore()
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
