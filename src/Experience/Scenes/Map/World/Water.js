import * as THREE from 'three'
import Experience from '../../../Experience.js'

// Water pilote les parametres d eau globaux et les applique au rendu de la map.
const WATER_LEVEL_MIN = 0
const WATER_LEVEL_MAX = 2
const RIPPLE_TIME_SPEED_DEFAULT = 0.065

export default class Water
{
    constructor({ mapModel = null } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.mapModel = mapModel

        this.state = {
            hauteurEau: 1.20,
            hauteurSurface: 0.72,
            hauteurFond: 0.22,
            supplementHauteurSable: 0.39,
            slopeFrequency: 14,
            noiseFrequency: 0.304,
            rippleThreshold: -0.315,
            backgroundOpacity: 0.45,
            rippleTimeSpeed: RIPPLE_TIME_SPEED_DEFAULT,
            showPlan: true
        }

        this.couleurSable = new THREE.Color('#bf9c51')
        this.couleurBleuSurface = new THREE.Color('#1c6972')
        this.couleurBleuFond = new THREE.Color('#031d26')
        this.backgroundColor = new THREE.Color('#124f69')
        this.applyWaterline()
        this.applyPlanVisibility()
        this.update()
        this.setDebug()
    }

    applyWaterline()
    {
        this.state.hauteurEau = THREE.MathUtils.clamp(
            this.state.hauteurEau,
            WATER_LEVEL_MIN,
            WATER_LEVEL_MAX
        )

        if(this.state.hauteurFond > this.state.hauteurEau)
        {
            this.state.hauteurFond = this.state.hauteurEau
        }

        this.state.hauteurSurface = THREE.MathUtils.clamp(
            this.state.hauteurSurface,
            this.state.hauteurFond,
            this.state.hauteurEau
        )

        this.mapModel?.applyTerrainWaterline?.({
            minY: this.state.hauteurEau,
            surfaceY: this.state.hauteurSurface,
            fondY: this.state.hauteurFond,
            sableExtraHeight: this.state.supplementHauteurSable,
            sableColor: this.couleurSable,
            surfaceColor: this.couleurBleuSurface,
            fondColor: this.couleurBleuFond
        })

        this.mapModel?.applyPlanWaterMask?.({
            waterLevel: this.state.hauteurEau,
            slopeFrequency: this.state.slopeFrequency,
            noiseFrequency: this.state.noiseFrequency,
            rippleThreshold: this.state.rippleThreshold,
            backgroundColor: this.backgroundColor,
            backgroundOpacity: this.state.backgroundOpacity
        })
    }

    applyPlanVisibility()
    {
        this.mapModel?.setPlanVisibility?.(this.state.showPlan)
    }

    update()
    {
        const localTime = (this.experience.time.elapsed * 0.001) * this.state.rippleTimeSpeed
        this.mapModel?.setPlanWaterMaskLocalTime?.(localTime)
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('💧 Eau', { expanded: false })
        this.terrainFolder = this.debug.addFolder('Terrain', {
            parent: this.debugFolder,
            expanded: false
        })
        this.wavesFolder = this.debug.addFolder('Vagues', {
            parent: this.debugFolder,
            expanded: false
        })
        this.waterColorFolder = this.debug.addFolder('Couleur Eau', {
            parent: this.debugFolder,
            expanded: false
        })

        this.debug.addBinding(this.terrainFolder, this.state, 'hauteurEau', {
            label: 'Hauteur eau',
            min: WATER_LEVEL_MIN,
            max: WATER_LEVEL_MAX,
            step: 0.01
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.terrainFolder, this.state, 'hauteurSurface', {
            label: 'Hauteur surface',
            min: -20,
            max: 10,
            step: 0.01
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.terrainFolder, this.state, 'hauteurFond', {
            label: 'Hauteur fond',
            min: -20,
            max: 10,
            step: 0.01
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addColorBinding(this.terrainFolder, this, 'couleurSable', {
            label: 'Couleur sable'
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addColorBinding(this.terrainFolder, this, 'couleurBleuSurface', {
            label: 'Couleur bleu surface'
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addColorBinding(this.terrainFolder, this, 'couleurBleuFond', {
            label: 'Couleur bleu fond'
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.terrainFolder, this.state, 'supplementHauteurSable', {
            label: 'Supplement sable',
            min: 0,
            max: 0.7,
            step: 0.01
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.wavesFolder, this.state, 'slopeFrequency', {
            label: 'Frequence pente',
            min: 0,
            max: 80,
            step: 0.01
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.wavesFolder, this.state, 'noiseFrequency', {
            label: 'Frequence bruit',
            min: 0,
            max: 2,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.wavesFolder, this.state, 'rippleThreshold', {
            label: 'Seuil ondulation',
            min: -1,
            max: 2,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.wavesFolder, this.state, 'rippleTimeSpeed', {
            label: 'Vitesse ondulation',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.update()
        })

        this.debug.addColorBinding(this.waterColorFolder, this, 'backgroundColor', {
            label: 'Couleur eau'
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.waterColorFolder, this.state, 'backgroundOpacity', {
            label: 'Opacite eau',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.waterColorFolder, this.state, 'showPlan', {
            label: 'Afficher plan'
        }).on('change', () =>
        {
            this.applyPlanVisibility()
        })
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.mapModel = null
    }
}
