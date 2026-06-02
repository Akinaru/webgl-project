import EventEmitter from '../Utils/EventEmitter.js'
import * as InputBindingsConstants from '../Inputs/InputBindings.constants.js'
import * as PauseMenuConstants from './PauseMenu.constants.js'

export default class PauseMenu extends EventEmitter
{
    static OPEN = 1
    static OPENING = 2
    static CLOSED = 3
    static CLOSING = 4

    constructor({
        experience,
        isEnabled = () => true,
        canAutoOpen = () => true
    } = {})
    {
        super()

        this.experience = experience
        this.inputs = this.experience?.inputs || null
        this.canvas = this.experience?.canvas || null
        this.debug = this.experience?.debug || null
        this.isEnabled = typeof isEnabled === 'function' ? isEnabled : () => true
        this.canAutoOpen = typeof canAutoOpen === 'function' ? canAutoOpen : () => true
        this.traceEnabled = Boolean(this.debug?.isDebugEnabled)

        this.state = PauseMenu.CLOSED
        this.isInitialized = false
        this.wasPointerLockedBeforeOpen = false
        this.pointerLockWasActive = this.inputs?.isPointerLocked?.(this.canvas) || false
        this.pendingPointerLockRestore = false
        this.lastCanvasUnlockAt = -Infinity
        this.ignoreEscapeUntilMs = 0
        this.visibilityRafId = 0
        this.closeTimeoutId = 0
        this.lastVolumePreviewAt = {
            music: -Infinity,
            sfx: -Infinity
        }
        this.pendingKeybindAction = null
        this.keybindErrorTimeoutId = 0
        this.keybindErrorAction = null
        this.hoverableButtons = []

        this.root = document.querySelector(PauseMenuConstants.SELECTORS.root)
        this.resumeButton = document.querySelector(PauseMenuConstants.SELECTORS.resumeButton)
        this.restartSceneButton = document.querySelector(PauseMenuConstants.SELECTORS.restartSceneButton)
        this.restartAllButton = document.querySelector(PauseMenuConstants.SELECTORS.restartAllButton)
        this.settingsButton = document.querySelector(PauseMenuConstants.SELECTORS.settingsButton)
        this.infoButton = document.querySelector(PauseMenuConstants.SELECTORS.infoButton)
        this.confirmModal = document.querySelector(PauseMenuConstants.SELECTORS.confirmModal)
        this.confirmMessage = document.querySelector(PauseMenuConstants.SELECTORS.confirmMessage)
        this.confirmCancelButton = document.querySelector(PauseMenuConstants.SELECTORS.confirmCancelButton)
        this.confirmAcceptButton = document.querySelector(PauseMenuConstants.SELECTORS.confirmAcceptButton)
        this.infoModal = document.querySelector(PauseMenuConstants.SELECTORS.infoModal)
        this.infoCloseButton = document.querySelector(PauseMenuConstants.SELECTORS.infoCloseButton)
        this.settingsModal = document.querySelector(PauseMenuConstants.SELECTORS.settingsModal)
        this.settingsCloseButton = document.querySelector(PauseMenuConstants.SELECTORS.settingsCloseButton)
        this.audioEnabledToggle = document.querySelector(PauseMenuConstants.SELECTORS.audioEnabledToggle)
        this.audioControls = document.querySelector(PauseMenuConstants.SELECTORS.audioControls)
        this.musicVolumeSlider = document.querySelector(PauseMenuConstants.SELECTORS.musicVolumeSlider)
        this.musicVolumeValue = document.querySelector(PauseMenuConstants.SELECTORS.musicVolumeValue)
        this.sfxVolumeSlider = document.querySelector(PauseMenuConstants.SELECTORS.sfxVolumeSlider)
        this.sfxVolumeValue = document.querySelector(PauseMenuConstants.SELECTORS.sfxVolumeValue)
        this.dialogueVolumeSlider = document.querySelector(PauseMenuConstants.SELECTORS.dialogueVolumeSlider)
        this.dialogueVolumeValue = document.querySelector(PauseMenuConstants.SELECTORS.dialogueVolumeValue)
        this.graphicsQualityButtons = Array.from(document.querySelectorAll(PauseMenuConstants.SELECTORS.graphicsQualityButtons))
        this.keybindButtons = Array.from(document.querySelectorAll(PauseMenuConstants.SELECTORS.keybindButtons))
        this.resetAllButton = document.querySelector(PauseMenuConstants.SELECTORS.resetAllButton)

        this.hasUI = Boolean(
            this.root
            && this.resumeButton
            && this.restartSceneButton
            && this.restartAllButton
            && this.settingsButton
            && this.infoButton
            && this.confirmModal
            && this.confirmMessage
            && this.confirmCancelButton
            && this.confirmAcceptButton
            && this.infoModal
            && this.infoCloseButton
            && this.settingsModal
            && this.settingsCloseButton
            && this.audioEnabledToggle
            && this.musicVolumeSlider
            && this.musicVolumeValue
            && this.sfxVolumeSlider
            && this.sfxVolumeValue
            && this.dialogueVolumeSlider
            && this.dialogueVolumeValue
            && this.graphicsQualityButtons.length > 0
            && this.keybindButtons.length > 0
            && this.resetAllButton
        )

        this.onKeyDown = (event) =>
        {
            if(!this.isEnabled() || !this.hasUI)
            {
                return
            }

            if(this.pendingKeybindAction)
            {
                this.handlePendingKeybindInput(event)
                return
            }

            if(event.repeat)
            {
                return
            }

            const pauseCodes = this.inputs?.getActionCodes?.(InputBindingsConstants.INPUT_ACTION.PAUSE) ?? ['Escape']
            if(!pauseCodes.includes(event.code))
            {
                return
            }

            this.trace('keydown.escape', {
                state: this.getStateLabel(),
                isPointerLocked: this.inputs?.isPointerLocked?.(this.canvas) || false,
                activeElement: this.describeElement(document.activeElement),
                hasFocus: document.hasFocus?.() ?? true
            })

            const now = performance.now()
            const unlockedFromCanvasRecently = (now - this.lastCanvasUnlockAt) <= 280

            if(now < this.ignoreEscapeUntilMs)
            {
                event.preventDefault()
                this.trace('keydown.escape_ignored', {
                    ignoreUntilMs: this.ignoreEscapeUntilMs
                })
                return
            }

            if(this.state === PauseMenu.OPEN || this.state === PauseMenu.OPENING)
            {
                if(this.isConfirmOpen())
                {
                    this.closeConfirm({
                        confirmed: false
                    })
                    event.preventDefault()
                    return
                }

                if(this.isSettingsOpen())
                {
                    this.closeSettings()
                    event.preventDefault()
                    return
                }

                if(this.isInfoOpen())
                {
                    this.closeInfo()
                    event.preventDefault()
                    return
                }

                this.close({
                    restorePointerLock: true,
                    source: 'keydown.escape'
                })
            }
            else
            {
                this.open({
                    forceWasPointerLocked: unlockedFromCanvasRecently ? true : null,
                    source: unlockedFromCanvasRecently
                        ? 'keydown.escape_after_unlock'
                        : 'keydown.escape'
                })

                if(unlockedFromCanvasRecently)
                {
                    this.trace('keydown.escape_unlock_context', {
                        now,
                        lastCanvasUnlockAt: this.lastCanvasUnlockAt
                    })
                    this.lastCanvasUnlockAt = -Infinity
                }
            }

            event.preventDefault()
        }

        this.onKeyUp = (event) =>
        {
            if(event?.code !== 'Escape')
            {
                return
            }

            this.tryRestorePointerLock('keyup.escape')
        }

        this.onMouseDown = () =>
        {
            this.tryRestorePointerLock('mousedown')
        }

        this.onResumeClick = (event) =>
        {
            event.preventDefault()
            this.experience?.sound?.playMenuClick?.()
            this.close({
                restorePointerLock: true,
                source: 'resume_button'
            })
        }

        this.onSettingsClick = (event) =>
        {
            event.preventDefault()
            this.experience?.sound?.playMenuClick?.()
            this.openSettings()
        }

        this.onInfoClick = (event) =>
        {
            event.preventDefault()
            this.experience?.sound?.playMenuClick?.()
            this.openInfo()
        }

        this.onInfoCloseClick = (event) =>
        {
            event.preventDefault()
            this.experience?.sound?.playMenuClick?.()
            this.closeInfo({ silent: true })
        }

        this.onSettingsCloseClick = (event) =>
        {
            event.preventDefault()
            this.experience?.sound?.playMenuClick?.()
            this.closeSettings({ silent: true })
        }

        this.onRestartSceneClick = async (event) =>
        {
            event.preventDefault()
            const confirmed = await this.openResetConfirmation({
                message: 'Vous allez redémarrer la scène actuelle depuis son début. Toute la progression en cours sur cette scène sera perdue.',
                confirmLabel: 'Recommencer la scène'
            })
            if(!confirmed)
            {
                return
            }

            this.experience?.sound?.playMenuClick?.()
            this.close({
                restorePointerLock: false,
                source: 'restart_scene'
            })
            this.experience?.restartCurrentSceneFromStart?.()
        }

        this.onRestartAllClick = async (event) =>
        {
            event.preventDefault()
            const confirmed = await this.openResetConfirmation({
                message: 'Vous allez tout recommencer depuis le début. Toute la progression actuelle sera remise à zéro.',
                confirmLabel: 'Tout recommencer'
            })
            if(!confirmed)
            {
                return
            }

            this.experience?.sound?.playMenuClick?.()
            this.close({
                restorePointerLock: false,
                source: 'restart_all'
            })
            this.experience?.restartFromBeginning?.()
        }

        this.onMusicVolumeInput = (event) =>
        {
            const percent = Number(event?.target?.value ?? 100)
            this.updateVolumeValueLabel(this.musicVolumeValue, percent)
            this.updateSliderFill(this.musicVolumeSlider, percent)
            this.experience?.sound?.setMusicVolume?.(percent / 100)
            this.playVolumePreview('music')
        }

        this.onSfxVolumeInput = (event) =>
        {
            const percent = Number(event?.target?.value ?? 100)
            this.updateVolumeValueLabel(this.sfxVolumeValue, percent)
            this.updateSliderFill(this.sfxVolumeSlider, percent)
            this.experience?.sound?.setSfxVolume?.(percent / 100)
            this.playVolumePreview('sfx')
        }

        this.onDialogueVolumeInput = (event) =>
        {
            const percent = Number(event?.target?.value ?? 100)
            this.updateVolumeValueLabel(this.dialogueVolumeValue, percent)
            this.updateSliderFill(this.dialogueVolumeSlider, percent)
            this.experience?.sound?.setDialogueVolume?.(percent / 100)
            this.playVolumePreview('dialogue')
        }

        this.onAudioEnabledToggleChange = (event) =>
        {
            const enabled = Boolean(event?.target?.checked)
            this.experience?.menu?.setAudioPreference?.(enabled)
            this.syncAudioEnabledUI()
        }

        this.onGraphicsQualityClick = (event) =>
        {
            event.preventDefault()
            const button = event.currentTarget instanceof HTMLElement
                ? event.currentTarget
                : null
            const quality = String(button?.dataset?.gfxQuality || '').trim().toLowerCase()
            if(!quality)
            {
                return
            }

            this.applyGraphicsQuality(quality)
            this.experience?.sound?.playMenuClick?.()
        }

        this.onKeybindButtonClick = (event) =>
        {
            event.preventDefault()
            const button = event.currentTarget instanceof HTMLElement
                ? event.currentTarget
                : null
            const action = String(button?.dataset?.keybindAction || '').trim()
            if(!action)
            {
                return
            }

            this.beginKeybindCapture(action)
            this.experience?.sound?.playMenuClick?.()
        }

        this.onResetAllClick = (event) =>
        {
            event.preventDefault()
            this.resetAllSettings()
            this.experience?.sound?.playMenuClick?.()
        }

        this.onButtonHover = (event) =>
        {
            const button = event?.currentTarget
            if(!(button instanceof HTMLButtonElement) || button.disabled)
            {
                return
            }

            this.experience?.sound?.unlock?.()
            this.experience?.sound?.playMenuHover?.()
        }

        this.onRootClick = (event) =>
        {
            if(event.target !== this.root)
            {
                return
            }

            this.close({
                restorePointerLock: false,
                source: 'overlay_click'
            })
        }

        this.onPointerLockChange = ({ element, previousElement } = {}) =>
        {
            const isPointerLockedNow = element === this.canvas
            const wasPointerLocked = this.pointerLockWasActive
            this.pointerLockWasActive = isPointerLockedNow
            const wasCanvasLocked = previousElement === this.canvas || (!previousElement && wasPointerLocked)

            this.trace('pointerlockchange', {
                previousElement: this.describeElement(previousElement),
                currentElement: this.describeElement(element),
                wasPointerLocked,
                wasCanvasLocked,
                pendingRestore: this.pendingPointerLockRestore,
                state: this.getStateLabel()
            })

            if(isPointerLockedNow && this.pendingPointerLockRestore)
            {
                this.pendingPointerLockRestore = false
                this.trace('relock_success', {
                    source: 'pointerlockchange'
                })
            }

            // Escape while pointer-locked exits pointer lock before firing keydown.
            // Open pause immediately on this unlock to avoid the intermediate unlocked state.
            if(isPointerLockedNow || !wasCanvasLocked)
            {
                return
            }

            this.lastCanvasUnlockAt = performance.now()

            if(!this.hasUI)
            {
                this.trace('pointerlockchange_skip', {
                    reason: 'missing_ui'
                })
                return
            }

            if(!this.isEnabled())
            {
                this.trace('pointerlockchange_skip', {
                    reason: 'disabled'
                })
                return
            }

            if(this.state === PauseMenu.OPEN || this.state === PauseMenu.OPENING)
            {
                this.trace('pointerlockchange_skip', {
                    reason: 'already_open',
                    state: this.getStateLabel()
                })
                return
            }

            if(this.state !== PauseMenu.CLOSED)
            {
                this.trace('pointerlockchange_skip', {
                    reason: 'state_not_closed',
                    state: this.getStateLabel()
                })
                return
            }

            if(!this.canAutoOpen())
            {
                this.trace('pointerlockchange_skip', {
                    reason: 'can_auto_open_false'
                })
                return
            }

            this.ignoreEscapeUntilMs = performance.now() + 220
            this.open({
                forceWasPointerLocked: true,
                source: 'pointerlockchange.unlock'
            })
        }
    }

