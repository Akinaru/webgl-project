export function setupSceneDistributionWorldDebug()
{
    if(!this.experience?.debug?.isDebugEnabled || this.debugFolder)
    {
        return
    }

    this.debugFolder = this.experience.debug.addFolder('Scene distribution', { expanded: false })
}
