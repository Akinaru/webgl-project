import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class ComplexeEnvironment
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug

        if(this.debug.active)
        {
            this.debugFolder = this.debug.ui.addFolder('complexeEnvironment')
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

        if(this.debug.active)
        {
            this.debugFolder.add(this.mainLight, 'intensity').name('mainIntensity').min(0).max(6).step(0.001)
            this.debugFolder.add(this.mainLight.position, 'x').name('mainX').min(-20).max(20).step(0.001)
            this.debugFolder.add(this.mainLight.position, 'y').name('mainY').min(-20).max(20).step(0.001)
            this.debugFolder.add(this.mainLight.position, 'z').name('mainZ').min(-20).max(20).step(0.001)
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
        this.debugFolder?.destroy?.()
    }
}
