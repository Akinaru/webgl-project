import Experience from '../Experience.js'
import * as THREE from 'three'

export default class DialogueUI
{
    constructor(dialogueManager)
    {
        this.dialogueManager = dialogueManager
        this.experience = new Experience()
        this.inputs = this.experience.inputs
        this.visible = false
        this.anchorWorldPosition = new THREE.Vector3()
        this.anchorWorldForIndicator = new THREE.Vector3()
        this.anchorScreenPosition = new THREE.Vector2()
        this.anchorOffset = new THREE.Vector3(0, 1.15, 0)
        this.anchorNodeName = '__bloomRoot'
        this.anchorObject = null
        this.anchorRaf = null
        this.anchorBounds = new THREE.Box3()
        this.anchorBoundsSize = new THREE.Vector3()
        this.anchorHeightWorld = 1.6
        this.lastAnchorMeasureAt = 0
        this.anchorMeasureIntervalMs = 250
        this.choiceCursorMode = false
        this.cursorVisible = false
        this.virtualCursorPosition = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5)
        this.cameraForward = new THREE.Vector3()
        this.cameraLookDirection = new THREE.Vector3()
        this.cameraToTarget = new THREE.Vector3()
        this.lastIndicatorSide = 1
        this.lastIndicatorY = window.innerHeight * 0.5