    start()
    {
        if(this.isInitialized)
        {
            return
        }

        this.isInitialized = true

        if(!this.hasUI)
        {
            return
        }

        this.inputs?.on?.('keydown.pauseMenu', this.onKeyDown)
        this.inputs?.on?.('keyup.pauseMenu', this.onKeyUp)
        this.inputs?.on?.('mousedown.pauseMenu', this.onMouseDown)
        this.inputs?.on?.('pointerlockchange.pauseMenu', this.onPointerLockChange)
        this.resumeButton.addEventListener('click', this.onResumeClick)
        this.restartSceneButton.addEventListener('click', this.onRestartSceneClick)
        this.restartAllButton.addEventListener('click', this.onRestartAllClick)
        this.settingsButton.addEventListener('click', this.onSettingsClick)
        this.infoButton.addEventListener('click', this.onInfoClick)
        this.infoCloseButton.addEventListener('click', this.onInfoCloseClick)
        this.settingsCloseButton.addEventListener('click', this.onSettingsCloseClick)
        this.audioEnabledToggle.addEventListener('change', this.onAudioEnabledToggleChange)
        this.musicVolumeSlider.addEventListener('input', this.onMusicVolumeInput)
        this.sfxVolumeSlider.addEventListener('input', this.onSfxVolumeInput)
        this.dialogueVolumeSlider.addEventListener('input', this.onDialogueVolumeInput)
        for(const button of this.graphicsQualityButtons)
        {
            button.addEventListener('click', this.onGraphicsQualityClick)
        }
        this.resetAllButton.addEventListener('click', this.onResetAllClick)
        for(const button of this.keybindButtons)
        {
            button.addEventListener('click', this.onKeybindButtonClick)
        }
        this.root.addEventListener('click', this.onRootClick)
        this.bindHoverSounds()
        this.syncSettingsVolumeUI()
        this.syncGraphicsQualityUI()
        this.syncKeybindButtons()
    }

