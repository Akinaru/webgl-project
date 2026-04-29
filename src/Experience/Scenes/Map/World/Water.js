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
            hauteurEau: 1.17,
            hauteurSurface: 0.55,
            hauteurFond: 0.22,
            supplementHauteurSable: 0.47,
            slopeFrequency: 10.43,
            noiseFrequency: 0.326,
            rippleThreshold: -0.185,
            backgroundOpacity: 0.446,
            largeurMousseBord: 0.042,
            douceurMousseBord: 0.034,
            frequenceMousse: 0,
            seuilMousse: 0.293,
            intensiteMousse: 0.696,
            opaciteMousse: 1,
            eauTransparenteMousseSeulement: false,
            rippleTimeSpeed: 0.033,
            showPlan: true
        }

        this.couleurSable = new THREE.Color('#f8d487')
        this.couleurBleuSurface = new THREE.Color('#1dd6eb')
        this.couleurBleuFond = new THREE.Color('#0b515f')
        this.backgroundColor = new THREE.Color('#1dd6eb')
        this.couleurMousse = new THREE.Color('#ffffff')
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
            backgroundOpacity: this.state.backgroundOpacity,
            foamEdgeWidth: this.state.largeurMousseBord,
            foamEdgeSoftness: this.state.douceurMousseBord,
            foamNoiseFrequency: this.state.frequenceMousse,
            foamThreshold: this.state.seuilMousse,
            foamIntensity: this.state.intensiteMousse,
            foamOpacity: this.state.opaciteMousse,
            foamColor: this.couleurMousse,
            onlyFoam: this.state.eauTransparenteMousseSeulement
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
        this.foamFolder = this.debug.addFolder('Mousse', {
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

        this.debug.addBinding(this.foamFolder, this.state, 'largeurMousseBord', {
            label: 'Largeur mousse',
            min: 0.01,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.foamFolder, this.state, 'douceurMousseBord', {
            label: 'Douceur mousse',
            min: 0.001,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.foamFolder, this.state, 'frequenceMousse', {
            label: 'Frequence mousse',
            min: 0,
            max: 4,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.foamFolder, this.state, 'seuilMousse', {
            label: 'Seuil mousse',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.foamFolder, this.state, 'intensiteMousse', {
            label: 'Intensite mousse',
            min: 0,
            max: 2,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.foamFolder, this.state, 'opaciteMousse', {
            label: 'Opacite mousse',
            min: 0,
            max: 1,
            step: 0.001
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addColorBinding(this.foamFolder, this, 'couleurMousse', {
            label: 'Couleur mousse'
        }).on('change', () =>
        {
            this.applyWaterline()
        })

        this.debug.addBinding(this.foamFolder, this.state, 'eauTransparenteMousseSeulement', {
            label: 'Eau transparente'
        }).on('change', () =>
        {
            this.applyWaterline()
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