        this.setElements()
        this.setEvents()
    }

    setElements()
    {
        this.root = document.createElement('section')
        this.root.className = 'dialogue'
        this.root.setAttribute('aria-live', 'polite')

        this.panel = document.createElement('div')
        this.panel.className = 'dialogue__panel'
        this.root.appendChild(this.panel)

        this.speaker = document.createElement('p')
        this.speaker.className = 'dialogue__speaker'
        this.panel.appendChild(this.speaker)

        this.text = document.createElement('p')
        this.text.className = 'dialogue__text'
        this.panel.appendChild(this.text)

        this.choices = document.createElement('div')
        this.choices.className = 'dialogue__choices'
        this.panel.appendChild(this.choices)

        this.hint = document.createElement('p')
        this.hint.className = 'dialogue__hint'
        this.panel.appendChild(this.hint)

        this.tail = document.createElement('span')
        this.tail.className = 'dialogue__tail'
        this.panel.appendChild(this.tail)

        this.cursor = document.createElement('span')
        this.cursor.className = 'dialogue__cursor'
        document.body.appendChild(this.cursor)

        this.turnIndicator = document.createElement('span')
        this.turnIndicator.className = 'dialogue__turn-indicator'
        document.body.appendChild(this.turnIndicator)

        document.body.appendChild(this.root)
        this.hide()
    }

    setEvents()
    {
        this.dialogueManager.on('state.dialogueUI', (payload) =>
        {
            this.render(payload)
        })

        this.dialogueManager.on('end.dialogueUI', () =>
        {
            this.hide()
        })

        this.onWindowKeyDown = (event) =>
        {
            if(!this.dialogueManager.isRunning() || event.repeat || this.shouldIgnoreShortcut(event.target))
            {
                return
            }

            if(event.code === 'Escape')
            {
                event.preventDefault()
                this.dialogueManager.skip()
                return
            }

            if(this.dialogueManager.isWaitingChoice())
            {
                const index = this.keyToChoiceIndex(event.code)
                if(index !== null)
                {
                    event.preventDefault()
                    this.dialogueManager.chooseByIndex(index)
                }
                return
            }

            if(event.code === 'Enter')
            {
                event.preventDefault()
                this.dialogueManager.continue()
            }
        }

        this.inputs?.on?.('keydown.dialogueUI', this.onWindowKeyDown)

        this.onWindowMouseMove = (event) =>
        {
            if(!this.choiceCursorMode)
            {
                return
            }

            this.updateVirtualCursor(event)
            this.syncCursorDom()
            this.updateCursorHoverState()
        }

        this.onPanelMouseEnter = () =>
        {
            if(!this.choiceCursorMode)
            {
                return
            }

            this.updateCursorHoverState()
        }

        this.onPanelMouseLeave = () =>
        {
            if(!this.choiceCursorMode)
            {
                return
            }

            this.updateCursorHoverState()
        }

        this.onChoicesMouseOver = (event) =>
        {
            if(!this.choiceCursorMode)
            {
                return
            }

            const choiceElement = event.target instanceof HTMLElement
                ? event.target.closest('.dialogue__choice')
                : null

            if(choiceElement)
            {
                this.cursor.classList.add('is-over-choice')
            }
        }

        this.onChoicesMouseOut = (event) =>
        {
            const relatedTarget = event.relatedTarget
            if(relatedTarget instanceof HTMLElement && relatedTarget.closest('.dialogue__choice'))
            {
                return
            }

            this.cursor.classList.remove('is-over-choice')
        }

        this.onWindowMouseDown = () =>
        {
            if(!this.choiceCursorMode || !this.inputs?.isPointerLocked?.())
            {
                return
            }

            const hoveredChoice = this.getHoveredChoiceElement()
            if(!hoveredChoice)
            {
                return
            }

            const choiceId = hoveredChoice.dataset.choiceId
            if(choiceId)
            {
                this.dialogueManager.choose(choiceId)
            }
        }

        this.onWindowResize = () =>
        {
            this.virtualCursorPosition.x = THREE.MathUtils.clamp(this.virtualCursorPosition.x, 0, window.innerWidth)
            this.virtualCursorPosition.y = THREE.MathUtils.clamp(this.virtualCursorPosition.y, 0, window.innerHeight)
            this.syncCursorDom()
        }

        this.inputs?.on?.('mousemove.dialogueUI', this.onWindowMouseMove)
        this.inputs?.on?.('mousedown.dialogueUI', this.onWindowMouseDown)
        window.addEventListener('resize', this.onWindowResize)
        this.panel.addEventListener('mouseenter', this.onPanelMouseEnter)
        this.panel.addEventListener('mouseleave', this.onPanelMouseLeave)
        this.choices.addEventListener('mouseover', this.onChoicesMouseOver)
        this.choices.addEventListener('mouseout', this.onChoicesMouseOut)
    }

    shouldIgnoreShortcut(target)
    {
        if(!(target instanceof HTMLElement))
        {
            return false
        }

        return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    }

    keyToChoiceIndex(code)
    {
        if(code.startsWith('Digit'))
        {
            const value = Number(code.replace('Digit', ''))
            if(value >= 1 && value <= 9)
            {
                return value - 1
            }
        }

        if(code.startsWith('Numpad'))
        {
            const value = Number(code.replace('Numpad', ''))
            if(value >= 1 && value <= 9)
            {
                return value - 1
            }
        }

        return null
    }

    render(payload = {})
    {
        if(!payload?.running || !payload?.node)
        {
            this.hide()
            return
        }

        this.show()

        this.speaker.textContent = payload.node.speaker || 'Bloom'
        this.text.textContent = payload.node.text || ''

        this.choices.innerHTML = ''

        if(payload.waitingChoice && payload.choices?.length > 0)
        {
            this.setChoiceCursorMode(true)

            payload.choices.forEach((choice, index) =>
            {
                const button = document.createElement('button')
                button.type = 'button'
                button.className = 'dialogue__choice'
                button.setAttribute('aria-label', `Choix ${index + 1}: ${choice.text}`)
                button.dataset.choiceId = choice.id
                button.innerHTML = `<span class="dialogue__choice-index">${index + 1}.</span> <span>${choice.text}</span>`
                button.addEventListener('click', () =>
                {
                    this.dialogueManager.choose(choice.id)
                })
                this.choices.appendChild(button)
            })

            this.hint.textContent = 'Choisis une reponse avec 1-9 ou clique.'
            return
        }

        this.setChoiceCursorMode(false)
        this.hint.textContent = 'Entrée pour continuer - Echap pour passer.'
    }

    show()
    {
        if(this.visible)
        {
            return
        }

        this.visible = true
        this.root.classList.add('is-visible')
        document.body.classList.add('is-dialogue-open')
        this.startAnchorLoop()
    }

    hide()
    {
        if(!this.visible)
        {
            return
        }

        this.visible = false
        this.root.classList.remove('is-visible')
        this.root.classList.remove('is-offscreen')
        this.hideTurnIndicator()
        document.body.classList.remove('is-dialogue-open')
        this.setChoiceCursorMode(false)
        this.stopAnchorLoop()
    }

    setChoiceCursorMode(isEnabled)
    {
        this.choiceCursorMode = Boolean(isEnabled)
        document.body.classList.toggle('is-dialogue-cursor', this.choiceCursorMode)

        if(!this.choiceCursorMode)
        {
            this.cursorVisible = false
            this.cursor.classList.remove('is-visible')
            this.cursor.classList.remove('is-over-choice')
            return
        }

        this.cursorVisible = true
        this.cursor.classList.add('is-visible')
        this.syncCursorDom()
        this.updateCursorHoverState()
    }

    updateVirtualCursor(event)
    {
        if(this.inputs?.isPointerLocked?.())
        {
            this.virtualCursorPosition.x += event.movementX || 0
            this.virtualCursorPosition.y += event.movementY || 0
        }
        else
        {
            this.virtualCursorPosition.x = event.clientX
            this.virtualCursorPosition.y = event.clientY
        }

        this.virtualCursorPosition.x = THREE.MathUtils.clamp(this.virtualCursorPosition.x, 0, window.innerWidth)
        this.virtualCursorPosition.y = THREE.MathUtils.clamp(this.virtualCursorPosition.y, 0, window.innerHeight)
    }

    syncCursorDom()
    {
        this.cursor.style.left = `${this.virtualCursorPosition.x}px`
        this.cursor.style.top = `${this.virtualCursorPosition.y}px`
    }

    getHoveredChoiceElement()
    {
        const hoveredElement = document.elementFromPoint(this.virtualCursorPosition.x, this.virtualCursorPosition.y)
        if(!(hoveredElement instanceof HTMLElement))
        {
            return null
        }

        return hoveredElement.closest('.dialogue__choice')
    }

    updateCursorHoverState()
    {
        if(!this.choiceCursorMode)
        {
            this.clearChoiceHoverState()
            return
        }

        const hoveredElement = document.elementFromPoint(this.virtualCursorPosition.x, this.virtualCursorPosition.y)
        const hoveredPanel = hoveredElement instanceof HTMLElement
            ? hoveredElement.closest('.dialogue__panel')
            : null

        if(hoveredPanel)
        {
            this.cursor.classList.add('is-visible')
        }
        else
        {
            this.cursor.classList.remove('is-visible')
            this.cursor.classList.remove('is-over-choice')
            this.clearChoiceHoverState()
            return
        }

        const hoveredChoice = this.getHoveredChoiceElement()
        this.applyChoiceHoverState(hoveredChoice)

        if(hoveredChoice)
        {
            this.cursor.classList.add('is-over-choice')
        }
        else
        {
            this.cursor.classList.remove('is-over-choice')
        }
    }

    clearChoiceHoverState()
    {
        const hoveredChoices = this.choices.querySelectorAll('.dialogue__choice--hover')
        hoveredChoices.forEach((choice) =>
        {
            choice.classList.remove('dialogue__choice--hover')
        })
    }

    applyChoiceHoverState(activeChoice)
    {
        this.clearChoiceHoverState()
        if(activeChoice)
        {
            activeChoice.classList.add('dialogue__choice--hover')
        }
    }

    startAnchorLoop()
    {
        if(this.anchorRaf)
        {
            return
        }

        const tick = () =>
        {
            this.anchorRaf = window.requestAnimationFrame(tick)
            this.updateAnchorPosition()
        }

        this.anchorRaf = window.requestAnimationFrame(tick)
        this.updateAnchorPosition()
    }

    stopAnchorLoop()
    {
        if(!this.anchorRaf)
        {
            return
        }

        window.cancelAnimationFrame(this.anchorRaf)
        this.anchorRaf = null
    }

    updateAnchorPosition()
    {
        if(!this.visible)
        {
            return
        }

        const camera = this.experience.camera?.instance
        const scene = this.experience.scene
        if(!camera || !scene)
        {
            return
        }

        this.anchorObject = this.anchorObject?.parent ? this.anchorObject : scene.getObjectByName(this.anchorNodeName)
        if(!this.anchorObject)
        {
            this.root.classList.add('is-offscreen')
            this.hideTurnIndicator()
            return
        }

        const now = performance.now()
        if((now - this.lastAnchorMeasureAt) >= this.anchorMeasureIntervalMs)
        {
            this.measureAnchorHeight()
            this.lastAnchorMeasureAt = now
        }

        this.anchorObject.getWorldPosition(this.anchorWorldPosition)
        this.anchorOffset.y = THREE.MathUtils.clamp(this.anchorHeightWorld * 0.58, 0.55, 2.4)
        this.anchorWorldPosition.add(this.anchorOffset)
        this.anchorWorldForIndicator.copy(this.anchorWorldPosition)
        this.anchorWorldPosition.project(camera)

        const ndcX = this.anchorWorldPosition.x
        const ndcY = this.anchorWorldPosition.y
        const ndcZ = this.anchorWorldPosition.z
        const outOfView = ndcZ < -1 || ndcZ > 1 || Math.abs(ndcX) > 1.08 || Math.abs(ndcY) > 1.02

        if(outOfView)
        {
            this.root.classList.add('is-offscreen')
            this.showTurnIndicator(camera, { ndcX, ndcY, ndcZ })
            return
        }

        this.root.classList.remove('is-offscreen')
        this.hideTurnIndicator()
        this.anchorScreenPosition.set(
            (ndcX * 0.5 + 0.5) * window.innerWidth,
            (-ndcY * 0.5 + 0.5) * window.innerHeight
        )

        this.root.style.left = `${this.anchorScreenPosition.x}px`
        this.root.style.top = `${this.anchorScreenPosition.y}px`

        if(this.choiceCursorMode)
        {
            this.updateCursorHoverState()
        }
    }

    showTurnIndicator(camera, { ndcX = 0, ndcY = 0 } = {})
    {
        const width = window.innerWidth
        const height = window.innerHeight
        const paddingX = 56
        const paddingY = 56
        let x = width * 0.5
        let y = height * 0.5
        let rotation = 0

        const isVerticalEdge = Math.abs(ndcY) > Math.max(Math.abs(ndcX) * 0.95, 0.72)

        if(isVerticalEdge)
        {
            if(ndcY > 0)
            {
                y = paddingY
                rotation = 0
            }
            else
            {
                y = height - paddingY
                rotation = Math.PI
            }

            x = THREE.MathUtils.clamp((ndcX * 0.5 + 0.5) * width, paddingX, width - paddingX)
            this.lastIndicatorY = y
        }
        else
        {
            const side = this.getIndicatorSide(camera)
            x = side > 0 ? (width - paddingX) : paddingX
            const targetY = this.getIndicatorVerticalPosition(camera, height)
            y = THREE.MathUtils.lerp(this.lastIndicatorY, targetY, 0.22)
            this.lastIndicatorY = y
            rotation = side > 0 ? (Math.PI * 0.5) : (-Math.PI * 0.5)
        }

        this.turnIndicator.style.left = `${x}px`
        this.turnIndicator.style.top = `${y}px`
        this.turnIndicator.style.setProperty('--turn-rotation', `${rotation}rad`)
        this.turnIndicator.classList.add('is-visible')
    }

    getIndicatorVerticalPosition(camera, viewportHeight)
    {
        const paddingY = 56
        camera.getWorldDirection(this.cameraLookDirection)
        const clampedLookY = THREE.MathUtils.clamp(this.cameraLookDirection.y, -0.95, 0.95)
        const normalized = (clampedLookY + 1) * 0.5

        return THREE.MathUtils.lerp(
            paddingY,
            viewportHeight - paddingY,
            normalized
        )
    }

    getIndicatorSide(camera)
    {
        camera.getWorldDirection(this.cameraForward)
        this.cameraForward.y = 0
        if(this.cameraForward.lengthSq() > 1e-8)
        {
            this.cameraForward.normalize()
        }

        this.cameraToTarget.copy(this.anchorWorldForIndicator).sub(camera.position)
        this.cameraToTarget.y = 0

        if(this.cameraToTarget.lengthSq() <= 1e-8 || this.cameraForward.lengthSq() <= 1e-8)
        {
            return this.lastIndicatorSide
        }

        this.cameraToTarget.normalize()
        const crossY = this.cameraForward.z * this.cameraToTarget.x - this.cameraForward.x * this.cameraToTarget.z

        if(Math.abs(crossY) < 1e-4)
        {
            return this.lastIndicatorSide
        }

        this.lastIndicatorSide = crossY < 0 ? 1 : -1
        return this.lastIndicatorSide
    }

    hideTurnIndicator()
    {
        this.turnIndicator.classList.remove('is-visible')
    }

    measureAnchorHeight()
    {
        this.anchorBounds.setFromObject(this.anchorObject)
        if(this.anchorBounds.isEmpty())
        {
            return
        }

        this.anchorBounds.getSize(this.anchorBoundsSize)
        this.anchorHeightWorld = Math.max(this.anchorBoundsSize.y, 0.1)
    }

    destroy()
    {
        this.inputs?.off?.('keydown.dialogueUI')
        this.inputs?.off?.('mousemove.dialogueUI')
        this.inputs?.off?.('mousedown.dialogueUI')
        window.removeEventListener('resize', this.onWindowResize)
        this.panel.removeEventListener('mouseenter', this.onPanelMouseEnter)
        this.panel.removeEventListener('mouseleave', this.onPanelMouseLeave)
        this.choices.removeEventListener('mouseover', this.onChoicesMouseOver)
        this.choices.removeEventListener('mouseout', this.onChoicesMouseOut)
        this.stopAnchorLoop()
        this.setChoiceCursorMode(false)
        this.cursor.remove()
        this.turnIndicator.remove()
        this.root.remove()
    }
}
