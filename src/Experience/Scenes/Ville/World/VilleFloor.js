import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class VilleFloor
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources

        this.setGeometry()
        this.setTextures()
        this.setMaterial()
        this.setMesh()
    }

    setGeometry()
    {
        this.geometry = new THREE.PlaneGeometry(90, 90, 8, 8)
    }

    setTextures()
    {
        this.textures = {}

        this.textures.color = this.resources.items.grassColorTexture || null
        this.textures.normal = this.resources.items.grassNormalTexture || null

        if(this.textures.color)
        {
            this.textures.color.colorSpace = THREE.SRGBColorSpace
            this.textures.color.repeat.set(18, 18)
            this.textures.color.wrapS = THREE.RepeatWrapping
            this.textures.color.wrapT = THREE.RepeatWrapping
        }

        if(this.textures.normal)
        {
            this.textures.normal.repeat.set(18, 18)
            this.textures.normal.wrapS = THREE.RepeatWrapping
            this.textures.normal.wrapT = THREE.RepeatWrapping
        }
    }

    setMaterial()
    {
        this.material = new THREE.MeshStandardMaterial({
            color: '#838b75',
            roughness: 0.9,
            metalness: 0,
            map: this.textures.color,
            normalMap: this.textures.normal
        })
    }

    setMesh()
    {
        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.mesh.rotation.x = -Math.PI * 0.5
        this.mesh.position.y = 0
        this.mesh.receiveShadow = true
        this.scene.add(this.mesh)
    }

    destroy()
    {
        if(this.mesh)
        {
            this.scene.remove(this.mesh)
            this.mesh = null
        }

        this.geometry?.dispose()
        this.material?.dispose()
    }
}
