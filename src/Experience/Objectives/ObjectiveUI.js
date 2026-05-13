import { OBJECTIVE_LABEL } from './Objectives.constants.js'

export default class ObjectiveUI
{
    constructor(objectiveManager)
    {
        this.objectiveManager = objectiveManager
        this.visible = false

        this.setElements()
        this.setEvents()
    }

    setElements()
    {
        this.root = document.createElement('aside')
        this.root.className = 'objective'
        this.root.setAttribute('aria-live', 'polite')

        this.panel = document.createElement('div')
        this.panel.className = 'objective__panel'
        this.root.appendChild(this.panel)

        this.badge = document.createElement('p')
        this.badge.className = 'objective__badge'
        this.badge.textContent = OBJECTIVE_LABEL
        this.panel.appendChild(this.badge)

        this.text = document.createElement('p')
        this.text.className = 'objective__text'
        this.panel.appendChild(this.text)

        document.body.appendChild(this.root)
        this.hide()
    }

    setEvents()
    {
        this.objectiveManager.on('state.objectiveUI', (payload) =>
        {
            this.render(payload)
        })

        this.objectiveManager.on('clear.objectiveUI', () =>
        {
            this.hide()
        })
    }

    render(payload = {})
    {
        if(payload.active !== true || !payload.objective)
        {
            this.hide()
            return
        }

        this.text.textContent = payload.objective.text || ''
        this.show()
    }

    show()
    {
        if(this.visible)
        {
            return
        }

        this.visible = true
        this.root.classList.add('is-visible')
    }

    hide()
    {
        if(!this.visible)
        {
            this.text.textContent = ''
            return
        }

        this.visible = false
        this.root.classList.remove('is-visible')
        this.text.textContent = ''
    }

    destroy()
    {
        this.root.remove()
    }
}