    bindHoverSounds()
    {
        this.hoverableButtons = [
            this.resumeButton,
            this.restartSceneButton,
            this.restartAllButton,
            this.settingsButton,
            this.infoButton,
            this.infoCloseButton,
            this.settingsCloseButton,
            this.resetAllButton,
            ...this.graphicsQualityButtons,
            ...this.keybindButtons
        ].filter((element) => element instanceof HTMLButtonElement)

        for(const button of this.hoverableButtons)
        {
            button.addEventListener('mouseenter', this.onButtonHover)
            button.addEventListener('focus', this.onButtonHover)
        }
    }

    unbindHoverSounds()
    {
        for(const button of this.hoverableButtons)
        {
            button.removeEventListener('mouseenter', this.onButtonHover)
            button.removeEventListener('focus', this.onButtonHover)
        }

        this.hoverableButtons = []
    }

    open({
        forceWasPointerLocked = null,
        source = 'unknown'
    } = {})
    {
        if(!this.hasUI || this.state === PauseMenu.OPEN || this.state === PauseMenu.OPENING)
        {
            return
        }

        if(this.closeTimeoutId)
        {
            window.clearTimeout(this.closeTimeoutId)
            this.closeTimeoutId = 0
        }
        if(this.visibilityRafId)
        {
            window.cancelAnimationFrame(this.visibilityRafId)
            this.visibilityRafId = 0
        }

        const isPointerLockedNow = this.inputs?.isPointerLocked?.(this.canvas) || false
        this.wasPointerLockedBeforeOpen = typeof forceWasPointerLocked === 'boolean'
            ? forceWasPointerLocked
            : isPointerLockedNow

        this.trace('open', {
            source,
            isPointerLockedNow,
            wasPointerLockedBeforeOpen: this.wasPointerLockedBeforeOpen,
            activeElement: this.describeElement(document.activeElement),
            hasFocus: document.hasFocus?.() ?? true
        })

        this.state = PauseMenu.OPEN
        this.root.setAttribute('aria-hidden', 'false')
        this.root.classList.add(PauseMenuConstants.DISPLAYED_CLASS)
        this.root.classList.add(PauseMenuConstants.VISIBLE_CLASS)
        this.closeSettings({ silent: true })
        this.closeInfo({ silent: true })
        this.closeConfirm({
            confirmed: false
        })

        if(isPointerLockedNow)
        {
            this.inputs?.exitPointerLock?.()
        }

        this.experience?.sound?.pauseForMenu?.()
        this.experience?.dialogueManager?.pause?.()
        this.trigger('open')
        this.trigger('opened')
        this.experience?.sound?.playPauseOpen?.()
    }

