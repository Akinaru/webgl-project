import Experience from '../Experience.js'
import SceneEnum from '../Enum/SceneEnum.js'
import VilleScene from './Ville/VilleScene.js'
import ComplexeScene from './Complexe/ComplexeScene.js'

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
        if(!this.debug.active)
        {
            return
        }

        this.debugFolder = this.debug.ui.addFolder('scenes')
        const debugActions = {
            goVille: () =>
            {
                this.switchTo(SceneEnum.VILLE)
            },
            goComplexe: () =>
            {
                this.switchTo(SceneEnum.COMPLEXE)
            }
        }

        this.debugFolder.add(debugActions, 'goVille')
        this.debugFolder.add(debugActions, 'goComplexe')

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
            lights: 0,
            drawCalls: 0,
            triangles: 0,
            geometries: 0,
            textures: 0
        }

        this.debugStatsFolder = this.debugFolder.addFolder('stats')
        this.debugStatsFolder.add(this.debugStats, 'scene').listen()
        this.debugStatsFolder.add(this.debugStats, 'loaded').listen()
        this.debugStatsFolder.add(this.debugStats, 'total').listen()
        this.debugStatsFolder.add(this.debugStats, 'isReady').listen()
        this.debugStatsFolder.add(this.debugStats, 'children').listen()
        this.debugStatsFolder.add(this.debugStats, 'meshes').listen()
        this.debugStatsFolder.add(this.debugStats, 'lights').listen()
        this.debugStatsFolder.add(this.debugStats, 'drawCalls').listen()
        this.debugStatsFolder.add(this.debugStats, 'triangles').listen()
        this.debugStatsFolder.add(this.debugStats, 'geometries').listen()
        this.debugStatsFolder.add(this.debugStats, 'textures').listen()
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
        const info = this.renderer.instance.info

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
        this.debugStats.drawCalls = info.render.calls
        this.debugStats.triangles = info.render.triangles
        this.debugStats.geometries = info.memory.geometries
        this.debugStats.textures = info.memory.textures
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
        this.debugStatsFolder?.destroy?.()
        this.debugStats = null
        this.debugFolder?.destroy?.()
    }
}
