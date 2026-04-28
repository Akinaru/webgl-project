import CollisionDebug from '../../../Common/CollisionDebug.js'

export default class SceneRecuperationCollisionDebug extends CollisionDebug
{
    constructor({ player, recuperationModel, debugParentFolder = null } = {})
    {
        super({
            player,
            getCollisionBoxes: () => recuperationModel?.getCollisionBoxes?.() ?? [],
            folderLabel: 'Collision',
            groupName: '__recuperationCollisionDebug',
            debugParentFolder
        })
    }
}
