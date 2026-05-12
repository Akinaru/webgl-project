export function setupSceneDistributionValveControllerDebug()
{
    if(!this.debug?.isDebugEnabled || !this.debugParentFolder)
    {
        return
    }

    this.debugFolder = this.debug.addFolder('Vannes', {
        parent: this.debugParentFolder,
        expanded: false
    })

    this.debug.addBinding(this.debugFolder, this.settings, 'turnSpeedMultiplier', {
        label: 'Vitesse de rotation de la vanne',
        min: 0.1,
        max: 3,
        step: 0.01
    })

    this.debug.addBinding(this.debugFolder, this.settings, 'gestureRotationGain', {
        label: 'Sensibilite du geste souris',
        min: 0.1,
        max: 4,
        step: 0.01
    })

    this.debug.addBinding(this.debugFolder, this.settings, 'maxVisualOffset', {
        label: 'Amplitude visuelle du curseur',
        min: 2,
        max: 30,
        step: 0.5
    })
}
