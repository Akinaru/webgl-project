import EventEmitter from '../Utils/EventEmitter.js'

export default class EndMenu extends EventEmitter
{
    constructor(experience)
    {
        super()
        this.experience = experience
        this.inputs = this.experience.inputs

        this.root = document.querySelector('#endMenu')
        this.traceButton = document.querySelector('#endMenuTrace')
        this.restartButton = document.querySelector('#endMenuRestart')

        this.hasUI = Boolean(this.root && this.traceButton && this.restartButton)

        if(this.hasUI)
        {
            this.setEvents()
        }
    }

    setEvents()
    {
        this.traceButton.addEventListener('click', (event) =>
        {
            event.preventDefault()
            this.experience.sound?.playMenuClick?.()
            this.trigger('trace')
        })

        this.restartButton.addEventListener('click', (event) =>
        {
            event.preventDefault()
            this.experience.sound?.playMenuClick?.()
            window.location.reload()
        })

        const buttons = [this.traceButton, this.restartButton]
        for(const button of buttons)
        {
            button.addEventListener('mouseenter', () =>
            {
                this.experience.sound?.playMenuHover?.()
            })
        }
    }

    open()
    {
        if(!this.hasUI) return

        this.inputs?.exitPointerLock?.()
        this.root.classList.add('is-displayed')
        
        // Raf for opacity transition
        window.requestAnimationFrame(() => {
            this.root.classList.add('is-visible')
        })

        this.experience.sound?.pauseForMenu?.()
    }

    close()
    {
        if(!this.hasUI) return

        this.root.classList.remove('is-visible')
        
        setTimeout(() => {
            this.root.classList.remove('is-displayed')
        }, 300)

        this.experience.sound?.resumeForMenu?.()
    }
}
