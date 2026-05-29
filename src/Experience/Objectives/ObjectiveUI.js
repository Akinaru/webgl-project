import { OBJECTIVE_LABEL } from './Objectives.constants.js'

export default class ObjectiveUI
{
    constructor(objectiveManager)
    {
        this.objectiveManager = objectiveManager
        this.visible = false
        this.currentObjectiveKey = null
        this.hideTimer = null
        this.refreshTimer = null

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

        const nextObjectiveKey = payload.objectiveKey || null
        const nextObjectiveText = payload.objective.text || ''

        if(this.visible && this.currentObjectiveKey && this.currentObjectiveKey !== nextObjectiveKey)
        {
            this.replaceContent({
                objectiveKey: nextObjectiveKey,
                text: nextObjectiveText
            })
            return
        }

        this.currentObjectiveKey = nextObjectiveKey
        this.text.textContent = nextObjectiveText
        this.show()
    }

    show()
    {
        this.stopHideTimer()
        this.stopRefreshTimer()

        if(this.visible)
        {
            this.root.classList.remove('is-hiding')
            return
        }

        this.visible = true
        this.root.classList.remove('is-hiding')
        this.root.classList.add('is-entering')
        this.root.classList.add('is-visible')
        void this.root.offsetWidth
        this.root.classList.remove('is-entering')
    }

    replaceContent({ objectiveKey = null, text = '' } = {})
    {
        this.stopHideTimer()
        this.stopRefreshTimer()

        this.currentObjectiveKey = objectiveKey
        this.root.classList.remove('is-hiding')
        this.root.classList.add('is-refreshing')
        this.text.textContent = text

        this.refreshTimer = window.setTimeout(() =>
        {
            this.root.classList.remove('is-refreshing')
            this.refreshTimer = null
        }, 260)
    }

    hide()
    {
        this.stopRefreshTimer()
        this.currentObjectiveKey = null

        if(!this.visible)
        {
            this.root.classList.remove('is-visible')
            this.root.classList.remove('is-hiding')
            this.text.textContent = ''
            return
        }

        this.root.classList.add('is-hiding')
        this.stopHideTimer()
        this.hideTimer = window.setTimeout(() =>
        {
            this.visible = false
            this.root.classList.remove('is-visible')
            this.root.classList.remove('is-hiding')
            this.text.textContent = ''
            this.hideTimer = null
        }, 220)
    }

    stopHideTimer()
    {
        if(this.hideTimer !== null)
        {
            window.clearTimeout(this.hideTimer)
            this.hideTimer = null
        }
    }

    stopRefreshTimer()
    {
        if(this.refreshTimer !== null)
        {
            window.clearTimeout(this.refreshTimer)
            this.refreshTimer = null
            this.root.classList.remove('is-refreshing')
        }
    }

    destroy()
    {
        this.stopHideTimer()
        this.stopRefreshTimer()
        this.root.remove()
    }
}
