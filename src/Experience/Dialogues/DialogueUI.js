import Experience from '../Experience.js'
import * as THREE from 'three'

export default class DialogueUI
{
    constructor(dialogueManager)
    {
        this.dialogueManager = dialogueManager
        this.experience = new Experience()
        this.visible = false
        this.anchorWorldPosition = new THREE.Vector3()
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
        document.body.classList.remove('is-dialogue-open')
        this.stopAnchorLoop()
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
        this.anchorWorldPosition.project(camera)

        const ndcX = this.anchorWorldPosition.x
        const ndcY = this.anchorWorldPosition.y
        const ndcZ = this.anchorWorldPosition.z
        const outOfView = ndcZ < -1 || ndcZ > 1 || Math.abs(ndcX) > 1.2 || Math.abs(ndcY) > 1.2

        if(outOfView)
        {
            this.root.classList.add('is-offscreen')
            return
        }

        this.root.classList.remove('is-offscreen')
        this.anchorScreenPosition.set(
            (ndcX * 0.5 + 0.5) * window.innerWidth,
            (-ndcY * 0.5 + 0.5) * window.innerHeight
        )

        this.root.style.left = `${this.anchorScreenPosition.x}px`
        this.root.style.top = `${this.anchorScreenPosition.y}px`
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
        window.removeEventListener('keydown', this.onWindowKeyDown)
        this.stopAnchorLoop()
        this.root.remove()
    }
}