    close({
        restorePointerLock = true,
        source = 'unknown'
    } = {})
    {
        if(!this.hasUI || this.state === PauseMenu.CLOSED || this.state === PauseMenu.CLOSING)
        {
            return
        }

        const shouldRestorePointerLock = Boolean(
            restorePointerLock &&
            this.wasPointerLockedBeforeOpen
        )
        const shouldDelayRestoreAfterEscape = Boolean(shouldRestorePointerLock && source === 'keydown.escape')
        this.trace('close', {
            source,
            restorePointerLock,
            shouldRestorePointerLock,
            shouldDelayRestoreAfterEscape,
            wasPointerLockedBeforeOpen: this.wasPointerLockedBeforeOpen,
            activeElement: this.describeElement(document.activeElement),
            hasFocus: document.hasFocus?.() ?? true
        })

        if(this.visibilityRafId)
        {
            window.cancelAnimationFrame(this.visibilityRafId)
            this.visibilityRafId = 0
        }
        if(this.closeTimeoutId)
        {
            window.clearTimeout(this.closeTimeoutId)
            this.closeTimeoutId = 0
        }

        this.state = PauseMenu.CLOSED
        this.closeSettings({ silent: true })
        this.closeConfirm({
            confirmed: false
        })
        this.root.setAttribute('aria-hidden', 'true')
        this.root.classList.remove(PauseMenuConstants.VISIBLE_CLASS)
        this.root.classList.remove(PauseMenuConstants.DISPLAYED_CLASS)
        this.experience?.sound?.resumeForMenu?.()
        this.experience?.dialogueManager?.resume?.()
        this.trigger('close')
        this.trigger('closed')

        if(shouldRestorePointerLock)
        {
            this.pendingPointerLockRestore = true

            if(!shouldDelayRestoreAfterEscape)
            {
                this.tryRestorePointerLock(`close:${source}`)
            }
            else
            {
                this.focusCanvas()
            }
        }
        else
        {
            this.focusCanvas()
        }

        this.wasPointerLockedBeforeOpen = false
    }

