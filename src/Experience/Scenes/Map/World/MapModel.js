import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class MapModel
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources

        this.resource = this.resources.items.mapModel

        if(this.resource?.scene)
        {
            this.setModel()
        }
        else
        {
            this.setFallback()
        }
    }

    setModel()
    {
        this.model = this.resource.scene.clone(true)
        this.model.position.set(0, 0, 0)
        this.model.scale.set(1, 1, 1)

        this.model.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            child.castShadow = true
            child.receiveShadow = true
        })

        this.scene.add(this.model)
    }

    setFallback()
    {
        this.fallback = new THREE.Mesh(
            new THREE.BoxGeometry(8, 2, 8),
            new THREE.MeshStandardMaterial({
                color: '#607088',
                roughness: 0.6,
                metalness: 0.05
            })
        )
        this.fallback.position.y = 1
        this.fallback.castShadow = true
        this.fallback.receiveShadow = true
        this.scene.add(this.fallback)
    }

    destroy()
    {
        if(this.model)
        {
            this.scene.remove(this.model)
            this.model = null
        }

        if(this.fallback)
        {
            this.scene.remove(this.fallback)
            this.fallback.geometry.dispose()
            this.fallback.material.dispose()
            this.fallback = null
        }
    }
}
