import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class MapFog
{
    constructor({ environment = null } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug
        this.environment = environment

        this.settings = {
            enabled: true,
            visible: true,
            near: 5,
            far: 35,
            color: new THREE.Color(environment?.backgroundColor instanceof THREE.Color
                ? environment.backgroundColor
                : (environment?.backgroundColor ?? '#55daff'))
        }

        this.fog = null
        this.applyFog()
        this.setDebug()
    }

    applyFog()
    {
        if(!this.settings.enabled)
        {
            this.scene.fog = null
            this.fog = null
            return
        }

        if(!this.fog)
        {
            this.fog = new THREE.Fog(this.settings.color.clone(), this.settings.near, this.settings.far)
        }

        this.fog.color.copy(this.settings.color)
        this.fog.near = this.settings.near
        this.fog.far = this.settings.far

        this.scene.fog = this.settings.visible ? this.fog : null
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('🌫 Brouillard', { expanded: true })

        this.debug.addBinding(this.debugFolder, this.settings, 'enabled', {
            label: 'Activer le brouillard',
            export: false
        }).on('change', () =>
        {
            this.applyFog()
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'visible', {
            label: 'Afficher le fog',
            export: false
        }).on('change', () =>
        {
            this.applyFog()
        })

        this.debug.addColorBinding(this.debugFolder, this.settings, 'color', {
            label: 'Couleur'
        }).on('change', () =>
        {
            this.applyFog()
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'near', {
            label: 'Debut du brouillard',
            min: 0,
            max: 200,
            step: 0.5
        }).on('change', () =>
        {
            this.applyFog()
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'far', {
            label: 'Fin du brouillard',
            min: 1,
            max: 400,
            step: 0.5
        }).on('change', () =>
        {
            this.applyFog()
        })
    }

    update()
    {
        if(!this.fog || !this.settings.enabled)
        {
            return
        }

        this.fog.color.copy(this.settings.color)
        this.fog.near = this.settings.near
        this.fog.far = this.settings.far
        this.scene.fog = this.settings.visible ? this.fog : null
    }

    destroy()
    {
        this.scene.fog = null
        this.fog = null
        this.debugFolder?.dispose?.()
    }
}
