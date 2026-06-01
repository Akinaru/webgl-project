import BaseScene from '../BaseScene.js'
import SceneEnum from '../../Enum/SceneEnum.js'
import SceneRecyclageWorld from './World/World.js'
import { SCENE_RECYCLAGE_VARIANTS } from './SceneRecyclage.config.js'

export default class SceneRecyclageScene extends BaseScene
{
    constructor()
    {
        super(SceneEnum.RECYCLAGE)
    }

    enter()
    {
        this.world = new SceneRecyclageWorld(SCENE_RECYCLAGE_VARIANTS[SceneEnum.RECYCLAGE])
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
