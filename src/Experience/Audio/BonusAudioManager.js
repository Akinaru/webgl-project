import * as THREE from 'three'
import Experience from '../Experience.js'
import SceneEnum from '../Enum/SceneEnum.js'
import * as BonusAudioConstants from './BonusAudioManager.constants.js'

function createSceneState()
{
    return {
        hasPlayedTooFarDuringDialogue: false,
        hasPlayedTooFarWithoutDialogue: false,
        hasPlayedActivityReminder: false
    }
}

export default class BonusAudioManager
{
    constructor()
    {
        this.experience = new Experience()
        this.sceneStateByKey = new Map()
        this.currentSceneKey = null
        this.activeBonusPlayback = null
        this.pendingDialogueRestart = null
        this.idleSinceMs = performance.now()
        this.lastPlayerPosition = new THREE.Vector3()
        this.lastCameraQuaternion = new THREE.Quaternion()
        this.hasMovementSnapshot = false
    }

    update()
    {
        this.sceneManager = this.experience.sceneManager
        this.dialogueManager = this.experience.dialogueManager
        this.sound = this.experience.sound

        const now = performance.now()
        const sceneKey = this.sceneManager?.currentKey ?? null
        this.syncSceneState(sceneKey)

        if(this.updateActiveBonusPlayback(sceneKey) === true)
        {
            return
        }

        if(this.tryPlayDistanceBonus(sceneKey) === true)
        {
            return
        }

        if(this.tryPlayActivityReminder(sceneKey, now) === true)
        {
            return
        }

        this.tryPlayIdleReminder(sceneKey, now)
    }

    syncSceneState(sceneKey = null)
    {
        if(sceneKey === this.currentSceneKey)
        {
            return
        }

        this.currentSceneKey = sceneKey
        this.pendingDialogueRestart = null
        this.idleSinceMs = performance.now()
        this.hasMovementSnapshot = false
    }

    getSceneState(sceneKey = '')
    {
        const normalizedKey = String(sceneKey || '')
        if(!this.sceneStateByKey.has(normalizedKey))
        {
            this.sceneStateByKey.set(normalizedKey, createSceneState())
        }

        return this.sceneStateByKey.get(normalizedKey)
    }

    getCurrentWorld()
    {
        return this.sceneManager?.currentScene?.world ?? null
    }

    getCurrentPlayer()
    {
        return this.getCurrentWorld()?.player ?? null
    }

    getBloomAnchorPosition()
    {
        const bloom = this.experience?.bloom ?? null
        const bloomObject = bloom?.model ?? bloom?.fallback ?? null
        return bloomObject?.position ?? null
    }

    isPlayerTooFarFromBloom()
    {
        const playerPosition = this.getCurrentPlayer()?.position ?? null
        const bloomPosition = this.getBloomAnchorPosition()
        if(!playerPosition || !bloomPosition)
        {
            return false
        }

        const dx = (playerPosition.x ?? 0) - (bloomPosition.x ?? 0)
        const dz = (playerPosition.z ?? 0) - (bloomPosition.z ?? 0)
        return ((dx * dx) + (dz * dz)) > BonusAudioConstants.BONUS_TOO_FAR_DISTANCE_SQ
    }

    tryPlayDistanceBonus(sceneKey = null)
    {
        if(!sceneKey || !this.isPlayerTooFarFromBloom())
        {
            return false
        }

        const sceneState = this.getSceneState(sceneKey)
        if(this.dialogueManager?.isRunning?.() === true)
        {
            if(sceneState.hasPlayedTooFarDuringDialogue)
            {
                return false
            }

            const dialogueKey = this.dialogueManager?.state?.dialogueKey ?? null
            if(typeof dialogueKey !== 'string' || dialogueKey.trim() === '')
            {
                return false
            }

            sceneState.hasPlayedTooFarDuringDialogue = true
            this.pendingDialogueRestart = {
                sceneKey,
                dialogueKey,
                nodeId: this.dialogueManager?.state?.nodeId ?? null,
                context: {
                    ...(this.dialogueManager?.state?.context ?? {})
                }
            }
            this.dialogueManager?.skip?.({ startNextQueued: false })
            const hasPlayed = this.playBonusSound(BonusAudioConstants.BONUS_SOUND_NAMES.TOO_FAR_DURING_DIALOGUE, {
                sceneKey,
                onComplete: () =>
                {
                    if(this.pendingDialogueRestart?.sceneKey !== sceneKey)
                    {
                        return
                    }

                    const restartPayload = this.pendingDialogueRestart
                    this.pendingDialogueRestart = null

                    if(this.sceneManager?.currentKey !== sceneKey || this.dialogueManager?.isRunning?.() === true)
                    {
                        return
                    }

                    if(typeof restartPayload.nodeId === 'string' && restartPayload.nodeId.trim() !== '')
                    {
                        this.dialogueManager?.startByKeyAtNode?.(restartPayload.dialogueKey, restartPayload.nodeId, restartPayload.context)
                        return
                    }

                    this.dialogueManager?.startByKey?.(restartPayload.dialogueKey, restartPayload.context)
                }
            })
            if(hasPlayed !== true)
            {
                const restartPayload = this.pendingDialogueRestart
                this.pendingDialogueRestart = null
                if(restartPayload && this.sceneManager?.currentKey === sceneKey && this.dialogueManager?.isRunning?.() !== true)
                {
                    if(typeof restartPayload.nodeId === 'string' && restartPayload.nodeId.trim() !== '')
                    {
                        this.dialogueManager?.startByKeyAtNode?.(restartPayload.dialogueKey, restartPayload.nodeId, restartPayload.context)
                        return true
                    }

                    this.dialogueManager?.startByKey?.(restartPayload.dialogueKey, restartPayload.context)
                }
            }
            return true
        }

        if(sceneState.hasPlayedTooFarWithoutDialogue)
        {
            return false
        }

        sceneState.hasPlayedTooFarWithoutDialogue = true
        const randomOptions = BonusAudioConstants.BONUS_SOUND_NAMES.TOO_FAR_IDLE_OPTIONS
        const randomIndex = Math.floor(Math.random() * randomOptions.length)
        this.playBonusSound(randomOptions[randomIndex], { sceneKey })
        return true
    }

