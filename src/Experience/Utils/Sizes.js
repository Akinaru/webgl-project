import EventEmitter from './EventEmitter.js'
import EventEnum from '../Enum/EventEnum.js'

export const MOBILE_MAX_WIDTH = 1024

export function isMobileOrTouchDevice()
{
    const hasTouch = (navigator.maxTouchPoints ?? 0) > 0
        || window.matchMedia('(pointer: coarse)').matches
    const isSmallScreen = window.innerWidth <= MOBILE_MAX_WIDTH
    return hasTouch || isSmallScreen
}

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
