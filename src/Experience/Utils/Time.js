import EventEmitter from './EventEmitter.js'
import EventEnum from '../Enum/EventEnum.js'

export default class Time extends EventEmitter
{
    constructor()
    {
        super()

        this.start = Date.now()
        this.current = this.start
        this.elapsed = 0
        this.delta = 16
        this.stopped = false

        this.rafId = window.requestAnimationFrame(() =>
        {
            this.tick()
        })
    }

    tick()
    {
        if(this.stopped)
        {
            return
        }

        const currentTime = Date.now()
        this.delta = currentTime - this.current
        this.current = currentTime
        this.elapsed = this.current - this.start

        this.trigger(EventEnum.TICK)

        this.rafId = window.requestAnimationFrame(() =>
        {
            this.tick()
        })
    }

    destroy()
    {
        this.stopped = true

        if(this.rafId)
        {
            window.cancelAnimationFrame(this.rafId)
        }
    }
}
