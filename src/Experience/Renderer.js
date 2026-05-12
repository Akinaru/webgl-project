import * as THREE from 'three'
import Experience from './Experience.js'
import EventEnum from './Enum/EventEnum.js'

const GRAPHICS_QUALITY_STORAGE_KEY = 'bloom.graphics.quality'
const GRAPHICS_QUALITY = Object.freeze({
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high'
})
const GRAPHICS_QUALITY_PRESETS = Object.freeze({
    [GRAPHICS_QUALITY.LOW]: Object.freeze({
        pixelRatioScale: 0.7,
        shadowsEnabled: false
    }),
    [GRAPHICS_QUALITY.MEDIUM]: Object.freeze({
        pixelRatioScale: 0.88,
        shadowsEnabled: true
    }),
    [GRAPHICS_QUALITY.HIGH]: Object.freeze({
        pixelRatioScale: 1,
        shadowsEnabled: true
    })
})

export default class Renderer
{
    constructor()
    {
        this.experience = new Experience()
        this.canvas = this.experience.canvas
        this.sizes = this.experience.sizes
        this.camera = this.experience.camera
        this.debug = this.experience.debug

        this.setInstance()
        this.prepareWebGLRenderBreakpoint()
        this.restoreGraphicsQuality()
        this.applyGraphicsQualityPreset(this.graphicsQuality)
        this.setScene(this.experience.scene)
        this.setDebug()
        this.syncInspectorContext()

        this.sizes.on(`${EventEnum.RESIZE}.renderer`, () =>
        {
            this.resize()
        })
    }

