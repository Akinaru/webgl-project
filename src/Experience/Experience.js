import * as THREE from 'three'
import Camera from './Camera.js'
import Renderer from './Renderer.js'
import Sizes from './Utils/Sizes.js'
import Time from './Utils/Time.js'
import Debug from './Utils/Debug.js'
import Resources from './Utils/Resources.js'
import { bootSources } from './Source/sources.js'
import EventEnum from './Enum/EventEnum.js'
import SceneManager from './Scenes/SceneManager.js'
import SceneEnum from './Enum/SceneEnum.js'
import MetierManager from './Metiers/MetierManager.js'
import MetierEnum from './Enum/MetierEnum.js'
import ActionId from './Actions/ActionId.js'
import ActionTracker from './Actions/ActionTracker.js'
import DialogueManager from './Dialogues/DialogueManager.js'
import ObjectiveManager from './Objectives/ObjectiveManager.js'
import BadgeManager from './Badges/BadgeManager.js'
import Menu from './Menu/Menu.js'
import InputManager from './Inputs/InputManager.js'
import SoundManager from './Audio/SoundManager.js'
import Tutoriel from './Utils/Tutoriel.js'
import Bloom from './Common/Characters/Bloom.js'

let instance = null
const DEBUG_TUTORIAL_FOLDER_TITLE = '🎓 Tutoriel'
const DEBUG_TUTORIAL_COMPLETED_KEY = 'tutorialCompleted'
const DEBUG_TUTORIAL_COMPLETED_LABEL = 'tutoriel termine'
const DEBUG_AUTOMATION_FOLDER_TITLE = '⏸ Automation'
const DEBUG_AUTOMATION_ENABLED_KEY = 'autoFlowEnabled'
const INITIAL_OBJECTIVE_CONTEXT = Object.freeze({
    source: 'tutorial'
})
const POST_TUTORIAL_OBJECTIVE_KEY = 'intro_follow_bloom'
const INTRO_DIALOGUE_END_EVENT = 'end.experienceIntroObjective'
const TUTORIAL_START_DELAY_MS = 8000
const TUTORIAL_READY_POLL_INTERVAL_MS = 100
const HIDE_UI_URL_PARAM = 'hideui'
const HIDE_UI_BODY_CLASS = 'is-ui-hidden'

function readBooleanUrlParam(paramName)
{
    if(typeof window === 'undefined')
    {
        return false
    }

    const rawValue = new URLSearchParams(window.location.search).get(paramName)
    if(typeof rawValue !== 'string')
    {
        return false
    }

    const normalizedValue = rawValue.trim().toLowerCase()
    return normalizedValue === 'true' || normalizedValue === '1'
}

