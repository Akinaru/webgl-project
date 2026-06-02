import Experience from '../Experience.js'
import SceneEnum from '../Enum/SceneEnum.js'
import MapScene from './Map/MapScene.js'
import SceneRecuperationScene from './SceneRecuperation/SceneRecuperationScene.js'
import SceneRecyclageScene from './SceneRecyclage/SceneRecyclageScene.js'
import SceneNanobotsScene from './SceneNanobots/SceneNanobotsScene.js'
import SceneDistributionScene from './SceneDistribution/Scene.js'
import LoadingPhrases from './LoadingPhrases.js'
import Disposal from '../Utils/Disposal.js'
import { sceneSources, commonSources } from '../Source/sources.js'

export default class SceneManager
{
    constructor()
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.renderer = this.experience.renderer

        this.loadingPhrases = new LoadingPhrases()
        this.sceneFactories = new Map()
        this.currentKey = null
        this.currentScene = null
        this.isTransitioning = false
        this.pendingSwitchKey = null
        this.transitionVariantClass = null

        this.register(SceneEnum.MAP, () => new MapScene())
        this.register(SceneEnum.RECUPERATION, () => new SceneRecuperationScene())
        this.register(SceneEnum.RECYCLAGE, () => new SceneRecyclageScene())
        this.register(SceneEnum.NANOBOTS, () => new SceneNanobotsScene())
        this.register(SceneEnum.DISTRIBUTION, () => new SceneDistributionScene())

