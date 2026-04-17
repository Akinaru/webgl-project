import CollisionDebug from '../../../Common/CollisionDebug.js'

export default class MapCollisionDebug extends CollisionDebug
{
    constructor({ player, mapModel } = {})
    {
        super({
            player,
            getCollisionBoxes: () => mapModel?.getCollisionBoxes?.() ?? [],
            folderLabel: '🧱 Map Collision Debug',
            groupName: '__mapCollisionDebug'
        })
    }
}
