import EventEmitter from '../Utils/EventEmitter.js'

const DISPLAYED_CLASS = 'is-displayed'
const VISIBLE_CLASS = 'is-visible'
const SETTINGS_OPEN_CLASS = 'is-settings-open'
const SELECTORS = Object.freeze({
    root: '#pauseMenu',
    resumeButton: '#pauseResumeButton',
    settingsButton: '#pauseSettingsButton',
    settingsModal: '#pauseSettingsModal',
    settingsCloseButton: '#pauseSettingsCloseButton',
    musicVolumeSlider: '#pauseMusicVolume',
    musicVolumeValue: '#pauseMusicVolumeValue',
    sfxVolumeSlider: '#pauseSfxVolume',
    sfxVolumeValue: '#pauseSfxVolumeValue'
})
const SLIDER_GRADIENT_DARK_RGB = Object.freeze({ r: 36, g: 120, b: 186 })
const SLIDER_GRADIENT_LIGHT_RGB = Object.freeze({ r: 123, g: 215, b: 255 })
const SLIDER_GRADIENT_ALPHA = 0.95
const VOLUME_PREVIEW_MIN_INTERVAL_MS = 90
const VOLUME_PREVIEW_SOUND_BY_TYPE = Object.freeze({
    music: 'pauseMusicPreview',
    sfx: 'menuClick'
})

export default class PauseMenu extends EventEmitter
{
    static OPEN = 1
    static OPENING = 2
    static CLOSED = 3
    static CLOSING = 4