    setInstance()
    {
        this.instance = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true
        })

        this.instance.toneMapping = THREE.CineonToneMapping
        this.instance.toneMappingExposure = 1.5
        this.instance.shadowMap.enabled = true
        this.instance.shadowMap.type = THREE.PCFSoftShadowMap
        this.instance.setSize(this.sizes.width, this.sizes.height)
        this.instance.setPixelRatio(this.getEffectivePixelRatio())
    }

    prepareWebGLRenderBreakpoint()
    {
        const shouldBreakOnRender = this.debug?.flags?.has?.('breakrender')
        if(!shouldBreakOnRender || !this.instance?.render)
        {
            return
        }

        const originalRender = this.instance.render.bind(this.instance)
        let hasBrokenOnce = false

        this.instance.render = (...args) =>
        {
            if(!hasBrokenOnce)
            {
                hasBrokenOnce = true
                debugger
            }

            return originalRender(...args)
        }
    }

    setDebug()
    {
        if(this.debug.isDebugEnabled)
        {
            this.setRenderingDebug()
        }

        if(this.debug.isDebugEnabled || this.debug.isStatsEnabled)
        {
            this.setRendererStatsDebug()
        }
    }

    setRenderingDebug()
    {
        this.debugRenderingFolder = this.debug.addFolder('📸 Rendu', { expanded: false })
        this.debugBloomFolder = this.debug.addFolder('Bloom', {
            parent: this.debugRenderingFolder,
            expanded: false
        })
        this.debugBlurFolder = this.debug.addFolder('Flou / Profondeur', {
            parent: this.debugRenderingFolder,
            expanded: false
        })

        this.postProcessing = {
            bloom: {
                threshold: 0.82,
                strength: 0.68,
                radius: 0.55,
                smoothWidth: 0.03
            },
            blur: {
                start: 0.12,
                end: 0.7,
                repeats: 2,
                amount: 0.32
            }
        }

        this.debug.addBinding(this.debugBloomFolder, this.postProcessing.bloom, 'threshold', {
            label: 'Seuil de bloom',
            min: 0,
            max: 1.5,
            step: 0.001
        })
        this.debug.addBinding(this.debugBloomFolder, this.postProcessing.bloom, 'strength', {
            label: 'Intensite du bloom',
            min: 0,
            max: 5,
            step: 0.001
        })
        this.debug.addBinding(this.debugBloomFolder, this.postProcessing.bloom, 'radius', {
            label: 'Rayon du bloom',
            min: 0,
            max: 1,
            step: 0.001
        })
        this.debug.addBinding(this.debugBloomFolder, this.postProcessing.bloom, 'smoothWidth', {
            label: 'Largeur de transition',
            min: 0,
            max: 1,
            step: 0.001
        })

        this.debug.addBinding(this.debugBlurFolder, this.postProcessing.blur, 'start', {
            label: 'Debut du flou',
            min: 0,
            max: 1,
            step: 0.001
        })
        this.debug.addBinding(this.debugBlurFolder, this.postProcessing.blur, 'end', {
            label: 'Fin du flou',
            min: 0,
            max: 2,
            step: 0.001
        })
        this.debug.addBinding(this.debugBlurFolder, this.postProcessing.blur, 'repeats', {
            label: 'Nombre de passes',
            min: 0,
            max: 8,
            step: 1
        })
        this.debug.addBinding(this.debugBlurFolder, this.postProcessing.blur, 'amount', {
            label: 'Intensite du flou',
            min: 0,
            max: 2,
            step: 0.001
        })

        this.fpsGraph = this.debugRenderingFolder.addBlade({
            view: 'fpsgraph',
            label: 'Images par seconde',
            rows: 2
        })
    }

    setRendererStatsDebug()
    {
        this.rendererStats = {
            drawCalls: 0,
            triangles: 0,
            geometries: 0,
            textures: 0
        }

        this.debugStatsFolder = this.debug.addFolder('📊 Statistiques du rendu', {
            expanded: false
        })

        this.debug.addManualBinding(this.debugStatsFolder, this.rendererStats, 'drawCalls', {
            label: 'Appels de dessin',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.rendererStats, 'triangles', {
            label: 'Triangles',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.rendererStats, 'geometries', {
            label: 'Geometries',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.rendererStats, 'textures', {
            label: 'Textures',
            readonly: true
        }, 'auto')
    }

    updateRendererStats()
    {
        if(!this.rendererStats)
        {
            return
        }

        const info = this.instance.info
        this.rendererStats.drawCalls = info.render.calls
        this.rendererStats.triangles = info.render.triangles
        this.rendererStats.geometries = info.memory.geometries
        this.rendererStats.textures = info.memory.textures
    }

    syncInspectorContext()
    {
        this.debug.syncInspectorContext({
            renderer: this.instance,
            scene: this.scene,
            camera: this.camera.instance
        })
    }

    resize()
    {
        this.instance.setSize(this.sizes.width, this.sizes.height)
        this.instance.setPixelRatio(this.getEffectivePixelRatio())
    }

    getEffectivePixelRatio()
    {
        const preset = GRAPHICS_QUALITY_PRESETS[this.graphicsQuality] || GRAPHICS_QUALITY_PRESETS[GRAPHICS_QUALITY.HIGH]
        const scale = Number.isFinite(preset.pixelRatioScale) ? Math.max(0.1, preset.pixelRatioScale) : 1
        return Math.min(this.sizes.pixelRatio * scale, 2)
    }

    restoreGraphicsQuality()
    {
        let storedQuality = ''
        try
        {
            storedQuality = String(window.localStorage.getItem(GRAPHICS_QUALITY_STORAGE_KEY) || '').trim().toLowerCase()
        }
        catch(error)
        {
            storedQuality = ''
        }

        this.graphicsQuality = GRAPHICS_QUALITY_PRESETS[storedQuality]
            ? storedQuality
            : GRAPHICS_QUALITY.HIGH
    }

    persistGraphicsQuality()
    {
        try
        {
            window.localStorage.setItem(GRAPHICS_QUALITY_STORAGE_KEY, this.graphicsQuality)
        }
        catch(error)
        {
            // Persistence best effort.
        }
    }

    applyGraphicsQualityPreset(quality)
    {
        const safeQuality = GRAPHICS_QUALITY_PRESETS[quality]
            ? quality
            : GRAPHICS_QUALITY.HIGH
        const preset = GRAPHICS_QUALITY_PRESETS[safeQuality]

        this.graphicsQuality = safeQuality
        if(this.instance)
        {
            this.instance.shadowMap.enabled = Boolean(preset.shadowsEnabled)
            this.instance.setPixelRatio(this.getEffectivePixelRatio())
        }
    }

    setGraphicsQuality(quality, { persist = true } = {})
    {
        this.applyGraphicsQualityPreset(quality)
        if(persist)
        {
            this.persistGraphicsQuality()
        }
        return this.graphicsQuality
    }

    getGraphicsQuality()
    {
        return this.graphicsQuality
    }

    setScene(scene)
    {
        this.scene = scene
        this.syncInspectorContext()
    }

    update()
    {
        if(!this.scene)
        {
            return
        }

        this.fpsGraph?.begin?.()
        this.instance.render(this.scene, this.camera.instance)
        this.fpsGraph?.end?.()
        this.updateRendererStats()
    }

    destroy()
    {
        this.sizes.off(`${EventEnum.RESIZE}.renderer`)
        this.debugBlurFolder?.dispose?.()
        this.debugBloomFolder?.dispose?.()
        this.debugRenderingFolder?.dispose?.()
        this.debugStatsFolder?.dispose?.()
    }
}
