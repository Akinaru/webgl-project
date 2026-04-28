import BaseScene from '../BaseScene.js'
import SceneEnum from '../../Enum/SceneEnum.js'
import SceneDistributionWorld from './World/SceneDistributionWorld.js'

export default class SceneDistributionScene extends BaseScene
{
    constructor()
    {
        super(SceneEnum.DISTRIBUTION)
        this.hudHint = 'Distribution: clique pour pointer lock, ZQSD/WASD pour te deplacer.'
    }

    enter()
    {
        this.world = new SceneDistributionWorld()
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
