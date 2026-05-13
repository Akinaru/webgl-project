import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass.js'
import Experience from './Experience.js'
import EventEnum from './Enum/EventEnum.js'
import SceneEnum from './Enum/SceneEnum.js'

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
        this.ambientOcclusion = {
            enabled: true,
            recuperationOnly: false,
            intensity: 0.014,
            bias: 0.35,
            scale: 1,
            kernelRadius: 18,
            minResolution: 0,
            blur: true,
            blurRadius: 6,
            blurStdDev: 3
        }

        this.setInstance()
        this.setPostProcessing()
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
        this.debugAmbientOcclusionFolder = this.debug.addFolder('Occlusion ambiante', {
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

        this.debug.addBinding(this.debugAmbientOcclusionFolder, this.ambientOcclusion, 'enabled', {
            label: 'Activer AO'
        }).on('change', () =>
        {
            this.syncAmbientOcclusionPass()
        })
        this.debug.addBinding(this.debugAmbientOcclusionFolder, this.ambientOcclusion, 'recuperationOnly', {
            label: 'Recuperation seulement'
        }).on('change', () =>
        {
            this.syncAmbientOcclusionPass()
        })
        this.debug.addBinding(this.debugAmbientOcclusionFolder, this.ambientOcclusion, 'kernelRadius', {
            label: 'Rayon',
            min: 1,
            max: 100,
            step: 1
        }).on('change', () =>
        {
            this.syncAmbientOcclusionPass()
        })
        this.debug.addBinding(this.debugAmbientOcclusionFolder, this.ambientOcclusion, 'intensity', {
            label: 'Intensite',
            min: 0,
            max: 0.2,
            step: 0.001
        }).on('change', () =>
        {
            this.syncAmbientOcclusionPass()
        })
        this.debug.addBinding(this.debugAmbientOcclusionFolder, this.ambientOcclusion, 'bias', {
            label: 'Bias',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.syncAmbientOcclusionPass()
        })
        this.debug.addBinding(this.debugAmbientOcclusionFolder, this.ambientOcclusion, 'scale', {
            label: 'Scale',
            min: 0,
            max: 4,
            step: 0.01
        }).on('change', () =>
        {
            this.syncAmbientOcclusionPass()
        })
        this.debug.addBinding(this.debugAmbientOcclusionFolder, this.ambientOcclusion, 'blur', {
            label: 'Blur'
        }).on('change', () =>
        {
            this.syncAmbientOcclusionPass()
        })
        this.debug.addBinding(this.debugAmbientOcclusionFolder, this.ambientOcclusion, 'blurRadius', {
            label: 'Rayon blur',
            min: 0,
            max: 16,
            step: 1
        }).on('change', () =>
        {
            this.syncAmbientOcclusionPass()
        })
        this.debug.addBinding(this.debugAmbientOcclusionFolder, this.ambientOcclusion, 'blurStdDev', {
            label: 'Blur stddev',
            min: 0.5,
            max: 8,
            step: 0.1
        }).on('change', () =>
        {
            this.syncAmbientOcclusionPass()
        })
        this.debug.addBinding(this.debugAmbientOcclusionFolder, this.ambientOcclusion, 'minResolution', {
            label: 'Resolution min',
            min: 0,
            max: 1,
            step: 0.0001
        }).on('change', () =>
        {
            this.syncAmbientOcclusionPass()
        })
        this.fpsGraph = this.debugRenderingFolder.addBlade({
            view: 'fpsgraph',
            label: 'Images par seconde',
            rows: 2
        })
    }

    setPostProcessing()
    {
        this.effectComposer = new EffectComposer(this.instance)
        this.renderPass = new RenderPass(this.experience.scene, this.camera.instance)
        this.saoPass = new SAOPass(
            this.experience.scene,
            this.camera.instance,
            new THREE.Vector2(this.sizes.width, this.sizes.height)
        )

        this.effectComposer.addPass(this.renderPass)
        this.effectComposer.addPass(this.saoPass)
        this.syncPostProcessingSize()
        this.syncAmbientOcclusionPass()
    }

    syncPostProcessingSize()
    {
        this.effectComposer?.setSize(this.sizes.width, this.sizes.height)
        this.effectComposer?.setPixelRatio?.(this.getEffectivePixelRatio())
        this.saoPass?.setSize?.(this.sizes.width, this.sizes.height)
    }

    shouldUseAmbientOcclusion()
    {
        if(this.ambientOcclusion.enabled !== true)
        {
            return false
        }

        if(this.ambientOcclusion.recuperationOnly !== true)
        {
            return true
        }

        return this.experience.sceneManager?.currentKey === SceneEnum.RECUPERATION
    }

    syncAmbientOcclusionPass()
    {
        if(!this.saoPass)
        {
            return
        }

        this.saoPass.enabled = this.shouldUseAmbientOcclusion()
        this.saoPass.params.output = SAOPass.OUTPUT.Default
        this.saoPass.params.saoBias = this.ambientOcclusion.bias
        this.saoPass.params.saoIntensity = this.ambientOcclusion.intensity
        this.saoPass.params.saoScale = this.ambientOcclusion.scale
        this.saoPass.params.saoKernelRadius = this.ambientOcclusion.kernelRadius
        this.saoPass.params.saoMinResolution = this.ambientOcclusion.minResolution
        this.saoPass.params.saoBlur = this.ambientOcclusion.blur
        this.saoPass.params.saoBlurRadius = this.ambientOcclusion.blurRadius
        this.saoPass.params.saoBlurStdDev = this.ambientOcclusion.blurStdDev
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
        this.syncPostProcessingSize()
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
        this.syncPostProcessingSize()
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
        if(this.renderPass)
        {
            this.renderPass.scene = scene
        }
        if(this.saoPass)
        {
            this.saoPass.scene = scene
        }
        this.syncAmbientOcclusionPass()
        this.syncInspectorContext()
    }

    update()
    {
        if(!this.scene)
        {
            return
        }

        this.fpsGraph?.begin?.()
        this.syncAmbientOcclusionPass()
        if(this.shouldUseAmbientOcclusion())
        {
            this.effectComposer?.render?.()
        }
        else
        {
            this.instance.render(this.scene, this.camera.instance)
        }
        this.fpsGraph?.end?.()
        this.updateRendererStats()
    }

    destroy()
    {
        this.sizes.off(`${EventEnum.RESIZE}.renderer`)
        this.debugBlurFolder?.dispose?.()
        this.debugBloomFolder?.dispose?.()
        this.debugAmbientOcclusionFolder?.dispose?.()
        this.debugRenderingFolder?.dispose?.()
        this.debugStatsFolder?.dispose?.()
        this.effectComposer?.dispose?.()
        this.saoPass?.dispose?.()
    }
}
