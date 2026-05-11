import Experience from '../Experience.js'
import EventEmitter from './EventEmitter.js'
import { INPUT_ACTION } from '../Inputs/InputBindings.constants.js'

const TUTORIAL_STEP_IDS = Object.freeze({
    LOOK: 'look',
    MOVE_FORWARD: 'moveForward',
    MOVE_BACKWARD: 'moveBackward',
    MOVE_LEFT: 'moveLeft',
    MOVE_RIGHT: 'moveRight'
})

const CODE_LABELS = Object.freeze({
    Space: 'Espace',
    Escape: 'Echap',
    ArrowUp: 'Fleche haut',
    ArrowDown: 'Fleche bas',
    ArrowLeft: 'Fleche gauche',
    ArrowRight: 'Fleche droite'
})

export const TUTORIAL_STATUS = {
    PENDING: 'pending',
    ACTIVE: 'active',
    FINISHED: 'finished'
}

export default class Tutoriel extends EventEmitter
{
    constructor()
    {
        super()
        this.experience = new Experience()
        this.inputs = this.experience.inputs
        this.keyboardLayoutMap = null
        
        this.status = TUTORIAL_STATUS.PENDING
        this.currentStepIndex = 0
        this.steps = [
            {
                id: TUTORIAL_STEP_IDS.LOOK,
                title: 'Regarder',
                instruction: 'Bougez la souris pour regarder autour de vous',
                action: null,
                validate: () => true, // Géré par mousemove
                progress: 0,
                targetProgress: 1200
            },
            {
                id: TUTORIAL_STEP_IDS.MOVE_FORWARD,
                title: 'Avancer',
                instruction: 'Appuyez sur la touche pour avancer',
                action: INPUT_ACTION.MOVE_FORWARD,
                validate: () => this.inputs.isActionPressed(INPUT_ACTION.MOVE_FORWARD),
                progress: 0,
                targetProgress: 600
            },
            {
                id: TUTORIAL_STEP_IDS.MOVE_BACKWARD,
                title: 'Reculer',
                instruction: 'Appuyez sur la touche pour reculer',
                action: INPUT_ACTION.MOVE_BACKWARD,
                validate: () => this.inputs.isActionPressed(INPUT_ACTION.MOVE_BACKWARD),
                progress: 0,
                targetProgress: 600
            },
            {
                id: TUTORIAL_STEP_IDS.MOVE_LEFT,
                title: 'Gauche',
                instruction: 'Appuyez sur la touche pour aller à gauche',
                action: INPUT_ACTION.MOVE_LEFT,
                validate: () => this.inputs.isActionPressed(INPUT_ACTION.MOVE_LEFT),
                progress: 0,
                targetProgress: 600
            },
            {
                id: TUTORIAL_STEP_IDS.MOVE_RIGHT,
                title: 'Droite',
                instruction: 'Appuyez sur la touche pour aller à droite',
                action: INPUT_ACTION.MOVE_RIGHT,
                validate: () => this.inputs.isActionPressed(INPUT_ACTION.MOVE_RIGHT),
                progress: 0,
                targetProgress: 600
            }
        ]
        
        this.setUI()

        this.onMouseMove = (event) =>
        {
            if (this.status !== TUTORIAL_STATUS.ACTIVE) return

            const step = this.steps[this.currentStepIndex]
            if (step && step.id === TUTORIAL_STEP_IDS.LOOK)
            {
                const moveAmount = Math.abs(event.movementX) + Math.abs(event.movementY)
                step.progress += moveAmount * 0.5
            }
        }
        this.inputs.on('mousemove', this.onMouseMove)
        this.resolveKeyboardLayoutMap()
    }
    
    setUI()
    {
        this.container = document.createElement('div')
        this.container.className = 'tutorial-overlay'
        this.container.innerHTML = `
            <div class="tutorial-panel">
                <div class="tutorial-header">
                    <h2 class="tutorial-title"></h2>
                    <div class="tutorial-keys"></div>
                </div>
                <p class="tutorial-instruction"></p>
                <div class="tutorial-progress-bar">
                    <div class="tutorial-progress-fill"></div>
                </div>
            </div>
        `
        document.body.appendChild(this.container)
        this.panelElement = this.container.querySelector('.tutorial-panel')
        this.titleElement = this.container.querySelector('.tutorial-title')
        this.keysElement = this.container.querySelector('.tutorial-keys')
        this.instructionElement = this.container.querySelector('.tutorial-instruction')
        this.progressFillElement = this.container.querySelector('.tutorial-progress-fill')
    }
    
