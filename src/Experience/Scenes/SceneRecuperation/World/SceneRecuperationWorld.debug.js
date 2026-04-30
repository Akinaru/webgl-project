export function setupSceneRecuperationWorldDebug()
{
    if(!this.experience?.debug?.isDebugEnabled || this.debugFolder)
    {
        return
    }

    this.debugFolder = this.experience.debug.addFolder('Scene recuperation', { expanded: false })
}
