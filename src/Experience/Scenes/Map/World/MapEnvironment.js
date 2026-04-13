import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class MapEnvironment
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug

        this.state = {
            fogMode: 'linear',
            fogNear: 28,
            fogFar: 190,
            fogDensity: 0.012
        }

        this.backgroundColor = new THREE.Color('#dbe7f3')
        this.fogColor = new THREE.Color('#dbe7f3')

        this.setFog()
        this.setLights()
        this.setDebug()
    }

    setLights()
    {
        this.ambientLight = new THREE.AmbientLight('#ffffff', 0.42)
        this.scene.add(this.ambientLight)

        this.hemiLight = new THREE.HemisphereLight('#cde7ff', '#7ea16a', 0.45)
        this.scene.add(this.hemiLight)

        this.sunLight = new THREE.DirectionalLight('#fff1d8', 2.15)
        this.sunLight.position.set(10, 14, 7)
        this.sunLight.castShadow = true
        this.sunLight.shadow.mapSize.set(2048, 2048)
        this.sunLight.shadow.camera.far = 180
        this.sunLight.shadow.camera.left = -70
        this.sunLight.shadow.camera.right = 70
        this.sunLight.shadow.camera.top = 70
        this.sunLight.shadow.camera.bottom = -70
        this.sunLight.shadow.normalBias = 0.03

        this.scene.add(this.sunLight)
    }

    setFog()
    {
        this.scene.background = this.backgroundColor
        this.applyFog()
    }

    applyFog()
    {
        if(this.state.fogMode === 'exp2')
        {
            this.scene.fog = new THREE.FogExp2(this.fogColor, this.state.fogDensity)
            return
        }

        this.scene.fog = new THREE.Fog(this.fogColor, this.state.fogNear, this.state.fogFar)
    }

    setDebug()
    {
        if(!this.debug.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('🌤 Map Environment', { expanded: false })

        this.debug.addBinding(this.debugFolder, this.ambientLight, 'intensity', { label: 'ambient', min: 0, max: 3, step: 0.001 })
        this.debug.addBinding(this.debugFolder, this.hemiLight, 'intensity', { label: 'hemi', min: 0, max: 3, step: 0.001 })
        this.debug.addBinding(this.debugFolder, this.sunLight, 'intensity', { label: 'sun', min: 0, max: 5, step: 0.001 })

        this.debug.addBinding(this.debugFolder, this.sunLight.position, 'x', { label: 'sunX', min: -40, max: 40, step: 0.001 })
        this.debug.addBinding(this.debugFolder, this.sunLight.position, 'y', { label: 'sunY', min: 0, max: 50, step: 0.001 })
        this.debug.addBinding(this.debugFolder, this.sunLight.position, 'z', { label: 'sunZ', min: -40, max: 40, step: 0.001 })

        this.debug.addColorBinding(this.debugFolder, this, 'backgroundColor', { label: 'bg' })
        this.debug.addColorBinding(this.debugFolder, this, 'fogColor', { label: 'fogColor' })
        this.debug.addColorBinding(this.debugFolder, this.ambientLight, 'color', { label: 'ambientColor' })
        this.debug.addColorBinding(this.debugFolder, this.hemiLight, 'color', { label: 'skyColor' })
        this.debug.addColorBinding(this.debugFolder, this.hemiLight, 'groundColor', { label: 'groundColor' })
        this.debug.addColorBinding(this.debugFolder, this.sunLight, 'color', { label: 'sunColor' })

        this.debug.addBinding(this.debugFolder, this.state, 'fogMode', {
            label: 'fogMode',
            options: {
                linear: 'linear',
                exp2: 'exp2'
            }
        }).on('change', () =>
        {
            this.applyFog()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'fogNear', { label: 'fogNear', min: 1, max: 300, step: 0.1 }).on('change', () =>
        {
            this.applyFog()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'fogFar', { label: 'fogFar', min: 1, max: 500, step: 0.1 }).on('change', () =>
        {
            this.applyFog()
        })

        this.debug.addBinding(this.debugFolder, this.state, 'fogDensity', { label: 'fogDensity', min: 0.0001, max: 0.08, step: 0.0001 }).on('change', () =>
        {
            this.applyFog()
        })
    }

    destroy()
    {
        if(this.ambientLight)
        {
            this.scene.remove(this.ambientLight)
            this.ambientLight = null
        }

        if(this.sunLight)
        {
            this.scene.remove(this.sunLight)
            this.sunLight = null
        }

        if(this.hemiLight)
        {
            this.scene.remove(this.hemiLight)
            this.hemiLight = null
        }

        this.scene.background = null
        this.scene.fog = null
        this.debugFolder?.dispose?.()
    }
}
