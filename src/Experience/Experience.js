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

export default class Experience
{
    constructor(canvas)
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
                    showHelpers: true
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

        this.dialogueManager?.off?.(INTRO_DIALOGUE_END_EVENT)
        this.dialogueManager?.on?.(INTRO_DIALOGUE_END_EVENT, this.onIntroDialogueEnd)
        this.dialogueManager?.startByKey?.(configuredDialogueKey)
    }

    setAutoFlowEnabled(enabled)
    {
        this.debugAutomationState[DEBUG_AUTOMATION_ENABLED_KEY] = enabled === true
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
