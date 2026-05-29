import * as THREE from 'three'
import Experience from '../../../Experience.js'
import * as SceneDistributionFlowConstants from './Flow.constants.js'
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

        context.fillStyle = SceneDistributionGaugeDisplayConstants.TITLE_COLOR
        context.font = '700 44px sans-serif'
        context.fillText('Réseau de distribution', 84, 85)

        context.fillStyle = SceneDistributionGaugeDisplayConstants.SUBTITLE_COLOR
        context.font = '500 20px sans-serif'
        context.fillText('Gérez les ressources stratégiques sans saturer le réseau.', 84, 120)

        this.renderGauges()
        this.renderResourceLimit()

        this.texture.needsUpdate = true
    }

    renderGauges()
    {
        const gaugeX = 260
        const gaugeWidth = 580
        const gaugeHeight = 26
        const topY = 170
        const rowGap = 80

        for(let index = 0; index < this.state.channels.length; index++)
        {
            const channel = this.state.channels[index]
            const y = topY + index * rowGap
            const fillWidth = gaugeWidth * THREE.MathUtils.clamp(channel.normalizedFill, 0, 1)
            
            const isFilled = channel.currentLevel.id > 0
            const fillColor = this.state.isOverLimit 
                ? '#ff8c00' // Orange si limite atteinte
                : (isFilled ? SceneDistributionGaugeDisplayConstants.FILL_COLOR : '#334455')

            this.context.fillStyle = SceneDistributionGaugeDisplayConstants.LABEL_COLOR
            this.context.font = '700 24px sans-serif'
            this.context.textAlign = 'start'
            this.context.fillText(channel.label, 84, y + 21)

            // Track
            this.context.fillStyle = SceneDistributionGaugeDisplayConstants.TRACK_COLOR
            this.context.strokeStyle = SceneDistributionGaugeDisplayConstants.TRACK_BORDER_COLOR
            this.context.lineWidth = 2
            this.roundRect(this.context, gaugeX, y, gaugeWidth, gaugeHeight, 13)
            this.context.fill()
            this.context.stroke()

            // Markers
            this.renderLevelMarkers(gaugeX, y, gaugeWidth, gaugeHeight)

            // Fill
            this.context.fillStyle = fillColor
            this.roundRect(
                this.context,
                gaugeX + 3,
                y + 3,
                Math.max(12, fillWidth - 6),
                gaugeHeight - 6,
                10
            )
            this.context.fill()

            // Status Badge
            this.renderStatusChip({
                x: 860,
                y: y - 8,
                text: channel.currentLevel.label,
                levelId: channel.currentLevel.id
            })
        }
    }

    renderLevelMarkers(x, y, width, height)
    {
        // On affiche les paliers MIN(2), STABLE(3), OPT(4)
        const markers = [
            { pos: 0.45, label: 'MIN' },
            { pos: 0.65, label: 'STABLE' },
            { pos: 0.85, label: 'OPT' }
        ]

        this.context.lineWidth = 1
        this.context.font = 'bold 9px sans-serif'
        this.context.textAlign = 'center'

        for(const marker of markers)
        {
            const markerX = x + width * marker.pos
            this.context.strokeStyle = 'rgba(255, 255, 255, 0.15)'
            this.context.beginPath()
            this.context.moveTo(markerX, y)
            this.context.lineTo(markerX, y + height)
            this.context.stroke()

            this.context.fillStyle = 'rgba(255, 255, 255, 0.3)'
            this.context.fillText(marker.label, markerX, y - 6)
        }
    }

    renderStatusChip({
        x = 0,
        y = 0,
        text = '',
        levelId = 0
    } = {})
    {
        const width = 125
        const height = 42
        
        let bgColor = SceneDistributionGaugeDisplayConstants.CHIP_BG_COLOR
        let textColor = SceneDistributionGaugeDisplayConstants.CHIP_TEXT_COLOR

        if(levelId === 1) bgColor = '#442222' // Critique
        if(levelId === 2) bgColor = '#1d3b53' // Minimum
        if(levelId === 3) bgColor = '#1d5d46' // Stable
        if(levelId >= 4)  bgColor = '#5d4b1d' // Optimal/Max

        this.context.fillStyle = bgColor
        this.roundRect(this.context, x, y, width, height, 14)
        this.context.fill()

        this.context.fillStyle = textColor
        this.context.font = '700 18px sans-serif'
        this.context.textAlign = 'center'
        this.context.fillText(text.toUpperCase(), x + width * 0.5, y + 28)
        this.context.textAlign = 'start'
    }

    renderResourceLimit()
    {
        const x = 84
        const y = 420
        const width = 860
        const height = 12
        
        // Strict clamp à 100%
        const displayPercent = Math.min(100, Math.round(this.state.totalUsageRatio * 100))
        const barWidth = width * (displayPercent / 100)
        
        this.context.fillStyle = SceneDistributionGaugeDisplayConstants.BACKGROUND_COLOR
        this.context.fillRect(x - 10, y - 40, width + 20, 110)

        this.context.fillStyle = SceneDistributionGaugeDisplayConstants.SUBTITLE_COLOR
        this.context.font = '700 18px sans-serif'
        this.context.fillText(`CAPACITÉ RÉSEAU : ${displayPercent}%`, x, y - 12)

        // Track bar
        this.context.fillStyle = '#0a1a2a'
        this.roundRect(this.context, x, y, width, height, 6)
        this.context.fill()

        // Progress bar
        const barColor = this.state.isOverLimit ? '#ff3b3b' : (this.state.isSolved ? '#4fd58a' : '#51b4ff')
        this.context.fillStyle = barColor
        this.roundRect(this.context, x, y, barWidth, height, 6)
        this.context.fill()

        let message = 'Alimentez chaque zone pour stabiliser.'
        let messageColor = '#7ba7c4'

        if(this.state.isOverLimit)
        {
            message = 'RÉSEAU SATURÉ : LIBÉREZ DE LA CAPACITÉ'
            messageColor = '#ff5c5c'
        }
        else if(this.state.isSolved)
        {
            message = 'RÉSEAU STABILISÉ. UTILISEZ LE BOUTON ROUGE.'
            messageColor = '#4fd58a'
        }

        this.context.fillStyle = messageColor
        this.context.font = 'bold 20px sans-serif'
        this.context.fillText(message, x, y + 40)
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
