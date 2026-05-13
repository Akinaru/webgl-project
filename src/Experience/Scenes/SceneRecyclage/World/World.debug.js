export function setupSceneRecyclageWorldDebug()
{
    if(!this.experience?.debug?.isDebugEnabled || this.debugFolder)
    {
        return
    }

    this.debugFolder = this.experience.debug.addFolder('Scene recyclage', { expanded: false })
}
