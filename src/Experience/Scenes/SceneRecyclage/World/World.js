import Experience from '../../../Experience.js'
import EventEnum from '../../../Enum/EventEnum.js'
import SceneEnum from '../../../Enum/SceneEnum.js'
import Player from '../../../Common/Characters/Player.js'
import MapEnvironment from '../../Map/World/MapEnvironment.js'
import MapLight from '../../Map/World/MapLight.js'
import SceneRecyclageModel from './Model.js'
import { setupSceneRecyclageWorldDebug } from './World.debug.js'
import * as SceneRecyclageWorldConstants from './World.constants.js'

let recyclageWorldInstanceIndex = 0

export default class SceneRecyclageWorld
{
    constructor()
    {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.readyEventName = `${EventEnum.READY}.recyclageWorld${recyclageWorldInstanceIndex++}`
        this.hasStartedArrivalDialogue = false
        this.hasStartedInstructionDialogue = false
        this.hasCompletedScene = false

        this.onDialogueEnd = ({ key } = {}) =>
        {
            if(key === SceneRecyclageWorldConstants.RECYCLAGE_ARRIVAL_DIALOGUE_KEY)
            {
                this.startInstructionDialogue()
                return
            }

            if(key === SceneRecyclageWorldConstants.RECYCLAGE_INSTRUCTIONS_DIALOGUE_KEY)
            {
                this.completeScene()
            }
        }

        if(this.resources.isReady)
        {
            this.setUp()
            return
        }

        this.resources.on(this.readyEventName, () =>
        {
            this.setUp()
        })
    }

    setUp()
    {
        if(this.isSetUp)
        {
            return
        }
        this.isSetUp = true

        this.setDebug()
        this.environment = new MapEnvironment()
        this.recyclageModel = new SceneRecyclageModel()
        this.player = new Player({
            groundHeight: 0,
            boundaryRadius: this.recyclageModel.getBoundaryRadius?.() ?? 48,
            boundaryBox: this.recyclageModel.getBoundaryBox?.() ?? null,
            collisionBoxes: [],
            useBoxCollisionResolution: false,
            useMeshCollisionRaycast: true,
            collisionMeshes: this.recyclageModel.getCollisionMeshes?.() ?? [],
            groundMeshes: this.recyclageModel.getGroundMeshes?.() ?? [],
            spawnPosition: this.recyclageModel.getSpawnPosition?.(),
            spawnYaw: 0
        })
        this.light = new MapLight({
            environment: this.environment,
            getFocusPosition: () => this.player?.position ?? null,
            debugParentFolder: this.debugFolder
        })

        if(this.experience.bloom)
        {
            this.experience.bloom.setSceneContext({
                scene: this.experience.scene,
                groundMeshes: this.recyclageModel.getGroundMeshes?.() ?? [],
                rails: [],
                target: this.player
            })
        }

        this.startArrivalDialogue()
    }

    setDebug()
    {
        setupSceneRecyclageWorldDebug.call(this)
    }

    startArrivalDialogue()
    {
        if(this.hasStartedArrivalDialogue)
        {
            return
        }

        this.hasStartedArrivalDialogue = true
        this.experience.dialogueManager?.on?.('end.recyclageWorld', this.onDialogueEnd)
        this.experience.dialogueManager?.startByKey?.(SceneRecyclageWorldConstants.RECYCLAGE_ARRIVAL_DIALOGUE_KEY)
    }

    startInstructionDialogue()
    {
        if(this.hasStartedInstructionDialogue)
        {
            return
        }

        this.hasStartedInstructionDialogue = true
        this.experience.dialogueManager?.startByKey?.(SceneRecyclageWorldConstants.RECYCLAGE_INSTRUCTIONS_DIALOGUE_KEY)
    }

    completeScene()
    {
        if(this.hasCompletedScene)
        {
            return
        }

        this.hasCompletedScene = true
        this.completeSceneTimeout = window.setTimeout(() =>
        {
            this.experience.sceneManager?.switchTo?.(SceneEnum.DISTRIBUTION)
        }, SceneRecyclageWorldConstants.RECYCLAGE_DISTRIBUTION_SWITCH_DELAY_MS)
    }

    syncAmbientSound()
    {
        if(this.experience.sound?.isChannelPlaying?.(SceneRecyclageWorldConstants.RECYCLAGE_AMBIENT_CHANNEL))
        {
            return
        }

        this.experience.sound?.play?.(SceneRecyclageWorldConstants.RECYCLAGE_AMBIENT_SOUND_KEY, {
            channel: SceneRecyclageWorldConstants.RECYCLAGE_AMBIENT_CHANNEL
        })
    }

    update(delta = this.experience.time.delta)
    {
        this.syncAmbientSound()
        this.light?.update?.(delta)
        this.player?.update?.(delta)
    }

    destroy()
    {
        this.resources.off(this.readyEventName)
        this.experience.dialogueManager?.off?.('end.recyclageWorld')

        if(this.completeSceneTimeout)
        {
            window.clearTimeout(this.completeSceneTimeout)
            this.completeSceneTimeout = null
        }

        if(this.player)
        {
            this.player.destroy?.()
            this.player = null
        }

        if(this.recyclageModel)
        {
            this.recyclageModel.destroy?.()
            this.recyclageModel = null
        }

        if(this.environment)
        {
            this.environment.destroy?.()
            this.environment = null
        }

        if(this.light)
        {
            this.light.destroy?.()
            this.light = null
        }

        this.debugFolder?.dispose?.()
        this.debugFolder = null
    }
}
