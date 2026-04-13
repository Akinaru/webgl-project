import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class MapEnvironment
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene

        this.setAmbientLight()
        this.setSunLight()
        this.setFog()
    }

    setAmbientLight()
    {
        this.ambientLight = new THREE.AmbientLight('#ffffff', 0.5)
        this.scene.add(this.ambientLight)
    }

    setSunLight()
    {
        this.sunLight = new THREE.DirectionalLight('#fff1d8', 1.8)
        this.sunLight.position.set(8, 12, 6)
        this.sunLight.castShadow = true
        this.sunLight.shadow.mapSize.set(1024, 1024)
        this.sunLight.shadow.camera.far = 120
        this.sunLight.shadow.camera.left = -45
        this.sunLight.shadow.camera.right = 45
        this.sunLight.shadow.camera.top = 45
        this.sunLight.shadow.camera.bottom = -45
        this.sunLight.shadow.normalBias = 0.03

        this.scene.add(this.sunLight)
    }

    setFog()
    {
        this.scene.background = new THREE.Color('#dbe7f3')
        this.scene.fog = new THREE.Fog('#dbe7f3', 30, 180)
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

        this.scene.background = null
        this.scene.fog = null
    }
}
