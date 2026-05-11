import Experience from '../Experience.js'
import SceneEnum from '../Enum/SceneEnum.js'
import MapScene from './Map/MapScene.js'
import SceneRecuperationScene from './SceneRecuperation/SceneRecuperationScene.js'
import SceneDistributionScene from './SceneDistribution/SceneDistributionScene.js'

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
        this.isTransitioning = false
        this.pendingSwitchKey = null

        this.register(SceneEnum.MAP, () => new MapScene())
        this.register(SceneEnum.RECUPERATION, () => new SceneRecuperationScene())
        this.register(SceneEnum.DISTRIBUTION, () => new SceneDistributionScene())

        this.setTransitionOverlay()
        this.setDebug()

        const initialScene = this.getInitialScene()
        this.switchTo(initialScene)
    }

    getInitialScene()
    {
        const urlParams = new URLSearchParams(window.location.search)
        const sceneParam = urlParams.get('scene')
        if(sceneParam && this.sceneFactories.has(sceneParam))
        {
            return sceneParam
        }

        const hash = window.location.hash
        const sceneMatch = hash.match(/[#&]scene=([^&]+)/)
        if(sceneMatch && this.sceneFactories.has(sceneMatch[1]))
        {
            return sceneMatch[1]
        }

        return SceneEnum.MAP
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

        if(this.isTransitioning)
        {
            this.pendingSwitchKey = key
            return
        }

        this.performSceneSwitch(key)
    }

    async performSceneSwitch(key)
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

        this.isTransitioning = true
        const previousKey = this.currentKey
        await this.showTransitionOverlay({
            fromKey: previousKey,
            toKey: key
        })

        if(this.currentScene)
        {
            this.currentScene.exit?.(key)
            this.currentScene.destroy?.()
        }

        this.currentScene = factory()
        this.currentKey = key

        this.experience.scene = this.currentScene.instance
        this.renderer.setScene(this.currentScene.instance)

        this.currentScene.enter?.(previousKey)
        this.currentScene.resize?.()

        await this.completeTransitionOverlay({
            toKey: key
        })
        this.isTransitioning = false

        if(this.pendingSwitchKey && this.pendingSwitchKey !== this.currentKey)
        {
            const nextKey = this.pendingSwitchKey
            this.pendingSwitchKey = null
            this.switchTo(nextKey)
            return
        }

        this.pendingSwitchKey = null
    }

    setTransitionOverlay()
    {
        this.transitionElement = document.querySelector('#sceneTransition')
        if(this.transitionElement)
        {
            this.transitionLabelElement = this.transitionElement.querySelector('[data-scene-transition-label]')
            this.transitionFillElement = this.transitionElement.querySelector('[data-scene-transition-fill]')
            this.transitionValueElement = this.transitionElement.querySelector('[data-scene-transition-value]')
            return
        }

        const overlay = document.createElement('div')
        overlay.id = 'sceneTransition'
        overlay.className = 'scene-transition'
        overlay.setAttribute('aria-hidden', 'true')
        overlay.innerHTML = `
            <div class="scene-transition__home">
                <div class="scene-transition__panel menu-panel">
                    <p class="scene-transition__title menu-title" data-scene-transition-label>Chargement</p>
                    <div class="scene-transition__meter">
                        <span class="scene-transition__value" data-scene-transition-value>0%</span>
                        <div class="scene-transition__bar" aria-hidden="true">
                            <span class="scene-transition__fill" data-scene-transition-fill></span>
                        </div>
                    </div>
                </div>
            </div>
        `
        document.body.appendChild(overlay)
        this.transitionElement = overlay
        this.transitionLabelElement = overlay.querySelector('[data-scene-transition-label]')
        this.transitionFillElement = overlay.querySelector('[data-scene-transition-fill]')
        this.transitionValueElement = overlay.querySelector('[data-scene-transition-value]')
    }

    async showTransitionOverlay({ fromKey = null, toKey = null } = {})
    {
        if(!this.transitionElement)
        {
            return
        }

        this.updateTransitionProgress(0, this.getTransitionLabel({ fromKey, toKey }))
        this.transitionElement.classList.add('is-visible')
        await this.wait(120)
        this.updateTransitionProgress(18)
        await this.wait(90)
        this.updateTransitionProgress(44)
        await this.wait(110)
        this.updateTransitionProgress(72)
        await this.wait(90)
    }

    async completeTransitionOverlay({ toKey = null } = {})
    {
        if(!this.transitionElement)
        {
            return
        }

        this.updateTransitionProgress(92, this.getTransitionLabel({ toKey }))
        await this.wait(70)
        this.updateTransitionProgress(100)
        await this.wait(180)
        this.transitionElement.classList.remove('is-visible')
        await this.wait(120)
        this.updateTransitionProgress(0)
    }

    updateTransitionProgress(progress = 0, label = null)
    {
        const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)))
        if(this.transitionFillElement)
        {
            this.transitionFillElement.style.width = `${clampedProgress}%`
        }
        if(this.transitionValueElement)
        {
            this.transitionValueElement.textContent = `${clampedProgress}%`
        }
        if(this.transitionLabelElement && typeof label === 'string' && label.trim() !== '')
        {
            this.transitionLabelElement.textContent = label
        }
    }

    getTransitionLabel({ fromKey = null, toKey = null } = {})
    {
        const nextSceneName = this.getSceneLabel(toKey)
        if(fromKey)
        {
            return `Chargement ${nextSceneName}`
        }

        return `Ouverture ${nextSceneName}`
    }

    getSceneLabel(key)
    {
        switch(key)
        {
            case SceneEnum.RECUPERATION:
                return 'Recuperation'

            case SceneEnum.DISTRIBUTION:
                return 'Distribution'

            case SceneEnum.MAP:
            default:
                return 'Map'
        }
    }

    wait(durationMs = 0)
    {
        return new Promise((resolve) =>
        {
            window.setTimeout(resolve, Math.max(0, durationMs))
        })
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
            goMap: () =>
            {
                this.switchTo(SceneEnum.MAP)
            },
            goRecuperation: () =>
            {
                this.switchTo(SceneEnum.RECUPERATION)
            },
            goDistribution: () =>
            {
                this.switchTo(SceneEnum.DISTRIBUTION)
            }
        }

        this.debug.addButtons(this.debugFolder, {
            label: 'Liste des scenes',
            columns: 3,
            buttons: [
                {
                    label: 'Map',
                    onClick: debugActions.goMap
                },
                {
                    label: 'Recuperation',
                    onClick: debugActions.goRecuperation
                },
                {
                    label: 'Distribution',
                    onClick: debugActions.goDistribution
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

        this.debugStatsFolder = this.debug.addFolder('Statistiques', {
            parent: this.debugFolder,
            expanded: false
        })

        this.debug.addManualBinding(this.debugStatsFolder, this.debugStats, 'scene', {
            label: 'Scene active',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.debugStats, 'loaded', {
            label: 'Ressources chargees',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.debugStats, 'total', {
            label: 'Ressources totales',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.debugStats, 'isReady', {
            label: 'Scene prete',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.debugStats, 'children', {
            label: 'Objets enfants',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.debugStats, 'meshes', {
            label: 'Maillages',
            readonly: true
        }, 'auto')
        this.debug.addManualBinding(this.debugStatsFolder, this.debugStats, 'lights', {
            label: 'Lumieres',
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