    isOpen()
    {
        return this.state === PauseMenu.OPEN || this.state === PauseMenu.OPENING
    }

    isSettingsOpen()
    {
        return this.settingsModal?.classList?.contains(PauseMenuConstants.VISIBLE_CLASS) === true
    }

    isInfoOpen()
    {
        return this.infoModal?.classList?.contains(PauseMenuConstants.VISIBLE_CLASS) === true
    }

    isConfirmOpen()
    {
        return this.confirmModal?.classList?.contains(PauseMenuConstants.VISIBLE_CLASS) === true
    }

    openResetConfirmation({
        message = '',
        confirmLabel = 'Confirmer'
    } = {})
    {
        if(!this.hasUI)
        {
            return Promise.resolve(false)
        }

        this.closeSettings({ silent: true })
        this.closeInfo({ silent: true })
        this.confirmMessage.textContent = String(message || '')
        this.confirmAcceptButton.textContent = String(confirmLabel || 'Confirmer')
        this.confirmModal.classList.add(PauseMenuConstants.VISIBLE_CLASS)
        this.confirmModal.setAttribute('aria-hidden', 'false')
        this.root.classList.add(PauseMenuConstants.CONFIRM_OPEN_CLASS)

        return new Promise((resolve) =>
        {
            let resolved = false
            const finish = (confirmed) =>
            {
                if(resolved)
                {
                    return
                }

                resolved = true
                this.confirmCancelButton.removeEventListener('click', onCancel)
                this.confirmAcceptButton.removeEventListener('click', onConfirm)
                this.closeConfirm({
                    confirmed
                })
                resolve(confirmed === true)
            }

            const onCancel = () => finish(false)
            const onConfirm = () => finish(true)

            this.confirmCancelButton.addEventListener('click', onCancel)
            this.confirmAcceptButton.addEventListener('click', onConfirm)
        })
    }

    closeConfirm({ confirmed = false } = {})
    {
        if(!this.hasUI || !this.isConfirmOpen())
        {
            return confirmed === true
        }

        this.confirmModal.classList.remove(PauseMenuConstants.VISIBLE_CLASS)
        this.confirmModal.setAttribute('aria-hidden', 'true')
        this.root.classList.remove(PauseMenuConstants.CONFIRM_OPEN_CLASS)
        return confirmed === true
    }

    openSettings()
    {
        if(!this.hasUI || !this.isOpen())
        {
            return
        }

        this.closeConfirm({
            confirmed: false
        })
        this.closeInfo({ silent: true })
        this.syncSettingsVolumeUI()
        this.syncGraphicsQualityUI()
        this.syncKeybindButtons()
        this.clearKeybindError()
        this.settingsModal.classList.add(PauseMenuConstants.VISIBLE_CLASS)
        this.settingsModal.setAttribute('aria-hidden', 'false')
        this.root.classList.add(PauseMenuConstants.SETTINGS_OPEN_CLASS)
    }

    closeSettings({
        silent = false
    } = {})
    {
        if(!this.hasUI || !this.isSettingsOpen())
        {
            return
        }

        this.settingsModal.classList.remove(PauseMenuConstants.VISIBLE_CLASS)
        this.settingsModal.setAttribute('aria-hidden', 'true')
        this.root.classList.remove(PauseMenuConstants.SETTINGS_OPEN_CLASS)
        this.cancelKeybindCapture()
        this.clearKeybindError()
        if(!silent)
        {
            this.experience?.sound?.playMenuClick?.()
        }
    }

    openInfo()
    {
        if(!this.hasUI || !this.isOpen())
        {
            return
        }

        this.closeConfirm({
            confirmed: false
        })
        this.closeSettings({ silent: true })
        this.infoModal.classList.add(PauseMenuConstants.VISIBLE_CLASS)
        this.infoModal.setAttribute('aria-hidden', 'false')
        this.root.classList.add(PauseMenuConstants.INFO_OPEN_CLASS)
    }

