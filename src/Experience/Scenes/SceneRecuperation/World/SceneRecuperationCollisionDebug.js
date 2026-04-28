import CollisionDebug from '../../../Common/CollisionDebug.js'

export default class SceneRecuperationCollisionDebug extends CollisionDebug
{
    constructor({ player, recuperationModel } = {})
    {
        super({
            player,
            getCollisionBoxes: () => recuperationModel?.getCollisionBoxes?.() ?? [],
            folderLabel: '🧱 Recuperation Collision Debug',
            groupName: '__recuperationCollisionDebug'
        })
    }
}
