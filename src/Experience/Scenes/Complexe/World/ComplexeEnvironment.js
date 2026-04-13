import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class ComplexeEnvironment
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug

        if(this.debug.isDebugEnabled)
        {
            this.debugFolder = this.debug.addFolder('🌙 Complexe Environment')
        }

        this.setFog()
        this.setLights()
    }

    setFog()
    {
        this.scene.fog = new THREE.Fog('#070a11', 14, 92)
        this.scene.background = new THREE.Color('#070a11')
    }

    setLights()
    {
        this.ambientLight = new THREE.AmbientLight('#8fa6ff', 0.3)
        this.scene.add(this.ambientLight)

        this.mainLight = new THREE.DirectionalLight('#ffe2bf', 1.9)
        this.mainLight.position.set(8, 10, 4)
        this.mainLight.castShadow = true
        this.mainLight.shadow.mapSize.set(1024, 1024)
        this.mainLight.shadow.camera.far = 80
        this.mainLight.shadow.camera.left = -30
        this.mainLight.shadow.camera.right = 30
        this.mainLight.shadow.camera.top = 30
        this.mainLight.shadow.camera.bottom = -30
        this.scene.add(this.mainLight)

        if(this.debug.isDebugEnabled)
        {
            this.debug.addBinding(this.debugFolder, this.mainLight, 'intensity', { label: 'mainIntensity', min: 0, max: 6, step: 0.001 })
            this.debug.addBinding(this.debugFolder, this.mainLight.position, 'x', { label: 'mainX', min: -20, max: 20, step: 0.001 })
            this.debug.addBinding(this.debugFolder, this.mainLight.position, 'y', { label: 'mainY', min: -20, max: 20, step: 0.001 })
            this.debug.addBinding(this.debugFolder, this.mainLight.position, 'z', { label: 'mainZ', min: -20, max: 20, step: 0.001 })
        }
    }

    destroy()
    {
        if(this.ambientLight)
        {
            this.scene.remove(this.ambientLight)
            this.ambientLight = null
        }

        if(this.mainLight)
        {
            this.scene.remove(this.mainLight)
            this.mainLight = null
        }

        this.scene.fog = null
        this.scene.background = null
        this.debugFolder?.dispose?.()
    }
}