    closeInfo({
        silent = false
    } = {})
    {
        if(!this.hasUI || !this.isInfoOpen())
        {
            return
        }

        this.infoModal.classList.remove(PauseMenuConstants.VISIBLE_CLASS)
        this.infoModal.setAttribute('aria-hidden', 'true')
        this.root.classList.remove(PauseMenuConstants.INFO_OPEN_CLASS)
        if(!silent)
        {
            this.experience?.sound?.playMenuClick?.()
        }
    }

    syncSettingsVolumeUI()
    {
        const musicPercent    = Math.round((this.experience?.sound?.getMusicVolume?.()    ?? 1) * 100)
        const sfxPercent      = Math.round((this.experience?.sound?.getSfxVolume?.()      ?? 1) * 100)
        const dialoguePercent = Math.round((this.experience?.sound?.getDialogueVolume?.() ?? 1) * 100)

        this.musicVolumeSlider.value    = String(musicPercent)
        this.sfxVolumeSlider.value      = String(sfxPercent)
        this.dialogueVolumeSlider.value = String(dialoguePercent)

        this.updateVolumeValueLabel(this.musicVolumeValue,    musicPercent)
        this.updateVolumeValueLabel(this.sfxVolumeValue,      sfxPercent)
        this.updateVolumeValueLabel(this.dialogueVolumeValue, dialoguePercent)

        this.updateSliderFill(this.musicVolumeSlider,    musicPercent)
        this.updateSliderFill(this.sfxVolumeSlider,      sfxPercent)
        this.updateSliderFill(this.dialogueVolumeSlider, dialoguePercent)

        this.syncAudioEnabledUI()
    }

    syncAudioEnabledUI()
    {
        const enabled = this.experience?.sound?.enabled !== false
        if(this.audioEnabledToggle instanceof HTMLInputElement)
        {
            this.audioEnabledToggle.checked = enabled
        }
        if(this.audioControls instanceof HTMLElement)
        {
            this.audioControls.classList.toggle('is-audio-disabled', !enabled)
        }
    }

    getGraphicsQuality()
    {
        return this.experience?.renderer?.getGraphicsQuality?.() || PauseMenuConstants.GRAPHICS_QUALITY.HIGH
    }

    applyGraphicsQuality(quality)
    {
        const safeQuality = String(quality || '').trim().toLowerCase()
        this.experience?.renderer?.setGraphicsQuality?.(safeQuality)
        this.experience?.bloom?.refreshGraphicsQuality?.()
        this.syncGraphicsQualityUI()
    }

    syncGraphicsQualityUI()
    {
        const activeQuality = this.getGraphicsQuality()
        for(const button of this.graphicsQualityButtons)
        {
            if(!(button instanceof HTMLElement))
            {
                continue
            }

            const quality = String(button.dataset?.gfxQuality || '').trim().toLowerCase()
            if(quality === activeQuality)
            {
                button.classList.add('is-active')
            }
            else
            {
                button.classList.remove('is-active')
            }
        }
    }

    updateVolumeValueLabel(element, percent)
    {
        if(!(element instanceof HTMLElement))
        {
            return
        }

        const safePercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 100
        element.textContent = `${safePercent}%`
    }

    updateSliderFill(slider, percent)
    {
        if(!(slider instanceof HTMLElement))
        {
            return
        }

        const safePercent = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 100
        slider.style.setProperty('--slider-fill', `${safePercent}%`)

        const t = safePercent / 100
        const r = Math.round(PauseMenuConstants.SLIDER_GRADIENT_DARK_RGB.r + ((PauseMenuConstants.SLIDER_GRADIENT_LIGHT_RGB.r - PauseMenuConstants.SLIDER_GRADIENT_DARK_RGB.r) * t))
        const g = Math.round(PauseMenuConstants.SLIDER_GRADIENT_DARK_RGB.g + ((PauseMenuConstants.SLIDER_GRADIENT_LIGHT_RGB.g - PauseMenuConstants.SLIDER_GRADIENT_DARK_RGB.g) * t))
        const b = Math.round(PauseMenuConstants.SLIDER_GRADIENT_DARK_RGB.b + ((PauseMenuConstants.SLIDER_GRADIENT_LIGHT_RGB.b - PauseMenuConstants.SLIDER_GRADIENT_DARK_RGB.b) * t))
        slider.style.setProperty('--slider-fill-end', `rgba(${r}, ${g}, ${b}, ${PauseMenuConstants.SLIDER_GRADIENT_ALPHA})`)
    }

    playVolumePreview(type = 'sfx')
    {
        const sound = this.experience?.sound
        const soundName = PauseMenuConstants.VOLUME_PREVIEW_SOUND_BY_TYPE[type]
        if(!sound || !soundName)
        {
            return
        }

        const now = performance.now()
        const lastPreviewAt = this.lastVolumePreviewAt?.[type] ?? -Infinity
        if((now - lastPreviewAt) < PauseMenuConstants.VOLUME_PREVIEW_MIN_INTERVAL_MS)
        {
            return
        }

        this.lastVolumePreviewAt[type] = now
        sound.unlock?.()
        sound.play?.(soundName)
    }

    beginKeybindCapture(action)
    {
        this.pendingKeybindAction = action
        this.clearKeybindError()
        this.syncKeybindButtons()
    }

