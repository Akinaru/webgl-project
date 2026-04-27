import EventEmitter from '../Utils/EventEmitter.js'

const DISPLAYED_CLASS = 'is-displayed'
const VISIBLE_CLASS = 'is-visible'
const TRANSITION_DURATION_MS = 180

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

        this.root = document.querySelector('#pauseMenu')
        this.resumeButton = document.querySelector('#pauseResumeButton')
        this.settingsButton = document.querySelector('#pauseSettingsButton')

        this.hasUI = Boolean(this.root && this.resumeButton && this.settingsButton)

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
            this.close({
                restorePointerLock: true,
                source: 'resume_button'
            })
        }

        this.onSettingsClick = (event) =>
        {
            event.preventDefault()
            this.experience?.sound?.playMenuClick?.()
            this.trigger('settings')
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

        this.onRootTransitionEnd = (event) =>
        {
            if(event.target !== this.root || event.propertyName !== 'opacity')
            {
                return
            }

            if(this.state === PauseMenu.OPENING)
            {
                this.finishOpen()
            }
            else if(this.state === PauseMenu.CLOSING)
            {
                this.finishClose()
            }
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

    finishOpen()
    {
        if(this.state !== PauseMenu.OPENING)
        {
            return
        }

        this.state = PauseMenu.OPEN
        this.trigger('opened')
    }

    finishClose()
    {
        if(this.state !== PauseMenu.CLOSING)
        {
            return
        }

        this.state = PauseMenu.CLOSED
        this.root.classList.remove(DISPLAYED_CLASS)
        this.trigger('closed')
        this.tryRestorePointerLock('finish_close')
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
        this.root.addEventListener('click', this.onRootClick)
        this.root.addEventListener('transitionend', this.onRootTransitionEnd)
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

        this.state = PauseMenu.OPENING
        this.root.setAttribute('aria-hidden', 'false')
        this.root.classList.add(DISPLAYED_CLASS)

        if(isPointerLockedNow)
        {
            this.inputs?.exitPointerLock?.()
        }

        this.visibilityRafId = requestAnimationFrame(() =>
        {
            this.root?.classList?.add(VISIBLE_CLASS)
            this.visibilityRafId = 0
        })

        this.trigger('open')
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

        this.state = PauseMenu.CLOSING
        this.root.setAttribute('aria-hidden', 'true')
        this.root.classList.remove(VISIBLE_CLASS)
        this.trigger('close')

        this.closeTimeoutId = window.setTimeout(() =>
        {
            this.closeTimeoutId = 0
            this.finishClose()
        }, TRANSITION_DURATION_MS + 40)

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
        this.root.removeEventListener('click', this.onRootClick)
        this.root.removeEventListener('transitionend', this.onRootTransitionEnd)

        this.root.classList.remove(VISIBLE_CLASS)
        this.root.classList.remove(DISPLAYED_CLASS)
        this.root.setAttribute('aria-hidden', 'true')

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
