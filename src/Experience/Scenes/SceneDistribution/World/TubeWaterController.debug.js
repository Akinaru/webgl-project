export function setupSceneDistributionTubeWaterControllerDebug()
{
    if(!this.debug?.isDebugEnabled || !this.debugParentFolder)
    {
        return
    }

    this.debugFolder = this.debug.addFolder('Remplissage des tuyaux', {
        parent: this.debugParentFolder,
        expanded: false
    })

    this.debug.addBinding(this.debugFolder, this.settings, 'radiansPerTubeFill', {
        label: 'Rotation necessaire pour remplir un tuyau',
        min: Math.PI * 0.25,
        max: Math.PI * 6,
        step: 0.01
    })

    this.debug.addBinding(this.debugFolder, this.settings, 'fillEdgeSoftness', {
        label: 'Douceur du front de remplissage',
        min: 0.001,
        max: 0.2,
        step: 0.001
    })
}
