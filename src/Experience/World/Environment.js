import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Environment
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.debug = this.experience.debug

        if(this.debug.active)
        {
            this.debugFolder = this.debug.ui.addFolder('environment')
        }

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

        if(this.debug.active)
        {
            this.debugFolder.add(this.sunLight, 'intensity').name('sunIntensity').min(0).max(10).step(0.001)
            this.debugFolder.add(this.sunLight.position, 'x').name('sunX').min(-10).max(10).step(0.001)
            this.debugFolder.add(this.sunLight.position, 'y').name('sunY').min(-10).max(10).step(0.001)
            this.debugFolder.add(this.sunLight.position, 'z').name('sunZ').min(-10).max(10).step(0.001)
        }
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

        if(this.debug.active)
        {
            this.debugFolder
                .add(this.environmentMap, 'intensity')
                .name('envMapIntensity')
                .min(0)
                .max(4)
                .step(0.001)
                .onChange(this.environmentMap.updateMaterials)
        }
    }
}
