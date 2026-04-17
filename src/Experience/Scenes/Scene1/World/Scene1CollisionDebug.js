import CollisionDebug from '../../../Common/CollisionDebug.js'

export default class Scene1CollisionDebug extends CollisionDebug
{
    constructor({ player, scene1Model } = {})
    {
        super({
            player,
            getCollisionBoxes: () => scene1Model?.getCollisionBoxes?.() ?? [],
            folderLabel: '🧱 Scene1 Collision Debug',
            groupName: '__scene1CollisionDebug'
        })
    }
}
