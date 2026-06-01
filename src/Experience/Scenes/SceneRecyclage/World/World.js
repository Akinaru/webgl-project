import Experience from '../../../Experience.js'
import * as THREE from 'three'
import EventEnum from '../../../Enum/EventEnum.js'
import SceneEnum from '../../../Enum/SceneEnum.js'
import Player from '../../../Common/Characters/Player.js'
import MapEnvironment from '../../Map/World/MapEnvironment.js'
import MapLight from '../../Map/World/MapLight.js'
import SceneRecyclageModel from './Model.js'
import SceneRecyclageWalls from './Walls/Walls.js'
import { setupSceneRecyclageWorldDebug } from './World.debug.js'
import * as SceneRecyclageWorldConstants from './World.constants.js'
import { pickCycledSceneMusic } from '../../../Audio/SceneMusicPicker.js'
import { SCENE_RECYCLAGE_VARIANTS } from '../SceneRecyclage.config.js'
import CenterScreenRaycaster from '../../../Utils/CenterScreenRaycaster.js'

let recyclageWorldInstanceIndex = 0
const VALIDATION_BUTTON_NAME_TOKEN = 'button_right'
const VALIDATION_BUTTON_MAX_DISTANCE = 2.6

export default class SceneRecyclageWorld
{
    constructor(variantConfig = SCENE_RECYCLAGE_VARIANTS[SceneEnum.RECYCLAGE])
    {
        this.experience = new Experience()
        this.resources = this.experience.resources
        this.variantConfig = variantConfig
        this.readyEventName = `${EventEnum.READY}.recyclageWorld${recyclageWorldInstanceIndex++}`
        this.hasStartedArrivalDialogue = false
        this.hasCompletedScene = false
        this.isValidationInteractionEnabled = false
        this.hasTriggeredValidationDialogue = false
        this.validationButtonMeshes = []
        this.centerRaycaster = new CenterScreenRaycaster({
            getCamera: () => this.experience.camera?.instance ?? null
        })

        this.onDialogueEnd = ({ key } = {}) =>
        {
            if(key === this.variantConfig.arrivalDialogueKey)
            {
                if(this.variantConfig.validationDialogueKey)
                {
                    this.isValidationInteractionEnabled = true
                    return
                }

                this.completeScene()
                return
            }

            if(this.variantConfig.validationDialogueKey && key === this.variantConfig.validationDialogueKey)
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
        this.recyclageModel = new SceneRecyclageModel({
            resourceKey: this.variantConfig.modelResourceKey
        })
        this.walls = new SceneRecyclageWalls({
            recyclageModel: this.recyclageModel,
            debugParentFolder: this.debugFolder
        })
        this.collectValidationButtonMeshes()
        this.player = new Player({
            groundHeight: 0,
            boundaryRadius: this.recyclageModel.getBoundaryRadius?.() ?? 48,
            boundaryBox: this.recyclageModel.getBoundaryBox?.() ?? null,
            collisionBoxes: [],
            useBoxCollisionResolution: false,
            useMeshCollisionRaycast: true,
            collisionMeshes: this.recyclageModel.getCollisionMeshes?.() ?? [],
            groundMeshes: this.recyclageModel.getGroundMeshes?.() ?? [],
            spawnPosition: this.variantConfig.spawnPosition ?? this.recyclageModel.getSpawnPosition?.(),
            spawnYaw: THREE.MathUtils.degToRad(this.variantConfig.spawnYawDeg ?? 0),
            spawnPitch: THREE.MathUtils.degToRad(this.variantConfig.spawnPitchDeg ?? 0)
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

    collectValidationButtonMeshes()
    {
        this.validationButtonMeshes = []

        const root = this.recyclageModel?.model
        if(!root)
        {
            return
        }

        root.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            const normalizedName = String(child.name || '').trim().toLowerCase()
            if(normalizedName.includes(VALIDATION_BUTTON_NAME_TOKEN))
            {
                this.validationButtonMeshes.push(child)
            }
        })
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

        if(this.experience?.isAutoFlowEnabled?.() === false)
        {
            return
        }

        this.hasStartedArrivalDialogue = true
        this.experience.dialogueManager?.on?.('end.recyclageWorld', this.onDialogueEnd)
        this.inputs = this.experience.inputs
        this.onInteractDown = () =>
        {
            this.handleValidationInteraction()
        }
        this.inputs?.on?.('sceneinteractdown.recyclageWorld', this.onInteractDown)
        this.experience.dialogueManager?.startByKey?.(this.variantConfig.arrivalDialogueKey)
    }

    handleValidationInteraction()
    {
        if(this.isValidationInteractionEnabled !== true || this.hasTriggeredValidationDialogue === true)
        {
            return
        }

        if(!Array.isArray(this.validationButtonMeshes) || this.validationButtonMeshes.length === 0)
        {
            return
        }

        const hit = this.centerRaycaster.intersectFirstHit(this.validationButtonMeshes, false)
        if(!hit?.object || !Number.isFinite(hit.distance) || hit.distance > VALIDATION_BUTTON_MAX_DISTANCE)
        {
            return
        }

        this.hasTriggeredValidationDialogue = true
        this.isValidationInteractionEnabled = false
        this.experience.dialogueManager?.startByKey?.(this.variantConfig.validationDialogueKey)
    }

    completeScene()
    {
        if(this.hasCompletedScene)
        {
            return
        }

        if(this.experience?.isAutoFlowEnabled?.() === false)
        {
            return
        }

        if(this.variantConfig.completionBadgeKey)
        {
            this.experience.badgeManager?.unlock?.(this.variantConfig.completionBadgeKey)
        }
        this.hasCompletedScene = true
        this.completeSceneTimeout = window.setTimeout(() =>
        {
            this.experience.sceneManager?.switchTo?.(this.variantConfig.completionTargetScene ?? SceneEnum.DISTRIBUTION)
        }, SceneRecyclageWorldConstants.RECYCLAGE_DISTRIBUTION_SWITCH_DELAY_MS)
    }

    syncAmbientSound()
    {
        if(this.experience.sound?.isAnySoundPlaying?.(this.variantConfig.ambientSoundKeys))
        {
            return
        }

        const musicKey = pickCycledSceneMusic(
            this.variantConfig.musicStorageKey,
            this.variantConfig.ambientSoundKeys
        )

        if(!musicKey)
        {
            return
        }

        this.experience.sound?.stopChannel?.('music')
        this.experience.sound?.play?.(musicKey, {
            channel: 'music'
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
        this.inputs?.off?.('sceneinteractdown.recyclageWorld')

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

        if(this.walls)
        {
            this.walls.destroy?.()
            this.walls = null
        }

        if(this.environment)
        {
            this.environment.destroy?.()
            this.environment = null
        }

        this.experience.sound?.stopChannel?.(SceneRecyclageWorldConstants.RECYCLAGE_AMBIENT_CHANNEL)

        if(this.light)
        {
            this.light.destroy?.()
            this.light = null
        }

        this.debugFolder?.dispose?.()
        this.debugFolder = null
    }
}
