import EventEmitter from './EventEmitter.js'
import EventEnum from '../Enum/EventEnum.js'

export default class Sizes extends EventEmitter
{
    constructor()
    {
        super()

        this.width = window.innerWidth
        this.height = window.innerHeight
        this.pixelRatio = Math.min(window.devicePixelRatio, 2)

        this.resizeHandler = () =>
        {
            this.width = window.innerWidth
            this.height = window.innerHeight
            this.pixelRatio = Math.min(window.devicePixelRatio, 2)

            this.trigger(EventEnum.RESIZE)
        }

        window.addEventListener(EventEnum.RESIZE, this.resizeHandler)
    }

    destroy()
    {
        window.removeEventListener(EventEnum.RESIZE, this.resizeHandler)
    }
}
