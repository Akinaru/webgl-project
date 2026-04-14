import BaseScene from '../BaseScene.js'
import SceneEnum from '../../Enum/SceneEnum.js'
import Scene1World from './World/Scene1World.js'

export default class Scene1Scene extends BaseScene
{
    constructor()
    {
        super(SceneEnum.SCENE1)
        this.hudHint = 'Scene1: tu viens d etre teleporte. Clique pour pointer lock, ZQSD/WASD pour te deplacer.'
    }

    enter()
    {
        this.world = new Scene1World()
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
