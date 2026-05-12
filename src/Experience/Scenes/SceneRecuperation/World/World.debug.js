export function setupSceneRecuperationWorldDebug()
{
    if(!this.experience?.debug?.isDebugEnabled || this.debugFolder)
    {
        return
    }

    this.debugFolder = this.experience.debug.addFolder('Scene recuperation', { expanded: false })
    this.waterDebugFolder = this.experience.debug.addFolder('Eau', {
        parent: this.debugFolder,
        expanded: false
    })
    this.waterColorsDebugFolder = this.experience.debug.addFolder('Couleurs', {
        parent: this.waterDebugFolder,
        expanded: false
    })
    this.waterTubesDebugFolder = this.experience.debug.addFolder('Tuyaux', {
        parent: this.waterDebugFolder,
        expanded: false
    })
    this.waterSlopesDebugFolder = this.experience.debug.addFolder('Pentes', {
        parent: this.waterDebugFolder,
        expanded: false
    })
    this.waterPlanDebugFolder = this.experience.debug.addFolder('Plan', {
        parent: this.waterDebugFolder,
        expanded: false
    })
}
