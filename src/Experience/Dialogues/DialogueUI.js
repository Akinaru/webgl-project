import Experience from '../Experience.js'

export default class DialogueUI
{
    constructor(dialogueManager)
    {
        this.dialogueManager = dialogueManager
        this.experience = new Experience()
        this.inputs = this.experience.inputs
        this.visible = false
        this.choiceCursorMode = false
        this.cursorVisible = false
        this.virtualCursorPosition = {
            x: window.innerWidth * 0.5,
            y: window.innerHeight * 0.5
        }

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
        this.root.appendChild(this.speaker)

        this.text = document.createElement('p')
        this.text.className = 'dialogue__text'
        this.panel.appendChild(this.text)

        this.choices = document.createElement('div')
        this.choices.className = 'dialogue__choices'
        this.panel.appendChild(this.choices)

        this.hint = document.createElement('p')
        this.hint.className = 'dialogue__hint'
        this.root.appendChild(this.hint)

        this.cursor = document.createElement('span')
        this.cursor.className = 'dialogue__cursor'
        document.body.appendChild(this.cursor)

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

            if(event.code === 'Enter' && !this.dialogueManager.isWaitingChoice())
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
            if(this.choiceCursorMode)
            {
                this.updateCursorHoverState()
            }
        }

        this.onPanelMouseLeave = () =>
        {
            if(this.choiceCursorMode)
            {
                this.updateCursorHoverState()
            }
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
            this.virtualCursorPosition.x = Math.min(Math.max(this.virtualCursorPosition.x, 0), window.innerWidth)
            this.virtualCursorPosition.y = Math.min(Math.max(this.virtualCursorPosition.y, 0), window.innerHeight)
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

            this.hint.textContent = 'Choisis une reponse en cliquant.'
            return
        }

        this.setChoiceCursorMode(false)
        this.hint.textContent = 'Entrer pour continuer'
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
    }

    hide()
    {
        if(!this.visible)
        {
            return
        }

        this.visible = false
        this.root.classList.remove('is-visible')
        document.body.classList.remove('is-dialogue-open')
        this.setChoiceCursorMode(false)
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

        this.virtualCursorPosition.x = Math.min(Math.max(this.virtualCursorPosition.x, 0), window.innerWidth)
        this.virtualCursorPosition.y = Math.min(Math.max(this.virtualCursorPosition.y, 0), window.innerHeight)
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
        this.setChoiceCursorMode(false)
        this.cursor.remove()
        this.root.remove()
    }
}
