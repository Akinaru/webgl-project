import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class VilleEnvironment
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources

        this.setAmbientLight()
        this.setSunLight()
        this.setEnvironmentMap()
    }

    setAmbientLight()
    {
        this.ambientLight = new THREE.AmbientLight('#ffffff', 0.35)
        this.scene.add(this.ambientLight)
    }

    setSunLight()
    {
        this.sunLight = new THREE.DirectionalLight('#ffffff', 2.5)
        this.sunLight.castShadow = true
        this.sunLight.shadow.camera.far = 60
        this.sunLight.shadow.camera.left = -28
        this.sunLight.shadow.camera.right = 28
        this.sunLight.shadow.camera.top = 28
        this.sunLight.shadow.camera.bottom = -28
        this.sunLight.shadow.mapSize.set(1024, 1024)
        this.sunLight.shadow.normalBias = 0.05
        this.sunLight.position.set(3, 5, -2)

        this.scene.add(this.sunLight)
    }

    setEnvironmentMap()
    {
        this.environmentMap = {}
        this.environmentMap.intensity = 0.4
        this.environmentMap.texture = this.resources.items.environmentMapTexture || null

        this.environmentMap.updateMaterials = () =>
        {
            this.scene.traverse((child) =>
            {
                if(child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial)
                {
                    child.material.envMap = this.environmentMap.texture
                    child.material.envMapIntensity = this.environmentMap.intensity
                    child.material.needsUpdate = true
                }
            })
        }

        if(this.environmentMap.texture)
        {
            this.environmentMap.texture.colorSpace = THREE.SRGBColorSpace
            this.scene.environment = this.environmentMap.texture
        }

        this.environmentMap.updateMaterials()
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

        this.scene.environment = null
    }
}
