import * as THREE from 'three'
import Camera from './Camera.js'
import Renderer from './Renderer.js'
import Sizes from './Utils/Sizes.js'
import Time from './Utils/Time.js'
import Debug from './Utils/Debug.js'
import Resources from './Utils/Resources.js'
import sources from './Source/sources.js'
import EventEnum from './Enum/EventEnum.js'
import SceneManager from './Scenes/SceneManager.js'
import MetierManager from './Metiers/MetierManager.js'
import MetierEnum from './Enum/MetierEnum.js'
import ActionId from './Actions/ActionId.js'
import ActionTracker from './Actions/ActionTracker.js'
import DialogueManager from './Dialogues/DialogueManager.js'
import Menu from './Menu/Menu.js'
import InputManager from './Inputs/InputManager.js'
import SoundManager from './Audio/SoundManager.js'

let instance = null

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
        this.scene = new THREE.Scene()
        this.resources = new Resources(sources, {
            autoStart: false
        })
        this.sound = new SoundManager(this)
        this.sound.init?.()
        this.camera = new Camera()
        this.renderer = new Renderer()
        this.sceneManager = new SceneManager()
        this.menu = new Menu(this)
        this.hasStartedIntroDialogue = false

        this.menu.start().then(() =>
        {
            if(this.hasStartedIntroDialogue)
            {
                return
            }

            this.hasStartedIntroDialogue = true
            this.dialogueManager?.startByKey?.('bloom.followup')
        })

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

        this.sound?.update?.(this.time.delta)
        this.camera.update()
        this.renderer.update()
        this.debug.update()
    }

    destroy()
    {
        this.time.off(`${EventEnum.TICK}.experience`)

        this.sceneManager.destroy?.()
        this.metierManager.destroy?.()
        this.actionTracker.destroy?.()
        this.dialogueManager.destroy?.()
        this.menu?.destroy?.()
        this.sound?.destroy?.()
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
}