export default class Experience
{
    constructor(canvas, options = {})
    {
        if(instance)
        {
            return instance
        }
        instance = this

        if(!canvas)
        {
            throw new Error('Le premier new Experience(...) doit recevoir un canvas.')
        }

        window.experience = this

        this.canvas = canvas
        this.runtimeFlags = {
            hideUi: options?.hideUi === true || readBooleanUrlParam(HIDE_UI_URL_PARAM)
        }
        this.syncUiVisibilityClass()
        this.inputs = new InputManager({ canvas: this.canvas })

        this.debug = new Debug({ inputs: this.inputs })
        this.metierEnum = MetierEnum
        this.actionId = ActionId
        this.metierManager = new MetierManager()
        this.sizes = new Sizes()
        this.time = new Time()
        this.actionTracker = new ActionTracker()
        this.dialogueManager = new DialogueManager()
        this.objectiveManager = new ObjectiveManager()
        this.badgeManager = new BadgeManager()
        this.scene = new THREE.Scene()
        this.resources = new Resources(bootSources, {
            autoStart: false
        })
        this.sound = new SoundManager(this)
        this.sound.init?.()
        this.camera = new Camera()
        this.renderer = new Renderer()
        this.sceneManager = new SceneManager()
        this.tutoriel = new Tutoriel()
        this.bloom = null

        this.resources.on(EventEnum.READY, () =>
        {
            if (this.bloom) return;
            
            this.bloom = new Bloom({
                motion: {
                    center: { x: 2.5, y: 2.0, z: 2.5 },
                    radius: 0
                },
                follow: {
                    target: null, // Sera défini par les scènes
                    groundMeshes: [],
                    groundMaxSnapUp: 0.65
                },
                rails: {
                    lines: [],
                    speed: 3.8,
                    railSwitchDistance: 0.9,
                    endpointSwitchDistance: 1.6,
                    showHelpers: false
                }
            })
        })

        this.menu = new Menu(this)
        this.hasStartedIntroDialogue = false
        this.tutorialStartTimeoutId = null
        this.tutorialReadyPollTimeoutId = null
        this.onIntroDialogueEnd = ({ key } = {}) =>
        {
            if(key !== this.dialogueManager?.repository?.getTutorialCompletedDialogueKey?.())
            {
                return
            }

            this.dialogueManager?.off?.(INTRO_DIALOGUE_END_EVENT)
            this.objectiveManager?.showByKey?.(POST_TUTORIAL_OBJECTIVE_KEY, INITIAL_OBJECTIVE_CONTEXT)
        }
        this.debugTutorialFolder = null
        this.debugAutomationFolder = null
        this.debugTutorialState = {
            [DEBUG_TUTORIAL_COMPLETED_KEY]: false
        }
        this.debugAutomationState = {
            [DEBUG_AUTOMATION_ENABLED_KEY]: true
        }
        this.sceneStartSnapshots = new Map()

        this.menu.start().then(() =>
        {
            this.sceneManager.start()
            this.tutoriel.on('finished', this.handleTutorialFinished)

            if(this.shouldBypassTutorialForDebug())
            {
                this.handleTutorialFinished({ forceStartDialogue: true })
                return
            }

            this.scheduleTutorialStart()
        })

        this.setDebugTutorial()
        this.setDebugAutomation()

        this.time.on(`${EventEnum.TICK}.experience`, () =>
        {
            this.update()
        })
    }

    update()
    {
        const hasRuntimeFocus = document.hasFocus?.() ?? true

        if(hasRuntimeFocus)
        {
            this.sceneManager.update(this.time.delta)
        }

        this.tutoriel?.update(this.time.delta)
        this.bloom?.update()
        this.sound?.update?.(this.time.delta)
        this.camera.update()
        this.renderer.update()
        this.debug.update()
    }

    destroy()
    {
        this.clearTutorialStartTimeout()
        this.clearTutorialReadyPollTimeout()
        this.time.off(`${EventEnum.TICK}.experience`)

        this.sceneManager.destroy?.()
        this.metierManager.destroy?.()
        this.actionTracker.destroy?.()
        this.dialogueManager?.off?.(INTRO_DIALOGUE_END_EVENT)
        this.tutoriel?.off?.('finished')
        this.dialogueManager.destroy?.()
        this.objectiveManager.destroy?.()
        this.badgeManager.destroy?.()
        this.tutoriel?.destroy?.()
        this.bloom?.destroy?.()
        this.bloom = null
        this.menu?.destroy?.()
        this.sound?.destroy?.()
        this.debugTutorialFolder?.dispose?.()
        this.debugTutorialFolder = null
        this.debugAutomationFolder?.dispose?.()
        this.debugAutomationFolder = null
        this.debug.destroy()
        this.inputs?.destroy?.()
        this.camera.destroy?.()
        this.renderer.destroy?.()

        this.sizes.destroy()
        this.time.destroy()

        this.renderer.instance.dispose()
        document.body.classList.remove(HIDE_UI_BODY_CLASS)
        instance = null
        if(window.experience === this)
        {
            delete window.experience
        }
    }

    setTutorialCompleted(isCompleted)
    {
        this.debugTutorialState[DEBUG_TUTORIAL_COMPLETED_KEY] = isCompleted === true
    }

    isAutoFlowEnabled()
    {
        return this.debugAutomationState?.[DEBUG_AUTOMATION_ENABLED_KEY] !== false
    }

    isUiHidden()
    {
        return this.runtimeFlags?.hideUi === true
    }

    syncUiVisibilityClass()
    {
        document.body.classList.toggle(HIDE_UI_BODY_CLASS, this.isUiHidden())
    }

    shouldBypassTutorialForDebug()
    {
        return this.debug?.isDebugEnabled === true
    }

