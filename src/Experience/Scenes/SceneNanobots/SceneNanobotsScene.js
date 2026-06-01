import BaseScene from '../BaseScene.js'
import SceneEnum from '../../Enum/SceneEnum.js'
import SceneRecyclageWorld from '../SceneRecyclage/World/World.js'
import { SCENE_RECYCLAGE_VARIANTS } from '../SceneRecyclage/SceneRecyclage.config.js'

export default class SceneNanobotsScene extends BaseScene
{
    constructor()
    {
        super(SceneEnum.NANOBOTS)
    }

    enter()
    {
        this.world = new SceneRecyclageWorld(SCENE_RECYCLAGE_VARIANTS[SceneEnum.NANOBOTS])
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
