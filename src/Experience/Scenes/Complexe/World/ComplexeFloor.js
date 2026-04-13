import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class ComplexeFloor
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene

        this.setGeometry()
        this.setMaterial()
        this.setMesh()
    }

    setGeometry()
    {
        this.geometry = new THREE.PlaneGeometry(120, 120, 1, 1)
    }

    setMaterial()
    {
        this.material = new THREE.MeshStandardMaterial({
            color: '#111722',
            roughness: 0.86,
            metalness: 0.04
        })
    }

    setMesh()
    {
        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.mesh.rotation.x = -Math.PI * 0.5
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