    scheduleTutorialStart()
    {
        this.clearTutorialStartTimeout()

        if(this.isTutorialRuntimeReady())
        {
            this.startTutorialAfterDelay()
            return
        }

        this.clearTutorialReadyPollTimeout()
        this.tutorialReadyPollTimeoutId = window.setTimeout(() =>
        {
            this.tutorialReadyPollTimeoutId = null
            this.scheduleTutorialStart()
        }, TUTORIAL_READY_POLL_INTERVAL_MS)
    }

    isTutorialRuntimeReady()
    {
        if(!this.resources?.isReady)
        {
            return false
        }

        const player = this.sceneManager?.currentScene?.world?.player
        return Boolean(player)
    }

    startTutorialAfterDelay()
    {
        this.clearTutorialStartTimeout()
        this.tutorialStartTimeoutId = window.setTimeout(() =>
        {
            this.tutorialStartTimeoutId = null
            this.objectiveManager?.showInitialObjective?.(INITIAL_OBJECTIVE_CONTEXT)
            this.tutoriel?.start?.()
        }, TUTORIAL_START_DELAY_MS)
    }

    clearTutorialStartTimeout()
    {
        if(this.tutorialStartTimeoutId === null)
        {
            return
        }

        window.clearTimeout(this.tutorialStartTimeoutId)
        this.tutorialStartTimeoutId = null
    }

    clearTutorialReadyPollTimeout()
    {
        if(this.tutorialReadyPollTimeoutId === null)
        {
            return
        }

        window.clearTimeout(this.tutorialReadyPollTimeoutId)
        this.tutorialReadyPollTimeoutId = null
    }

    handleTutorialFinished = ({ forceStartDialogue = false } = {}) =>
    {
        if(this.hasStartedIntroDialogue)
        {
            return
        }

        if(!forceStartDialogue && !this.isAutoFlowEnabled())
        {
            return
        }

        this.clearTutorialStartTimeout()
        this.clearTutorialReadyPollTimeout()
        this.hasStartedIntroDialogue = true
        this.setTutorialCompleted(true)
        this.objectiveManager?.completeCurrentObjective?.()

        const configuredDialogueKey = this.dialogueManager?.repository?.getTutorialCompletedDialogueKey?.()
        if(!configuredDialogueKey)
        {
            return
        }

        if(this.sceneManager?.currentKey !== SceneEnum.MAP)
        {
            return
        }

        this.dialogueManager?.off?.(INTRO_DIALOGUE_END_EVENT)
        this.dialogueManager?.on?.(INTRO_DIALOGUE_END_EVENT, this.onIntroDialogueEnd)
        this.dialogueManager?.startByKey?.(configuredDialogueKey)
    }

    setAutoFlowEnabled(enabled)
    {
        this.debugAutomationState[DEBUG_AUTOMATION_ENABLED_KEY] = enabled === true
    }

    createProgressSnapshot()
    {
        return {
            metierValues: this.metierManager?.getValues?.() ?? {},
            actionTracker: this.actionTracker?.getState?.() ?? { doneById: {}, timeline: [] },
            dialogue: {
                flags: this.dialogueManager?.getFlagsSnapshot?.() ?? {}
            },
            badges: this.badgeManager?.getUnlockedKeys?.() ?? [],
            objectives: this.objectiveManager?.getStateSnapshot?.() ?? {
                state: null,
                completedObjectives: {}
            },
            tutorial: {
                completed: this.debugTutorialState?.[DEBUG_TUTORIAL_COMPLETED_KEY] === true,
                hasStartedIntroDialogue: this.hasStartedIntroDialogue === true
            }
        }
    }

    applyProgressSnapshot(snapshot = {})
    {
        this.dialogueManager?.restoreRuntimeSnapshot?.({
            flags: snapshot?.dialogue?.flags ?? {}
        })
        this.metierManager?.setValues?.(snapshot?.metierValues ?? {})
        this.actionTracker?.restoreState?.(snapshot?.actionTracker ?? {})
        this.badgeManager?.setUnlockedKeys?.(snapshot?.badges ?? [])
        this.objectiveManager?.restoreStateSnapshot?.(snapshot?.objectives ?? {})

        const tutorialCompleted = snapshot?.tutorial?.completed === true
        this.setTutorialCompleted(tutorialCompleted)
        this.hasStartedIntroDialogue = snapshot?.tutorial?.hasStartedIntroDialogue === true
    }

