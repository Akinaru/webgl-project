import BaseScene from '../BaseScene.js'
import SceneEnum from '../../Enum/SceneEnum.js'
import ComplexeWorld from './World/ComplexeWorld.js'

export default class ComplexeScene extends BaseScene
{
    constructor()
    {
        super(SceneEnum.COMPLEXE)
        this.hudHint = 'Complexe: avance de l entree vers le couloir central, bifurque a droite dans l aile est, puis remonte vers la tour nord.'
    }

    enter()
    {
        this.world = new ComplexeWorld()
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