    constructor({
        experience,
        isEnabled = () => true
    } = {})
    {
        super()

        this.experience = experience
        this.inputs = this.experience?.inputs || null
        this.canvas = this.experience?.canvas || null
        this.debug = this.experience?.debug || null
        this.isEnabled = typeof isEnabled === 'function' ? isEnabled : () => true
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

        this.root = document.querySelector(SELECTORS.root)
        this.resumeButton = document.querySelector(SELECTORS.resumeButton)
        this.settingsButton = document.querySelector(SELECTORS.settingsButton)
        this.settingsModal = document.querySelector(SELECTORS.settingsModal)
        this.settingsCloseButton = document.querySelector(SELECTORS.settingsCloseButton)
        this.musicVolumeSlider = document.querySelector(SELECTORS.musicVolumeSlider)
        this.musicVolumeValue = document.querySelector(SELECTORS.musicVolumeValue)
        this.sfxVolumeSlider = document.querySelector(SELECTORS.sfxVolumeSlider)
        this.sfxVolumeValue = document.querySelector(SELECTORS.sfxVolumeValue)

        this.hasUI = Boolean(
            this.root
            && this.resumeButton
            && this.settingsButton
            && this.settingsModal
            && this.settingsCloseButton
            && this.musicVolumeSlider
            && this.musicVolumeValue
            && this.sfxVolumeSlider
            && this.sfxVolumeValue
        )

        this.onKeyDown = (event) =>
        {
            if(!this.isEnabled() || !this.hasUI)
            {
                return
            }

            if(event.repeat || event.code !== 'Escape')
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
                if(this.isSettingsOpen())
                {
                    this.closeSettings()
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

        this.onSettingsCloseClick = (event) =>
        {
            event.preventDefault()
            this.experience?.sound?.playMenuClick?.()
            this.closeSettings({ silent: true })
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
        this.settingsButton.addEventListener('click', this.onSettingsClick)
        this.settingsCloseButton.addEventListener('click', this.onSettingsCloseClick)
        this.musicVolumeSlider.addEventListener('input', this.onMusicVolumeInput)
        this.sfxVolumeSlider.addEventListener('input', this.onSfxVolumeInput)
        this.root.addEventListener('click', this.onRootClick)
        this.syncSettingsVolumeUI()
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
        this.root.classList.add(DISPLAYED_CLASS)
        this.root.classList.add(VISIBLE_CLASS)
        this.closeSettings({ silent: true })

        if(isPointerLockedNow)
        {
            this.inputs?.exitPointerLock?.()
        }

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
        this.root.setAttribute('aria-hidden', 'true')
        this.root.classList.remove(VISIBLE_CLASS)
        this.root.classList.remove(DISPLAYED_CLASS)
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
        return this.settingsModal?.classList?.contains(VISIBLE_CLASS) === true
    }

    openSettings()
    {
        if(!this.hasUI || !this.isOpen())
        {
            return
        }

        this.syncSettingsVolumeUI()
        this.settingsModal.classList.add(VISIBLE_CLASS)
        this.settingsModal.setAttribute('aria-hidden', 'false')
        this.root.classList.add(SETTINGS_OPEN_CLASS)
    }

    closeSettings({
        silent = false
    } = {})
    {
        if(!this.hasUI || !this.isSettingsOpen())
        {
            return
        }

        this.settingsModal.classList.remove(VISIBLE_CLASS)
        this.settingsModal.setAttribute('aria-hidden', 'true')
        this.root.classList.remove(SETTINGS_OPEN_CLASS)
        if(!silent)
        {
            this.experience?.sound?.playMenuClick?.()
        }
    }

    syncSettingsVolumeUI()
    {
        const musicPercent = Math.round((this.experience?.sound?.getMusicVolume?.() ?? 1) * 100)
        const sfxPercent = Math.round((this.experience?.sound?.getSfxVolume?.() ?? 1) * 100)
        this.musicVolumeSlider.value = String(musicPercent)
        this.sfxVolumeSlider.value = String(sfxPercent)
        this.updateVolumeValueLabel(this.musicVolumeValue, musicPercent)
        this.updateVolumeValueLabel(this.sfxVolumeValue, sfxPercent)
        this.updateSliderFill(this.musicVolumeSlider, musicPercent)
        this.updateSliderFill(this.sfxVolumeSlider, sfxPercent)
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
        const r = Math.round(SLIDER_GRADIENT_DARK_RGB.r + ((SLIDER_GRADIENT_LIGHT_RGB.r - SLIDER_GRADIENT_DARK_RGB.r) * t))
        const g = Math.round(SLIDER_GRADIENT_DARK_RGB.g + ((SLIDER_GRADIENT_LIGHT_RGB.g - SLIDER_GRADIENT_DARK_RGB.g) * t))
        const b = Math.round(SLIDER_GRADIENT_DARK_RGB.b + ((SLIDER_GRADIENT_LIGHT_RGB.b - SLIDER_GRADIENT_DARK_RGB.b) * t))
        slider.style.setProperty('--slider-fill-end', `rgba(${r}, ${g}, ${b}, ${SLIDER_GRADIENT_ALPHA})`)
    }

    playVolumePreview(type = 'sfx')
    {
        const sound = this.experience?.sound
        const soundName = VOLUME_PREVIEW_SOUND_BY_TYPE[type]
        if(!sound || !soundName)
        {
            return
        }

        const now = performance.now()
        const lastPreviewAt = this.lastVolumePreviewAt?.[type] ?? -Infinity
        if((now - lastPreviewAt) < VOLUME_PREVIEW_MIN_INTERVAL_MS)
        {
            return
        }

        this.lastVolumePreviewAt[type] = now
        sound.unlock?.()
        sound.play?.(soundName)
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
        this.settingsButton.removeEventListener('click', this.onSettingsClick)
        this.settingsCloseButton.removeEventListener('click', this.onSettingsCloseClick)
        this.musicVolumeSlider.removeEventListener('input', this.onMusicVolumeInput)
        this.sfxVolumeSlider.removeEventListener('input', this.onSfxVolumeInput)
        this.root.removeEventListener('click', this.onRootClick)

        this.root.classList.remove(VISIBLE_CLASS)
        this.root.classList.remove(DISPLAYED_CLASS)
        this.root.setAttribute('aria-hidden', 'true')
        this.settingsModal.classList.remove(VISIBLE_CLASS)
        this.settingsModal.setAttribute('aria-hidden', 'true')
        this.root.classList.remove(SETTINGS_OPEN_CLASS)

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
        this.wasPointerLockedBeforeOpen = false
        this.pointerLockWasActive = false
        this.pendingPointerLockRestore = false
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