    captureSceneStartCheckpoint(sceneKey)
    {
        if(typeof sceneKey !== 'string' || sceneKey.trim() === '')
        {
            return
        }

        this.sceneStartSnapshots.set(sceneKey, this.createProgressSnapshot())
    }

    restartCurrentSceneFromStart()
    {
        const currentSceneKey = this.sceneManager?.currentKey ?? null
        if(!currentSceneKey)
        {
            return
        }

        this.camera?.resetFov?.()

        const checkpoint = this.sceneStartSnapshots.get(currentSceneKey)
        if(checkpoint)
        {
            this.applyProgressSnapshot(checkpoint)
        }

        this.sceneManager?.switchTo?.(currentSceneKey, {
            force: true
        })

        if(currentSceneKey === SceneEnum.MAP)
        {
            this.startIntroDialogueAfterMapRestart()
        }
    }

    startIntroDialogueAfterMapRestart()
    {
        this.tutoriel?.complete?.({
            immediate: true,
            emitFinished: false
        })
        this.setTutorialCompleted(true)
        this.hasStartedIntroDialogue = false
        this.dialogueManager?.off?.(INTRO_DIALOGUE_END_EVENT)

        const tryStart = () =>
        {
            if(this.sceneManager?.isTransitioning)
            {
                window.setTimeout(tryStart, 50)
                return
            }

            this.handleTutorialFinished({
                forceStartDialogue: true
            })
        }

        tryStart()
    }

    restartFromBeginning()
    {
        this.camera?.resetFov?.()
        this.dialogueManager?.resetRuntimeProgress?.()
        this.metierManager?.resetAll?.()
        this.actionTracker?.reset?.()
        this.badgeManager?.reset?.()
        this.objectiveManager?.resetProgress?.()
        this.objectiveManager?.showInitialObjective?.(INITIAL_OBJECTIVE_CONTEXT)
        this.tutoriel?.restart?.()
        this.setTutorialCompleted(false)
        this.hasStartedIntroDialogue = false
        this.dialogueManager?.off?.(INTRO_DIALOGUE_END_EVENT)
        this.sceneStartSnapshots.clear()
        this.sceneManager?.switchTo?.(this.sceneManager?.getInitialScene?.(), {
            force: true
        })
    }

    setDebugTutorial()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugTutorialFolder = this.debug.addFolder(DEBUG_TUTORIAL_FOLDER_TITLE, { expanded: false })
        this.debug
            .addBinding(this.debugTutorialFolder, this.debugTutorialState, DEBUG_TUTORIAL_COMPLETED_KEY, {
                label: DEBUG_TUTORIAL_COMPLETED_LABEL
            })
            ?.on?.('change', (event) =>
            {
                const shouldBeCompleted = event.value === true
                if(shouldBeCompleted)
                {
                    this.tutoriel?.complete?.({
                        immediate: true,
                        emitFinished: true
                    })
                    return
                }

                this.setTutorialCompleted(false)
                this.objectiveManager?.showInitialObjective?.(INITIAL_OBJECTIVE_CONTEXT)
                this.tutoriel?.restart?.()
            })
    }

    setDebugAutomation()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugAutomationFolder = this.debug.addFolder(DEBUG_AUTOMATION_FOLDER_TITLE, { expanded: false })
        this.debug.addManualBinding(this.debugAutomationFolder, this.debugAutomationState, DEBUG_AUTOMATION_ENABLED_KEY, {
            label: 'auto scenes/dialogues',
            readonly: true
        }, 'auto')

        this.debug.addButtons(this.debugAutomationFolder, {
            label: 'Auto flow',
            columns: 2,
            buttons: [
                {
                    label: 'Stop auto',
                    onClick: () =>
                    {
                        this.setAutoFlowEnabled(false)
                    }
                },
                {
                    label: 'Resume auto',
                    onClick: () =>
                    {
                        this.setAutoFlowEnabled(true)
                    }
                }
            ]
        })
    }
}
