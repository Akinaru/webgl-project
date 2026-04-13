import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class ComplexeLayout
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene

        this.group = new THREE.Group()
        this.scene.add(this.group)

        this.meshes = []

        this.setMaterials()
        this.setLandmarks()
        this.setRoute()
    }

    setMaterials()
    {
        this.routeMaterial = new THREE.MeshStandardMaterial({
            color: '#23436f',
            roughness: 0.55,
            metalness: 0.12,
            emissive: '#13233a',
            emissiveIntensity: 0.28
        })

        this.wallMaterial = new THREE.MeshStandardMaterial({
            color: '#2c3442',
            roughness: 0.74,
            metalness: 0.08
        })

        this.pillarMaterial = new THREE.MeshStandardMaterial({
            color: '#6d7684',
            roughness: 0.62,
            metalness: 0.22
        })
    }

    setLandmarks()
    {
        this.addBox({
            size: [2.2, 2.2, 2.2],
            position: [-18, 1.1, 10],
            material: this.pillarMaterial
        })
        this.addBox({
            size: [2.2, 2.2, 2.2],
            position: [16, 1.1, -4],
            material: this.pillarMaterial
        })
        this.addBox({
            size: [2.8, 3.4, 2.8],
            position: [0, 1.7, -24],
            material: this.pillarMaterial
        })
    }

    setRoute()
    {
        // Plan de deplacement visuel: entree (z=18) -> aile est -> coeur -> sortie nord.
        this.addBox({
            size: [8, 0.08, 28],
            position: [0, 0.04, 6],
            material: this.routeMaterial
        })
        this.addBox({
            size: [20, 0.08, 8],
            position: [10, 0.04, -4],
            material: this.routeMaterial
        })
        this.addBox({
            size: [8, 0.08, 26],
            position: [0, 0.04, -18],
            material: this.routeMaterial
        })

        this.addWallLine({ start: [-4, 2.2, 20], end: [-4, 2.2, -8] })
        this.addWallLine({ start: [4, 2.2, 20], end: [4, 2.2, -8] })
        this.addWallLine({ start: [6, 2.2, -8], end: [20, 2.2, -8] })
        this.addWallLine({ start: [6, 2.2, 0], end: [20, 2.2, 0] })
        this.addWallLine({ start: [-4, 2.2, -10], end: [-4, 2.2, -30] })
        this.addWallLine({ start: [4, 2.2, -10], end: [4, 2.2, -30] })
    }

    addWallLine({ start, end })
    {
        const startVector = new THREE.Vector3(start[0], start[1], start[2])
        const endVector = new THREE.Vector3(end[0], end[1], end[2])
        const center = new THREE.Vector3().addVectors(startVector, endVector).multiplyScalar(0.5)

        const direction = new THREE.Vector3().subVectors(endVector, startVector)
        const length = direction.length()
        const isXAxis = Math.abs(direction.x) >= Math.abs(direction.z)

        this.addBox({
            size: isXAxis ? [length, 4.4, 0.35] : [0.35, 4.4, length],
            position: [center.x, 2.2, center.z],
            material: this.wallMaterial
        })
    }

    addBox({
        size,
        position,
        material
    })
    {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(size[0], size[1], size[2]),
            material
        )
        mesh.position.set(position[0], position[1], position[2])
        mesh.castShadow = true
        mesh.receiveShadow = true

        this.group.add(mesh)
        this.meshes.push(mesh)
    }

    destroy()
    {
        for(const mesh of this.meshes)
        {
            this.group.remove(mesh)
            mesh.geometry.dispose()
        }
        this.meshes = []

        this.routeMaterial?.dispose()
        this.wallMaterial?.dispose()
        this.pillarMaterial?.dispose()

        this.scene.remove(this.group)
        this.group = null
    }
}
