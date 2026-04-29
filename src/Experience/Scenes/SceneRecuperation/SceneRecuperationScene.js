import BaseScene from '../BaseScene.js'
import SceneEnum from '../../Enum/SceneEnum.js'
import SceneRecuperationWorld from './World/SceneRecuperationWorld.js'

export default class SceneRecuperationScene extends BaseScene
{
    constructor()
    {
        super(SceneEnum.RECUPERATION)
    }

    enter()
    {
        this.world = new SceneRecuperationWorld()
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
