import * as THREE from 'three'
import Experience from './Experience.js'
import EventEnum from './Enum/EventEnum.js'

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
        this.instance.setPixelRatio(this.sizes.pixelRatio)
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
        this.debugRenderingFolder = this.debug.addFolder('📸 Rendering', { expanded: false })
        this.debugBloomFolder = this.debug.addFolder('Bloom', {
            parent: this.debugRenderingFolder,
            expanded: false
        })
        this.debugBlurFolder = this.debug.addFolder('Blur/DOF', {
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
            label: 'threshold',
            min: 0,
            max: 1.5,
            step: 0.001
        })
        this.debug.addBinding(this.debugBloomFolder, this.postProcessing.bloom, 'strength', {
            label: 'strength',
            min: 0,
            max: 5,
            step: 0.001
        })
        this.debug.addBinding(this.debugBloomFolder, this.postProcessing.bloom, 'radius', {
            label: 'radius',
            min: 0,
            max: 1,
            step: 0.001
        })
        this.debug.addBinding(this.debugBloomFolder, this.postProcessing.bloom, 'smoothWidth', {
            label: 'smoothWidth',
            min: 0,
            max: 1,
            step: 0.001
        })

        this.debug.addBinding(this.debugBlurFolder, this.postProcessing.blur, 'start', {
            label: 'start',
            min: 0,
            max: 1,
            step: 0.001
        })
        this.debug.addBinding(this.debugBlurFolder, this.postProcessing.blur, 'end', {
            label: 'end',
            min: 0,
            max: 2,
            step: 0.001
        })
        this.debug.addBinding(this.debugBlurFolder, this.postProcessing.blur, 'repeats', {
            label: 'repeats',
            min: 0,
            max: 8,
            step: 1
        })
        this.debug.addBinding(this.debugBlurFolder, this.postProcessing.blur, 'amount', {
            label: 'amount',
            min: 0,
            max: 2,
            step: 0.001
        })

        this.fpsGraph = this.debugRenderingFolder.addBlade({
            view: 'fpsgraph',
            label: 'fps',
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

        this.debugStatsFolder = this.debug.addFolder('📊 Renderer Stats', {
            expanded: false
        })

        this.debug.addManualBinding(this.debugStatsFolder, this.rendererStats, 'drawCalls', {
            label: 'drawCalls',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.rendererStats, 'triangles', {
            label: 'triangles',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.rendererStats, 'geometries', {
            label: 'geometries',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.rendererStats, 'textures', {
            label: 'textures',
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
        this.instance.setPixelRatio(this.sizes.pixelRatio)
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