    tryPlayActivityReminder(sceneKey = null, now = performance.now())
    {
        if(sceneKey !== SceneEnum.RECUPERATION)
        {
            return false
        }

        const sceneState = this.getSceneState(sceneKey)
        if(sceneState.hasPlayedActivityReminder)
        {
            return false
        }

        const activityAvailableSinceMs = this.getRecuperationActivityReminderStartMs()
        if(activityAvailableSinceMs === null)
        {
            return false
        }

        if(this.dialogueManager?.isRunning?.() === true)
        {
            return false
        }

        if(now - activityAvailableSinceMs < BonusAudioConstants.BONUS_ACTIVITY_REMINDER_DELAY_MS)
        {
            return false
        }

        sceneState.hasPlayedActivityReminder = true
        this.playBonusSound(BonusAudioConstants.BONUS_SOUND_NAMES.ACTIVITY_REMINDER, { sceneKey })
        return true
    }

    getRecuperationActivityReminderStartMs()
    {
        const world = this.getCurrentWorld()
        if(this.sceneManager?.currentKey !== SceneEnum.RECUPERATION || !world)
        {
            return null
        }

        const completedAtMs = world.tubeRoom015CompletedAtMs
        if(!Number.isFinite(completedAtMs))
        {
            return null
        }

        return completedAtMs
    }

    tryPlayIdleReminder(sceneKey = null, now = performance.now())
    {
        if(!sceneKey)
        {
            this.idleSinceMs = now
            return false
        }

        if(this.isIdleBlocked(now))
        {
            this.idleSinceMs = now
            return false
        }

        if(this.didPlayerMoveOrLook())
        {
            this.idleSinceMs = now
            return false
        }

        if(now - this.idleSinceMs < BonusAudioConstants.BONUS_IDLE_INTERVAL_MS)
        {
            return false
        }

        this.idleSinceMs = now
        this.playBonusSound(BonusAudioConstants.BONUS_SOUND_NAMES.IDLE_REPEAT, { sceneKey })
        return true
    }

    isIdleBlocked(now = performance.now())
    {
        if(this.dialogueManager?.isRunning?.() === true)
        {
            return true
        }

        if(this.sound?.isChannelPlaying?.('dialogue') === true)
        {
            return true
        }

        const lastSoundPlayedAtMs = this.sound?.getLastSoundPlayedAtMs?.() ?? 0
        return lastSoundPlayedAtMs > 0
            && (now - lastSoundPlayedAtMs) < BonusAudioConstants.BONUS_AUDIO_RECENT_WINDOW_MS
    }

    didPlayerMoveOrLook()
    {
        const playerPosition = this.getCurrentPlayer()?.position ?? null
        const cameraQuaternion = this.experience?.camera?.instance?.quaternion ?? null
        if(!playerPosition || !cameraQuaternion)
        {
            this.hasMovementSnapshot = false
            return true
        }

        if(this.hasMovementSnapshot !== true)
        {
            this.lastPlayerPosition.copy(playerPosition)
            this.lastCameraQuaternion.copy(cameraQuaternion)
            this.hasMovementSnapshot = true
            return true
        }

        const movedDistanceSq = this.lastPlayerPosition.distanceToSquared(playerPosition)
        const cameraDot = Math.abs(this.lastCameraQuaternion.dot(cameraQuaternion))
        const cameraMoved = (1 - cameraDot) > BonusAudioConstants.BONUS_CAMERA_QUATERNION_DOT_EPSILON

        this.lastPlayerPosition.copy(playerPosition)
        this.lastCameraQuaternion.copy(cameraQuaternion)

        return movedDistanceSq > BonusAudioConstants.BONUS_MOVEMENT_EPSILON_SQ || cameraMoved
    }

    playBonusSound(soundName = '', { sceneKey = null, onComplete = null } = {})
    {
        if(typeof soundName !== 'string' || soundName.trim() === '')
        {
            return false
        }

        this.sound?.unlock?.()
        const played = this.sound?.play?.(soundName) === true
        if(!played)
        {
            return false
        }

        this.activeBonusPlayback = {
            soundName,
            sceneKey,
            onComplete: typeof onComplete === 'function' ? onComplete : null
        }
        return true
    }

    updateActiveBonusPlayback(sceneKey = null)
    {
        if(!this.activeBonusPlayback)
        {
            return false
        }

        if(this.activeBonusPlayback.sceneKey && sceneKey && this.activeBonusPlayback.sceneKey !== sceneKey)
        {
            if(this.sound?.isSoundPlaying?.(this.activeBonusPlayback.soundName))
            {
                this.sound?.stopDialogue?.()
            }
            this.activeBonusPlayback = null
            this.pendingDialogueRestart = null
            return false
        }

        if(this.sound?.isSoundPlaying?.(this.activeBonusPlayback.soundName) === true)
        {
            return true
        }

        const completedPlayback = this.activeBonusPlayback
        this.activeBonusPlayback = null
        completedPlayback.onComplete?.()
        return false
    }

    destroy()
    {
        this.activeBonusPlayback = null
        this.pendingDialogueRestart = null
        this.sceneStateByKey.clear()
        this.hasMovementSnapshot = false
    }
}
