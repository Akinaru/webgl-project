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
        this.isSwitchingScene = false
        this.pendingSceneKey = null
        this.transitionRafId = 0
        this.transitionProgress = 0
        this.transitionStartAt = 0

        this.register(SceneEnum.MAP, () => new MapScene())
        this.register(SceneEnum.RECUPERATION, () => new SceneRecuperationScene())
        this.register(SceneEnum.DISTRIBUTION, () => new SceneDistributionScene())

        this.setTransitionOverlay()
        this.setDebug()
        this.switchTo(SceneEnum.MAP)
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

        if(this.isSwitchingScene)
        {
            this.pendingSceneKey = key
            return
        }

        const isFirstScene = !this.currentScene
        if(isFirstScene)
        {
            this.performSceneSwitch(key)
            return
        }

        this.runSceneSwitchWithTransition(key)
    }

    performSceneSwitch(key)
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

    async runSceneSwitchWithTransition(key)
    {
        this.isSwitchingScene = true
        this.pendingSceneKey = null

        this.showTransitionOverlay()
        await this.waitForAnimationFrames(2)

        this.performSceneSwitch(key)
        this.completeTransitionOverlay()
        await this.wait(220)
        this.hideTransitionOverlay()

        this.isSwitchingScene = false
        const queuedKey = this.pendingSceneKey
        this.pendingSceneKey = null
        if(queuedKey && queuedKey !== this.currentKey)
        {
            this.switchTo(queuedKey)
        }
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
            <div class="scene-transition__panel">
                <span class="scene-transition__label" data-scene-transition-label>Transition de scene</span>
                <span class="scene-transition__value" data-scene-transition-value>0%</span>
                <div class="scene-transition__bar">
                    <span class="scene-transition__fill" data-scene-transition-fill></span>
                </div>
            </div>
        `
        document.body.appendChild(overlay)
        this.transitionElement = overlay
        this.transitionLabelElement = overlay.querySelector('[data-scene-transition-label]')
        this.transitionFillElement = overlay.querySelector('[data-scene-transition-fill]')
        this.transitionValueElement = overlay.querySelector('[data-scene-transition-value]')
    }

    showTransitionOverlay()
    {
        if(!this.transitionElement)
        {
            return
        }

        this.transitionProgress = 0
        this.transitionStartAt = performance.now()
        if(this.transitionLabelElement)
        {
            this.transitionLabelElement.textContent = 'Transition de scene'
        }
        this.updateTransitionOverlayProgress(0)
        this.transitionElement.classList.add('is-visible')
        this.transitionElement.setAttribute('aria-hidden', 'false')

        if(this.transitionRafId)
        {
            window.cancelAnimationFrame(this.transitionRafId)
            this.transitionRafId = 0
        }

        const tick = () =>
        {
            if(!this.isSwitchingScene)
            {
                return
            }

            const elapsedMs = performance.now() - this.transitionStartAt
            const targetProgress = Math.min(90, 18 + (elapsedMs * 0.08))
            this.transitionProgress = Math.max(this.transitionProgress, targetProgress)
            this.updateTransitionOverlayProgress(this.transitionProgress)
            this.transitionRafId = window.requestAnimationFrame(tick)
        }

        this.transitionRafId = window.requestAnimationFrame(tick)
    }

    completeTransitionOverlay()
    {
        this.updateTransitionOverlayProgress(100)
    }

    hideTransitionOverlay()
    {
        if(!this.transitionElement)
        {
            return
        }

        if(this.transitionRafId)
        {
            window.cancelAnimationFrame(this.transitionRafId)
            this.transitionRafId = 0
        }

        this.transitionElement.classList.remove('is-visible')
        this.transitionElement.setAttribute('aria-hidden', 'true')
    }

    updateTransitionOverlayProgress(progress)
    {
        const clamped = Math.max(0, Math.min(100, Math.round(progress)))
        if(this.transitionValueElement)
        {
            this.transitionValueElement.textContent = `${clamped}%`
        }
        if(this.transitionFillElement)
        {
            this.transitionFillElement.style.width = `${clamped}%`
        }
    }

    wait(durationMs = 0)
    {
        return new Promise((resolve) =>
        {
            window.setTimeout(resolve, durationMs)
        })
    }

    waitForAnimationFrames(frameCount = 1)
    {
        const totalFrames = Math.max(1, frameCount)
        return new Promise((resolve) =>
        {
            let remaining = totalFrames
            const tick = () =>
            {
                remaining--
                if(remaining <= 0)
                {
                    resolve()
                    return
                }
                window.requestAnimationFrame(tick)
            }
            window.requestAnimationFrame(tick)
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

        hintElement.textContent = ''
    }

    destroy()
    {
        if(this.transitionRafId)
        {
            window.cancelAnimationFrame(this.transitionRafId)
            this.transitionRafId = 0
        }
        this.currentScene?.destroy?.()
        this.currentScene = null
        this.currentKey = null
        this.debugStatsFolder?.dispose?.()
        this.debugStats = null
        this.debugFolder?.dispose?.()
    }
}