    cancelKeybindCapture()
    {
        if(!this.pendingKeybindAction)
        {
            return
        }

        this.pendingKeybindAction = null
        this.syncKeybindButtons()
    }

    handlePendingKeybindInput(event)
    {
        const action = this.pendingKeybindAction
        if(!action)
        {
            return
        }

        event.preventDefault()
        event.stopPropagation?.()

        if(event.repeat)
        {
            return
        }

        const code = String(event.code || '').trim()
        if(!code)
        {
            return
        }

        const duplicateAction = this.findActionUsingCode(code, { excludeAction: action })
        if(duplicateAction)
        {
            this.triggerKeybindError(action)
            return
        }

        const hasBound = this.inputs?.setActionBinding?.(action, code) === true
        if(!hasBound)
        {
            this.triggerKeybindError(action)
            return
        }

        this.pendingKeybindAction = null
        this.clearKeybindError()
        this.syncKeybindButtons()
        this.experience?.sound?.playMenuClick?.()
    }

    findActionUsingCode(code, { excludeAction = null } = {})
    {
        const normalizedCode = String(code || '').trim()
        const normalizedExclude = String(excludeAction || '').trim()
        const bindings = this.inputs?.getActionBindingsSnapshot?.() ?? {}

        for(const [action, actionCode] of Object.entries(bindings))
        {
            if(action === normalizedExclude)
            {
                continue
            }

            if(actionCode === normalizedCode)
            {
                return action
            }
        }

        return null
    }

    triggerKeybindError(action)
    {
        const normalizedAction = String(action || '').trim()
        if(normalizedAction === '')
        {
            return
        }

        this.keybindErrorAction = normalizedAction
        this.syncKeybindButtons()

        this.experience?.sound?.unlock?.()
        this.experience?.sound?.play?.('menuClick', {
            volume: 0.95,
            playbackRate: 0.72
        })

        if(this.keybindErrorTimeoutId)
        {
            window.clearTimeout(this.keybindErrorTimeoutId)
            this.keybindErrorTimeoutId = 0
        }

        this.keybindErrorTimeoutId = window.setTimeout(() =>
        {
            this.clearKeybindError()
        }, PauseMenuConstants.KEYBIND_ERROR_FLASH_MS)
    }

    clearKeybindError()
    {
        if(this.keybindErrorTimeoutId)
        {
            window.clearTimeout(this.keybindErrorTimeoutId)
            this.keybindErrorTimeoutId = 0
        }

        this.keybindErrorAction = null
        this.syncKeybindButtons()
    }

    resetAllSettings()
    {
        this.experience?.sound?.setMusicVolume?.(1)
        this.experience?.sound?.setSfxVolume?.(1)
        this.experience?.sound?.setDialogueVolume?.(1)
        this.experience?.menu?.setAudioPreference?.(true)
        this.experience?.renderer?.setGraphicsQuality?.(PauseMenuConstants.GRAPHICS_QUALITY.HIGH)
        this.inputs?.resetActionBindings?.()
        this.cancelKeybindCapture()
        this.clearKeybindError()
        this.syncSettingsVolumeUI()
        this.syncGraphicsQualityUI()
        this.syncKeybindButtons()
    }

    syncKeybindButtons()
    {
        for(const button of this.keybindButtons)
        {
            if(!(button instanceof HTMLElement))
            {
                continue
            }

            const action = String(button.dataset?.keybindAction || '').trim()
            if(!action)
            {
                continue
            }

            if(this.pendingKeybindAction === action)
            {
                button.textContent = PauseMenuConstants.KEYBIND_CAPTURE_LABEL
                button.classList.add('is-capturing')
                if(this.keybindErrorAction === action)
                {
                    button.classList.add('is-error')
                }
                else
                {
                    button.classList.remove('is-error')
                }
                continue
            }

            const code = this.inputs?.getActionBinding?.(action) || ''
            button.textContent = this.formatKeyCodeLabel(code)
            button.classList.remove('is-capturing')
            if(this.keybindErrorAction === action)
            {
                button.classList.add('is-error')
            }
            else
            {
                button.classList.remove('is-error')
            }
        }
    }

    formatKeyCodeLabel(code)
    {
        const normalizedCode = String(code || '').trim()
        if(normalizedCode === '')
        {
            return '-'
        }

        const directLabel = PauseMenuConstants.KEYBIND_CODE_LABELS[normalizedCode]
        if(directLabel)
        {
            return directLabel
        }

        if(normalizedCode.startsWith('Key') && normalizedCode.length === 4)
        {
            return normalizedCode.slice(3)
        }

        if(normalizedCode.startsWith('Digit'))
        {
            return normalizedCode.slice(5)
        }

        return normalizedCode
    }

