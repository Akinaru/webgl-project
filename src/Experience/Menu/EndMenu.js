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
        this.comingSoonModal = document.querySelector('#comingSoonModal')
        this.comingSoonBackButton = document.querySelector('#comingSoonBack')

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
            this.openComingSoon()
        })

        this.comingSoonBackButton?.addEventListener('click', (event) =>
        {
            event.preventDefault()
            this.experience.sound?.playMenuClick?.()
            this.closeComingSoon()
        })

        this.comingSoonBackButton?.addEventListener('mouseenter', () =>
        {
            this.experience.sound?.playMenuHover?.()
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

    openComingSoon()
    {
        if(!this.comingSoonModal)
        {
            return
        }

        this.comingSoonModal.classList.add('is-displayed')
        window.requestAnimationFrame(() =>
        {
            this.comingSoonModal.classList.add('is-visible')
        })
    }

    closeComingSoon()
    {
        if(!this.comingSoonModal)
        {
            return
        }

        this.comingSoonModal.classList.remove('is-visible')
        setTimeout(() =>
        {
            this.comingSoonModal.classList.remove('is-displayed')
        }, 300)
    }

    open()
    {
        if(!this.hasUI) return

        this.root.classList.add('is-displayed')
        this.inputs?.exitPointerLock?.()
        
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

    isOpen()
    {
        return this.root?.classList?.contains?.('is-displayed') ?? false
    }
}
