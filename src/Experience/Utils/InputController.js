export default class InputController
{
    constructor()
    {
        this.keys = new Set()

        this.onKeyDown = (event) =>
        {
            this.keys.add(event.code)
        }

        this.onKeyUp = (event) =>
        {
            this.keys.delete(event.code)
        }

        this.onBlur = () =>
        {
            this.keys.clear()
        }

        window.addEventListener('keydown', this.onKeyDown)
        window.addEventListener('keyup', this.onKeyUp)
        window.addEventListener('blur', this.onBlur)
    }

    isPressed(...codes)
    {
        return codes.some((code) => this.keys.has(code))
    }

    getAxis(negativeCodes, positiveCodes)
    {
        const negative = negativeCodes.some((code) => this.keys.has(code)) ? 1 : 0
        const positive = positiveCodes.some((code) => this.keys.has(code)) ? 1 : 0
        return positive - negative
    }

    destroy()
    {
        window.removeEventListener('keydown', this.onKeyDown)
        window.removeEventListener('keyup', this.onKeyUp)
        window.removeEventListener('blur', this.onBlur)
        this.keys.clear()
    }
}
