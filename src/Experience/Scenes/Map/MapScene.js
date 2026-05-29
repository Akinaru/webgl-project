import BaseScene from '../BaseScene.js'
import SceneEnum from '../../Enum/SceneEnum.js'
import MapWorld from './World/MapWorld.js'

const MAP_FADE_IN_CLASS = 'is-map-scene-fading-in'
const MAP_FADE_IN_DURATION_MS = 420

export default class MapScene extends BaseScene
{
    constructor()
    {
        super(SceneEnum.MAP)
        this.fadeInTimeoutId = null
    }

    enter(previousKey = null)
    {
        this.startMapFadeIn(previousKey)
        this.world = new MapWorld()
    }

    update(delta)
    {
        this.world?.update(delta)
    }

    destroy()
    {
        this.clearMapFadeIn()
        this.world?.destroy?.()
        this.world = null
    }

    startMapFadeIn(previousKey = null)
    {
        if(previousKey === SceneEnum.MAP)
        {
            return
        }

        this.clearMapFadeIn()
        document.body.classList.add(MAP_FADE_IN_CLASS)
        this.fadeInTimeoutId = window.setTimeout(() =>
        {
            this.fadeInTimeoutId = null
            document.body.classList.remove(MAP_FADE_IN_CLASS)
        }, MAP_FADE_IN_DURATION_MS)
    }

    clearMapFadeIn()
    {
        if(this.fadeInTimeoutId !== null)
        {
            window.clearTimeout(this.fadeInTimeoutId)
            this.fadeInTimeoutId = null
        }

        document.body.classList.remove(MAP_FADE_IN_CLASS)
    }
}
