import BaseScene from '../BaseScene.js'
import SceneEnum from '../../Enum/SceneEnum.js'
import MapWorld from './World/MapWorld.js'

export default class MapScene extends BaseScene
{
    constructor()
    {
        super(SceneEnum.MAP)
        this.hudHint = ''
    }

    enter()
    {
        this.world = new MapWorld()
    }

    update(delta)
    {
        this.world?.update(delta)
    }

    destroy()
    {
        this.world?.destroy?.()
        this.world = null
    }
}