    start()
    {
        if (this.status !== TUTORIAL_STATUS.PENDING) return
        
        this.status = TUTORIAL_STATUS.ACTIVE
        this.container.classList.add('is-active')
        this.showStep(0)
        this.trigger('start')
    }
    
    showStep(index)
    {
        this.currentStepIndex = index
        const step = this.steps[index]
        if (!step)
        {
            this.finish()
            return
        }
        
        this.titleElement.textContent = step.title
        this.instructionElement.textContent = step.instruction
        this.progressFillElement.style.width = '0%'
        
        // Update keys
        this.keysElement.innerHTML = ''
        this.getStepKeys(step).forEach((key) => {
            const keyEl = document.createElement('span')
            keyEl.className = 'tutorial-key'
            keyEl.textContent = key
            this.keysElement.appendChild(keyEl)
        })
        
        this.container.classList.remove('is-step-changed')
        void this.container.offsetWidth
        this.container.classList.add('is-step-changed')
    }
    
    update(delta)
    {
        if (this.status !== TUTORIAL_STATUS.ACTIVE) return
        
        const step = this.steps[this.currentStepIndex]
        if (!step) return
        
        if (step.id !== TUTORIAL_STEP_IDS.LOOK && step.validate())
        {
            step.progress += delta
        }
        
        this.updateProgressBar(step)
        
        if ((step.progress / step.targetProgress) >= 1)
        {
            this.nextStep()
        }
    }

    updateProgressBar(step)
    {
        const percent = Math.min(100, (step.progress / step.targetProgress) * 100)
        this.progressFillElement.style.width = `${percent}%`
    }
    
    nextStep()
    {
        const nextIndex = this.currentStepIndex + 1
        if (nextIndex < this.steps.length)
        {
            this.showStep(nextIndex)
        }
        else
        {
            this.finish()
        }
    }
    
    finish()
    {
        if (this.status === TUTORIAL_STATUS.FINISHED) return
        
        this.status = TUTORIAL_STATUS.FINISHED
        this.container.classList.add('is-finished')
        
        setTimeout(() => {
            this.container.style.display = 'none'
            this.trigger('finished')
        }, 800)
    }
    
    destroy()
    {
        this.inputs.off('mousemove', this.onMouseMove)
        this.container?.remove()
        this.off('start')
        this.off('finished')
    }

    async resolveKeyboardLayoutMap()
    {
        try
        {
            const map = await navigator?.keyboard?.getLayoutMap?.()
            this.keyboardLayoutMap = map || null
        }
        catch(error)
        {
            this.keyboardLayoutMap = null
        }

        if(this.status === TUTORIAL_STATUS.ACTIVE)
        {
            this.showStep(this.currentStepIndex)
        }
    }

    getStepKeys(step)
    {
        const action = step?.action || null
        if(!action)
        {
            return []
        }

        const primaryCode = this.inputs?.getActionBinding?.(action) || ''
        if(primaryCode === '')
        {
            return []
        }

        return [this.formatKeyCodeLabel(primaryCode)]
    }

    formatKeyCodeLabel(code)
    {
        const normalizedCode = String(code || '').trim()
        if(normalizedCode === '')
        {
            return '-'
        }

        const directLabel = CODE_LABELS[normalizedCode]
        if(directLabel)
        {
            return directLabel
        }

        const layoutLabel = this.keyboardLayoutMap?.get?.(normalizedCode)
        if(typeof layoutLabel === 'string' && layoutLabel.trim() !== '')
        {
            return layoutLabel.toUpperCase()
        }

        if(normalizedCode.startsWith('Key') && normalizedCode.length === 4)
        {
            return normalizedCode.slice(3)
        }

        if(normalizedCode.startsWith('Digit'))
        {
            return normalizedCode.slice(5)
        }

        return normalizedCode
    }
}
