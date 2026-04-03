import BaseScene from '../BaseScene.js'
import SceneEnum from '../../Enum/SceneEnum.js'
import VilleWorld from './World/VilleWorld.js'

export default class VilleScene extends BaseScene
{
    constructor()
    {
        super(SceneEnum.VILLE)
        this.hudHint = 'Ville: clique pour pointer lock, ZQSD/WASD pour te deplacer, Shift pour sprinter, Space pour sauter.'
    }

    enter()
    {
        this.world = new VilleWorld()
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
