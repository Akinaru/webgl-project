import Experience from '../Experience.js'

export default class DialogueUI
{
    constructor(dialogueManager)
    {
        this.dialogueManager = dialogueManager
        this.experience = new Experience()
        this.visible = false

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

            if(event.code === 'Enter' || event.code === 'Space')
            {
                event.preventDefault()
                this.dialogueManager.continue()
            }
        }

        window.addEventListener('keydown', this.onWindowKeyDown)
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
            payload.choices.forEach((choice, index) =>
            {
                const button = document.createElement('button')
                button.type = 'button'
                button.className = 'dialogue__choice'
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

        this.hint.textContent = 'Entrée / Espace pour continuer - Echap pour passer.'
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
    }

    destroy()
    {
        window.removeEventListener('keydown', this.onWindowKeyDown)
        this.root.remove()
    }
}
