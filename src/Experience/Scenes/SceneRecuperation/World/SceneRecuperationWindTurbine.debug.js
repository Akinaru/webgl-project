export function setupSceneRecuperationWindTurbineDebug()
{
    if(!this.debug?.isDebugEnabled)
    {
        return
    }

    this.debugFolder = this.debug.addFolder('Eolienne', {
        parent: this.debugParentFolder || this.debug.ui,
        expanded: false
    })
    this.debug.addBinding(this.debugFolder, this.state, 'speed', {
        label: 'Vitesse de rotation de l eolienne',
        min: -1,
        max: 1,
        step: 0.001
    })
}
