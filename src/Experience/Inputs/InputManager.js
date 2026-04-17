import EventEmitter from '../Utils/EventEmitter.js'

export default class InputManager extends EventEmitter
{
    constructor({ canvas = null } = {})
    {
        super()

        this.canvas = canvas
        this.keys = new Set()
        this.buttons = new Set()
        this.pointerLockElement = document.pointerLockElement || null
        this.traceEnabled = window.location.hash.toLowerCase().includes('debug')
        this.mouse = {
            x: 0,
            y: 0,
            movementX: 0,
            movementY: 0,
            wheelX: 0,
            wheelY: 0
        }

        this.onKeyDown = (event) =>
        {
            this.keys.add(event.code)

            if(this.traceEnabled && event.code === 'Escape')
            {
                this.trace('keydown.escape', {
                    pointerLock: this.describeElement(this.pointerLockElement),
                    activeElement: this.describeElement(document.activeElement),
                    hasFocus: document.hasFocus?.() ?? true
                })
            }

            this.trigger('keydown', [event])
        }

        this.onKeyUp = (event) =>
        {
            this.keys.delete(event.code)
            this.trigger('keyup', [event])
        }

        this.onWindowBlur = () =>
        {
            this.keys.clear()
            this.buttons.clear()
            this.trigger('blur')
        }

        this.onMouseMove = (event) =>
        {
            this.mouse.x = event.clientX
            this.mouse.y = event.clientY
            this.mouse.movementX = event.movementX || 0
            this.mouse.movementY = event.movementY || 0
            this.trigger('mousemove', [event])
        }

        this.onMouseDown = (event) =>
        {
            this.buttons.add(event.button)
            this.trigger('mousedown', [event])
        }

        this.onMouseUp = (event) =>
        {
            this.buttons.delete(event.button)
            this.trigger('mouseup', [event])
        }

        this.onClick = (event) =>
        {
            this.trigger('click', [event])
        }

        this.onWheel = (event) =>
        {
            this.mouse.wheelX = event.deltaX || 0
            this.mouse.wheelY = event.deltaY || 0
            this.trigger('wheel', [event])
        }

        this.onPointerLockChange = () =>
        {
            const previousElement = this.pointerLockElement
            this.pointerLockElement = document.pointerLockElement || null

            if(this.traceEnabled)
            {
                this.trace('pointerlockchange', {
                    previous: this.describeElement(previousElement),
                    current: this.describeElement(this.pointerLockElement),
                    activeElement: this.describeElement(document.activeElement),
                    hasFocus: document.hasFocus?.() ?? true
                })
            }

            this.trigger('pointerlockchange', [{
                element: this.pointerLockElement,
                previousElement
            }])
        }

        window.addEventListener('keydown', this.onKeyDown)
        window.addEventListener('keyup', this.onKeyUp)
        window.addEventListener('blur', this.onWindowBlur)
        window.addEventListener('mousemove', this.onMouseMove)
        window.addEventListener('mousedown', this.onMouseDown)
        window.addEventListener('mouseup', this.onMouseUp)
        window.addEventListener('click', this.onClick)
        window.addEventListener('wheel', this.onWheel, { passive: true })
        document.addEventListener('pointerlockchange', this.onPointerLockChange)
    }

    isPressed(...codes)
    {
        return codes.some((code) => this.keys.has(code))
    }

    getAxis(negativeCodes = [], positiveCodes = [])
    {
        const negative = negativeCodes.some((code) => this.keys.has(code)) ? 1 : 0
        const positive = positiveCodes.some((code) => this.keys.has(code)) ? 1 : 0
        return positive - negative
    }

    isMouseButtonPressed(button)
    {
        return this.buttons.has(button)
    }

    getPointerLockElement()
    {
        return this.pointerLockElement
    }

    isPointerLocked(target = this.canvas)
    {
        if(!target)
        {
            return Boolean(this.pointerLockElement)
        }

        return this.pointerLockElement === target
    }

    requestPointerLock(target = this.canvas)
    {
        const requestResult = target?.requestPointerLock?.()
        if(requestResult && typeof requestResult.catch === 'function')
        {
            requestResult.catch((error) =>
            {
                if(this.traceEnabled)
                {
                    this.trace('pointerlock_request_failed', {
                        error: error?.message || String(error),
                        target: this.describeElement(target)
                    })
                }
            })
        }
    }

    exitPointerLock()
    {
        document.exitPointerLock?.()
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
        console.info(`[InputManager] ${label}`, payload)
    }

    destroy()
    {
        window.removeEventListener('keydown', this.onKeyDown)
        window.removeEventListener('keyup', this.onKeyUp)
        window.removeEventListener('blur', this.onWindowBlur)
        window.removeEventListener('mousemove', this.onMouseMove)
        window.removeEventListener('mousedown', this.onMouseDown)
        window.removeEventListener('mouseup', this.onMouseUp)
        window.removeEventListener('click', this.onClick)
        window.removeEventListener('wheel', this.onWheel)
        document.removeEventListener('pointerlockchange', this.onPointerLockChange)

        this.keys.clear()
        this.buttons.clear()
        this.pointerLockElement = null

        this.off('keydown')
        this.off('keyup')
        this.off('blur')
        this.off('mousemove')
        this.off('mousedown')
        this.off('mouseup')
        this.off('click')
        this.off('wheel')
        this.off('pointerlockchange')
    }
}