    destroy()
    {
        if(!this.hasUI)
        {
            return
        }

        this.inputs?.off?.('keydown.pauseMenu')
        this.inputs?.off?.('keyup.pauseMenu')
        this.inputs?.off?.('mousedown.pauseMenu')
        this.inputs?.off?.('pointerlockchange.pauseMenu')
        this.resumeButton.removeEventListener('click', this.onResumeClick)
        this.restartSceneButton.removeEventListener('click', this.onRestartSceneClick)
        this.restartAllButton.removeEventListener('click', this.onRestartAllClick)
        this.settingsButton.removeEventListener('click', this.onSettingsClick)
        this.infoButton.removeEventListener('click', this.onInfoClick)
        this.infoCloseButton.removeEventListener('click', this.onInfoCloseClick)
        this.settingsCloseButton.removeEventListener('click', this.onSettingsCloseClick)
        this.audioEnabledToggle.removeEventListener('change', this.onAudioEnabledToggleChange)
        this.musicVolumeSlider.removeEventListener('input', this.onMusicVolumeInput)
        this.sfxVolumeSlider.removeEventListener('input', this.onSfxVolumeInput)
        this.dialogueVolumeSlider.removeEventListener('input', this.onDialogueVolumeInput)
        for(const button of this.graphicsQualityButtons)
        {
            button.removeEventListener('click', this.onGraphicsQualityClick)
        }
        this.resetAllButton.removeEventListener('click', this.onResetAllClick)
        for(const button of this.keybindButtons)
        {
            button.removeEventListener('click', this.onKeybindButtonClick)
        }
        this.root.removeEventListener('click', this.onRootClick)
        this.unbindHoverSounds()

        this.root.classList.remove(PauseMenuConstants.VISIBLE_CLASS)
        this.root.classList.remove(PauseMenuConstants.DISPLAYED_CLASS)
        this.root.setAttribute('aria-hidden', 'true')
        this.settingsModal.classList.remove(PauseMenuConstants.VISIBLE_CLASS)
        this.settingsModal.setAttribute('aria-hidden', 'true')
        this.infoModal.classList.remove(PauseMenuConstants.VISIBLE_CLASS)
        this.infoModal.setAttribute('aria-hidden', 'true')
        this.confirmModal.classList.remove(PauseMenuConstants.VISIBLE_CLASS)
        this.confirmModal.setAttribute('aria-hidden', 'true')
        this.root.classList.remove(PauseMenuConstants.SETTINGS_OPEN_CLASS)
        this.root.classList.remove(PauseMenuConstants.INFO_OPEN_CLASS)
        this.root.classList.remove(PauseMenuConstants.CONFIRM_OPEN_CLASS)

        if(this.visibilityRafId)
        {
            window.cancelAnimationFrame(this.visibilityRafId)
            this.visibilityRafId = 0
        }
        if(this.closeTimeoutId)
        {
            window.clearTimeout(this.closeTimeoutId)
            this.closeTimeoutId = 0
        }
        if(this.keybindErrorTimeoutId)
        {
            window.clearTimeout(this.keybindErrorTimeoutId)
            this.keybindErrorTimeoutId = 0
        }

        this.state = PauseMenu.CLOSED
        this.wasPointerLockedBeforeOpen = false
        this.pointerLockWasActive = false
        this.pendingPointerLockRestore = false
        this.pendingKeybindAction = null
        this.clearKeybindError()
    }

    getStateLabel()
    {
        if(this.state === PauseMenu.OPEN)
        {
            return 'open'
        }
        if(this.state === PauseMenu.OPENING)
        {
            return 'opening'
        }
        if(this.state === PauseMenu.CLOSING)
        {
            return 'closing'
        }

        return 'closed'
    }

    describeElement(element)
    {
        if(!(element instanceof Element))
        {
            return 'none'
        }

        const tag = element.tagName.toLowerCase()
        const id = element.id ? `#${element.id}` : ''
        const className = typeof element.className === 'string' && element.className.trim() !== ''
            ? `.${element.className.trim().split(/\s+/).join('.')}`
            : ''

        return `${tag}${id}${className}`
    }

    trace(label, payload = {})
    {
        void label
        void payload
    }

    focusCanvas()
    {
        if(!(this.canvas instanceof HTMLElement))
        {
            return
        }

        if(!this.canvas.hasAttribute('tabindex'))
        {
            this.canvas.setAttribute('tabindex', '0')
        }

        this.canvas.focus({ preventScroll: true })
    }

    tryRestorePointerLock(context = 'unknown')
    {
        if(!this.pendingPointerLockRestore)
        {
            return false
        }

        if(this.state !== PauseMenu.CLOSED)
        {
            this.trace('relock_skip', {
                context,
                reason: 'menu_not_closed',
                state: this.getStateLabel()
            })
            return false
        }

        if(!(this.canvas instanceof HTMLElement))
        {
            this.pendingPointerLockRestore = false
            this.trace('relock_skip', {
                context,
                reason: 'missing_canvas'
            })
            return false
        }

        this.focusCanvas()

        if(this.inputs?.isPointerLocked?.(this.canvas))
        {
            this.pendingPointerLockRestore = false
            this.trace('relock_skip', {
                context,
                reason: 'already_locked'
            })
            return true
        }

        this.trace('relock_request', {
            context
        })
        this.inputs?.requestPointerLock?.(this.canvas)
        return true
    }
}
