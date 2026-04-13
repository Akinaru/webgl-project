import Experience from '../Experience.js'
import SceneEnum from '../Enum/SceneEnum.js'
import VilleScene from './Ville/VilleScene.js'
import ComplexeScene from './Complexe/ComplexeScene.js'
import MapScene from './Map/MapScene.js'

export default class SceneManager
{
    constructor()
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.renderer = this.experience.renderer

        this.sceneFactories = new Map()
        this.currentKey = null
        this.currentScene = null

        this.register(SceneEnum.VILLE, () => new VilleScene())
        this.register(SceneEnum.COMPLEXE, () => new ComplexeScene())
        this.register(SceneEnum.MAP, () => new MapScene())

        this.setDebug()
        this.switchTo(SceneEnum.VILLE)
    }

    register(key, factory)
    {
        this.sceneFactories.set(key, factory)
    }

    switchTo(key)
    {
        if(this.currentKey === key)
        {
            return
        }

        const factory = this.sceneFactories.get(key)
        if(!factory)
        {
            throw new Error(`Scene introuvable: ${key}`)
        }

        const previousKey = this.currentKey

        if(this.currentScene)
        {
            this.currentScene.exit?.(key)
            this.currentScene.destroy?.()
        }

        this.currentScene = factory()
        this.currentKey = key

        this.experience.scene = this.currentScene.instance
        this.renderer.setScene(this.currentScene.instance)
        this.setHudHint(this.currentScene.hudHint)

        this.currentScene.enter?.(previousKey)
        this.currentScene.resize?.()
    }

    update(delta)
    {
        this.currentScene?.update?.(delta)
        this.updateDebugStats()
    }

    setDebug()
    {
        if(!this.debug.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('🎬 Scenes', { expanded: false })
        const debugActions = {
            goVille: () =>
            {
                this.switchTo(SceneEnum.VILLE)
            },
            goComplexe: () =>
            {
                this.switchTo(SceneEnum.COMPLEXE)
            },
            goMap: () =>
            {
                this.switchTo(SceneEnum.MAP)
            }
        }

        this.debug.addButtons(this.debugFolder, {
            label: 'switch',
            columns: 3,
            buttons: [
                {
                    label: 'Ville',
                    onClick: debugActions.goVille
                },
                {
                    label: 'Complexe',
                    onClick: debugActions.goComplexe
                },
                {
                    label: 'Map',
                    onClick: debugActions.goMap
                }
            ]
        })

        this.setDebugStats()
    }

    setDebugStats()
    {
        this.debugStatsLastRefreshAt = 0
        this.debugStats = {
            scene: '',
            loaded: 0,
            total: 0,
            isReady: false,
            children: 0,
            meshes: 0,
            lights: 0
        }

        this.debugStatsFolder = this.debug.addFolder('stats', {
            parent: this.debugFolder,
            expanded: false
        })

        this.debug.addManualBinding(this.debugStatsFolder, this.debugStats, 'scene', {
            label: 'scene',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.debugStats, 'loaded', {
            label: 'loaded',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.debugStats, 'total', {
            label: 'total',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.debugStats, 'isReady', {
            label: 'isReady',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.debugStats, 'children', {
            label: 'children',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.debugStats, 'meshes', {
            label: 'meshes',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.debugStats, 'lights', {
            label: 'lights',
            readonly: true
        }, 'auto')
    }

    updateDebugStats()
    {
        if(!this.debugStats)
        {
            return
        }

        const now = performance.now()
        if(now - this.debugStatsLastRefreshAt < 250)
        {
            return
        }
        this.debugStatsLastRefreshAt = now

        const scene = this.currentScene?.instance || this.experience.scene
        const resources = this.experience.resources
        let meshes = 0
        let lights = 0
        if(scene)
        {
            scene.traverse((object) =>
            {
                if(object.isMesh)
                {
                    meshes++
                }
                if(object.isLight)
                {
                    lights++
                }
            })
        }

        this.debugStats.scene = this.currentKey || 'none'
        this.debugStats.loaded = resources.loaded
        this.debugStats.total = resources.toLoad
        this.debugStats.isReady = resources.isReady
        this.debugStats.children = scene ? scene.children.length : 0
        this.debugStats.meshes = meshes
        this.debugStats.lights = lights
    }

    setHudHint(hint)
    {
        const hintElement = document.querySelector('.hud__hint')
        if(!hintElement)
        {
            return
        }

        if(typeof hint === 'string' && hint.trim() !== '')
        {
            hintElement.textContent = hint
            return
        }

        hintElement.textContent = 'Clique dans la scene puis utilise ZQSD/WASD pour te deplacer.'
    }

    destroy()
    {
        this.currentScene?.destroy?.()
        this.currentScene = null
        this.currentKey = null
        this.debugStatsFolder?.dispose?.()
        this.debugStats = null
        this.debugFolder?.dispose?.()
    }
}
