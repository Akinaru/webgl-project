import Experience from '../../../Experience.js'
import * as SceneDistributionResultEndPromptConstants from './ResultEndPrompt.constants.js'

export default class SceneDistributionResultEndPrompt
{
    constructor({
        onFinish = null
    } = {})
    {
        this.experience = new Experience()
        this.inputs = this.experience.inputs
        this.onFinish = typeof onFinish === 'function' ? onFinish : null
        this.visible = false

        this.setElements()
        this.setEvents()
    }

    setElements()
    {
        this.root = document.createElement('section')
        this.root.className = 'result-end-prompt'
        this.root.setAttribute('aria-live', 'polite')
        this.root.setAttribute('aria-hidden', 'true')

        this.hint = document.createElement('p')
        this.hint.className = 'result-end-prompt__hint dialogue__hint'
        this.hint.textContent = SceneDistributionResultEndPromptConstants.RESULT_END_PROMPT_LABEL
        this.root.appendChild(this.hint)

        document.body.appendChild(this.root)
    }

    setEvents()
    {
        this.onKeyDown = (event) =>
        {
            if(!this.visible || event.repeat || event.code !== 'Enter')
            {
                return
            }

            event.preventDefault()
            this.finish()
        }

        this.inputs?.on?.('keydown.resultEndPrompt', this.onKeyDown)
    }

    show()
    {
        if(this.visible)
        {
            return
        }

        this.visible = true
        this.root.setAttribute('aria-hidden', 'false')
        this.root.classList.add('is-visible')
    }

    hide()
    {
        if(!this.visible)
        {
            return
        }

        this.visible = false
        this.root.setAttribute('aria-hidden', 'true')
        this.root.classList.remove('is-visible')
    }

    finish()
    {
        this.hide()
        this.experience.sound?.playMenuClick?.()
        this.onFinish?.()
    }

    destroy()
    {
        this.inputs?.off?.('keydown.resultEndPrompt', this.onKeyDown)
        this.hide()
        this.root?.remove?.()
        this.root = null
        this.hint = null
        this.onFinish = null
    }
}
