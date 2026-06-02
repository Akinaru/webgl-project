import BaseScene from '../BaseScene.js'
import SceneEnum from '../../Enum/SceneEnum.js'
import SceneRecyclageWorld from '../SceneRecyclage/World/World.js'
import { SCENE_RECYCLAGE_VARIANTS } from '../SceneRecyclage/SceneRecyclage.config.js'
import NanobotInspector from './NanobotInspector.js'

export default class SceneNanobotsScene extends BaseScene
{
    constructor()
    {
        super(SceneEnum.NANOBOTS)
    }

    enter()
    {
        this.world = new SceneRecyclageWorld(SCENE_RECYCLAGE_VARIANTS[SceneEnum.NANOBOTS])
        this.nanobotInspector = new NanobotInspector({ world: this.world })
    }

    update(delta)
    {
        this.world?.update(delta)
        this.nanobotInspector?.update(delta)
    }

    destroy()
    {
        this.nanobotInspector?.destroy?.()
        this.nanobotInspector = null
        this.world?.destroy?.()
        this.world = null
    }
}
