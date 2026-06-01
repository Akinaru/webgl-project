export function setupSceneRecyclageWorldDebug()
{
    if(!this.experience?.debug?.isDebugEnabled || this.debugFolder)
    {
        return
    }

    this.debugFolder = this.experience.debug.addFolder(this.variantConfig?.debugLabel || 'Scene recyclage', { expanded: false })
}