        this.setTransitionOverlay()
        this.setDebug()
    }

    start()
    {
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

    switchTo(key, { force = false } = {})
    {
        if(this.currentKey === key && force !== true)
        {
            return
        }

        if(this.isTransitioning)
        {
            this.pendingSwitchKey = {
                key,
                force: force === true
            }
            return
        }

        this.performSceneSwitch(key, {
            force: force === true
        })
    }

    async performSceneSwitch(key, { force = false } = {})
    {
        if(this.currentKey === key && force !== true)
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
        const isInitialSwitch = previousKey === null

        // Si ce n'est pas le switch initial, on affiche l'overlay.
        // Si c'est l'initial, le Menu l'a déjà affiché pour nous.
        if(!isInitialSwitch)
        {
            await this.showTransitionOverlay({
                fromKey: previousKey,
                toKey: key
            })
        }

        // --- Chargement des ressources de la scène ---
        const sources = sceneSources[key] || []
        console.log(`[SceneManager] Vérification ressources pour ${key}. Sources: ${sources.length}`)
        
        if(sources.length > 0)
        {
            let loadedInGroup = 0
            const totalInGroup = sources.length
            
            const onItemLoaded = (source) => {
                loadedInGroup++
                const progress = (loadedInGroup / totalInGroup) * 100
                console.log(`[SceneManager] Progress ${key}: ${progress.toFixed(1)}% (${loadedInGroup}/${totalInGroup}) - ${source?.name}`)
                this.updateTransitionProgress(10 + (progress * 0.8))
            }

            this.experience.resources.on('itemLoaded', onItemLoaded)
            await this.experience.resources.loadGroup(sources)
            this.experience.resources.off('itemLoaded', onItemLoaded)
        }

        if(this.currentScene)
        {
            const oldKey = this.currentKey
            this.currentScene.exit?.(key)

            // Nettoyage agressif de la scène Three.js précédente pour libérer le GPU
            // On le fait AVANT destroy() pour que les objets soient encore dans la scène
            if(this.currentScene.instance)
            {
                Disposal.clearScene(this.currentScene.instance)
            }

            this.currentScene.destroy?.()

            // Purge des ressources spécifiques à l'ancienne scène pour libérer la RAM
            const oldSources = sceneSources[oldKey] || []
            if(oldSources.length > 0)
            {
                const nextSourcesNames = (sceneSources[key] || []).map(s => s.name)
                const commonNames = commonSources.map(s => s.name)
                
                const toPurge = oldSources
                    .map(s => s.name)
                    .filter(name => !nextSourcesNames.includes(name) && !commonNames.includes(name))
                
                if(toPurge.length > 0)
                {
                    console.log(`[SceneManager] Purging ${toPurge.length} resources from ${oldKey}:`, toPurge)
                    this.experience.resources.purgeItems(toPurge)
                }
            }
        }

        this.currentScene = factory()
        this.currentKey = key

        this.experience.scene = this.currentScene.instance
        this.renderer.setScene(this.currentScene.instance)

        this.currentScene.enter?.(previousKey)
        this.currentScene.resize?.()
        this.experience.captureSceneStartCheckpoint?.(key)

        // On complète la transition (ce qui cache l'overlay)
        await this.completeTransitionOverlay({
            toKey: key
        })
        this.isTransitioning = false

        if(this.pendingSwitchKey && this.pendingSwitchKey.key !== this.currentKey)
        {
            const nextSwitch = this.pendingSwitchKey
            this.pendingSwitchKey = null
            this.switchTo(nextSwitch.key, {
                force: nextSwitch.force === true
            })
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
            this.transitionPhraseElement = this.transitionElement.querySelector('[data-scene-transition-phrase]')
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
                    <p class="scene-transition__title menu-title" data-scene-transition-label>Chargement en cours</p>
                    <div class="scene-transition__meter">
                        <span class="scene-transition__value" data-scene-transition-value>0%</span>
                    </div>
                </div>
            </div>
            <div class="scene-transition__footer">
                <div class="scene-transition__phrase-panel">
                    <p class="scene-transition__phrase" data-scene-transition-phrase></p>
                </div>
            </div>
        `
        document.body.appendChild(overlay)
        this.transitionElement = overlay
        this.transitionLabelElement = overlay.querySelector('[data-scene-transition-label]')
        this.transitionPhraseElement = overlay.querySelector('[data-scene-transition-phrase]')
        this.transitionFillElement = overlay.querySelector('[data-scene-transition-fill]')
        this.transitionValueElement = overlay.querySelector('[data-scene-transition-value]')
    }

    async showTransitionOverlay({ fromKey = null, toKey = null } = {})
    {
        if(!this.transitionElement)
        {
            return
        }

        this.updateTransitionProgress(0, {
            label: this.getTransitionLabel({ toKey }),
            phrase: this.loadingPhrases.getPhrase(fromKey, toKey)
        })
        this.transitionElement.classList.add('is-visible')
        await this.wait(50)
    }

    async completeTransitionOverlay({ toKey = null } = {})
    {
        if(!this.transitionElement)
        {
            return
        }

        this.updateTransitionProgress(92, {
            label: this.getTransitionLabel({ toKey })
        })
        await this.wait(70)
        this.updateTransitionProgress(100)
        await this.wait(180)
        this.transitionElement.classList.remove('is-visible')
        await this.wait(120)
        this.updateTransitionProgress(0)
        this.setTransitionVariantClass(null)
    }

    setTransitionVariantClass(variant = null)
    {
        if(!this.transitionElement)
        {
            return
        }

        if(this.transitionVariantClass)
        {
            this.transitionElement.classList.remove(this.transitionVariantClass)
            this.transitionVariantClass = null
        }

        if(typeof variant !== 'string' || variant.trim() === '')
        {
            return
        }

        this.transitionVariantClass = `scene-transition--${variant.trim()}`
        this.transitionElement.classList.add(this.transitionVariantClass)
    }

    async runTaskTransition({
        label = 'Chargement en cours',
        phrase = '',
        variant = null,
        task = null
    } = {})
    {
        if(typeof task !== 'function')
        {
            return
        }

        this.setTransitionVariantClass(variant)
        await this.showTransitionOverlay()
        this.updateTransitionProgress(6, { label, phrase })
        await task({
            setProgress: (progress, options = {}) => this.updateTransitionProgress(progress, {
                label,
                phrase,
                ...options
            })
        })
        await this.completeTransitionOverlay()
    }

    updateTransitionProgress(progress = 0, { label = null, phrase = null } = {})
    {
        const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)))
        if(this.transitionFillElement)
        {
            this.transitionFillElement.style.setProperty('--scene-transition-progress', `${clampedProgress / 100}`)
        }
        if(this.transitionElement)
        {
            this.transitionElement.style.setProperty('--scene-transition-progress', `${clampedProgress / 100}`)
        }
        if(this.transitionValueElement)
        {
            this.transitionValueElement.textContent = `${clampedProgress}%`
        }
        if(this.transitionLabelElement && typeof label === 'string' && label.trim() !== '')
        {
            this.transitionLabelElement.textContent = label
        }
        if(this.transitionPhraseElement && typeof phrase === 'string')
        {
            this.transitionPhraseElement.textContent = phrase
        }
    }

    getTransitionLabel({ fromKey = null, toKey = null } = {})
    {
        if(fromKey)
        {
            return this.loadingPhrases.getPhrase(fromKey, toKey)
        }

        const nextSceneName = this.getSceneLabel(toKey)
        return `Ouverture ${nextSceneName}`
    }

    getSceneLabel(key)
    {
        switch(key)
        {
            case SceneEnum.RECUPERATION:
                return 'Recuperation'

            case SceneEnum.RECYCLAGE:
                return 'Champignons'

            case SceneEnum.NANOBOTS:
                return 'Nanobots'

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
        const sceneButtons = [
            { key: SceneEnum.MAP, label: 'Map' },
            { key: SceneEnum.RECUPERATION, label: 'Recuperation' },
            { key: SceneEnum.RECYCLAGE, label: 'Champignons' },
            { key: SceneEnum.NANOBOTS, label: 'Nanobots' },
            { key: SceneEnum.DISTRIBUTION, label: 'Distribution' }
        ]

        for(const sceneButton of sceneButtons)
        {
            this.debug.addButton(this.debugFolder, {
                title: sceneButton.label,
                onClick: () =>
                {
                    this.switchTo(sceneButton.key)
                }
            })
        }

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
