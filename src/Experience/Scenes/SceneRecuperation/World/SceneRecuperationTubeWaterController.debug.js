export function setupSceneRecuperationTubeWaterControllerDebug()
{
    if(!this.debug?.isDebugEnabled)
    {
        return
    }

    this.debugFolder = this.debug.addFolder('Flux des tuyaux', {
        parent: this.debugParentFolder || this.debug.ui,
        expanded: false
    })
    this.debug.addBinding(this.debugFolder, this.flow, 'fillSpeed', {
        label: 'Vitesse de remplissage',
        min: 0.1,
        max: 8,
        step: 0.05
    })
    this.debug.addBinding(this.debugFolder, this.rotation, 'speed', {
        label: 'Vitesse de rotation des jonctions',
        min: Math.PI * 0.25,
        max: Math.PI * 8,
        step: 0.05
    })

    this.debugShaderFolder = this.debug.addFolder('Shader de l eau', {
        parent: this.debugFolder,
        expanded: false
    })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'animateTubeOpacity', { label: 'Animer opacite des tuyaux' })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'animateWindowOpacity', { label: 'Animer opacite des fenetres' })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'foamSpeedMultiplier', {
        label: 'Vitesse de la mousse',
        min: 0,
        max: 8,
        step: 0.01
    })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'foamRotation', {
        label: 'Rotation de la mousse',
        min: -Math.PI,
        max: Math.PI,
        step: 0.01
    })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'foamScalePrimary', { label: 'Echelle mousse A', min: 0.1, max: 12, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'foamScaleSecondary', { label: 'Echelle mousse B', min: 0.1, max: 16, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'bodyScale', { label: 'Echelle du corps d eau', min: 0.1, max: 8, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'repeatNoiseScale', { label: 'Echelle du bruit', min: 0.1, max: 12, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'repeatNoiseStrength', { label: 'Force du bruit', min: 0, max: 1, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'foamThresholdMin', { label: 'Seuil mousse minimum', min: 0, max: 1, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'foamThresholdMax', { label: 'Seuil mousse maximum', min: 0, max: 1, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'foamMix', { label: 'Melange de mousse', min: 0, max: 1, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'foamOpacity', { label: 'Opacite de la mousse', min: 0, max: 1, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'frontOpacity', { label: 'Opacite du front', min: 0, max: 1, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'frontWidthSingle', { label: 'Largeur du front simple', min: 0.01, max: 0.6, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'frontWidthDual', { label: 'Largeur du front double', min: 0.01, max: 0.6, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'waterShadowStrength', { label: 'Force de l ombre dans l eau', min: 0, max: 1.5, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'waterMidLow', { label: 'Seuil moyen bas', min: 0, max: 2, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'waterMidHigh', { label: 'Seuil moyen haut', min: 0, max: 2, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'waterHighlightMix', { label: 'Intensite des reflets', min: 0, max: 1, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'bodyBlendBase', { label: 'Base du melange corps', min: 0, max: 1, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'bodyBlendGain', { label: 'Gain du melange corps', min: 0, max: 1, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'emissiveBase', { label: 'Emission de base', min: 0, max: 2, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'emissiveFoam', { label: 'Emission de la mousse', min: 0, max: 2, step: 0.01 })
    this.debug.addBinding(this.debugShaderFolder, this.waterShader, 'emissiveFront', { label: 'Emission du front', min: 0, max: 2, step: 0.01 })
    const foamColorBinding = this.debug.addColorBinding(this.debugShaderFolder, this.waterShader, 'foamColor', {
        label: 'Couleur de la mousse'
    })
    foamColorBinding?.on?.('change', () =>
    {
        this.foamColor.set(this.waterShader.foamColor)
    })
}
