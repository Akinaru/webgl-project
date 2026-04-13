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
        this.removeStaleMapRoots()

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

        this.model = this.resource.scene.clone(true)
        this.model.name = '__mapModelRoot'
        this.model.userData.isMapModelRoot = true
        this.model.position.set(0, 0, 0)
        this.model.scale.set(1, 1, 1)
        this.collisionBoxes = []
        this.collisionMeshes = []

        this.model.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            child.castShadow = true
            child.receiveShadow = true

            if(!child.geometry?.boundingBox)
            {
                child.geometry?.computeBoundingBox?.()
            }

            if(!child.geometry?.boundingBox)
            {
                return
            }

            const size = new THREE.Vector3()
            child.geometry.boundingBox.getSize(size)
            if(!this.shouldUseForCollision(child))
            {
                return
            }

            this.collisionMeshes.push(child)
        })

        this.scene.add(this.model)
        this.model.updateMatrixWorld(true)
        this.buildCollisionBoxes()
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
        this.fallback.userData.isMapModelRoot = true
        this.scene.add(this.fallback)
        this.fallback.updateMatrixWorld(true)
        this.collisionBoxes = [new THREE.Box3().setFromObject(this.fallback)]
        this.collisionMeshes = [this.fallback]
    }

    buildCollisionBoxes()
    {
        this.collisionBoxes = []
        const localBounds = new THREE.Box3()
        const worldBounds = new THREE.Box3()

        this.model.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh) || !child.geometry)
            {
                return
            }

            if(!child.geometry.boundingBox)
            {
                child.geometry.computeBoundingBox()
            }

            if(!child.geometry.boundingBox)
            {
                return
            }

            if(!this.shouldUseForCollision(child))
            {
                return
            }

            localBounds.copy(child.geometry.boundingBox)
            worldBounds.copy(localBounds).applyMatrix4(child.matrixWorld)
            this.collisionBoxes.push(worldBounds.clone())
        })
    }

    shouldUseForCollision(mesh)
    {
        const meshName = (mesh.name || '').toLowerCase()
        const isPalmTreePart = this.isPalmTreePart(mesh)

        if(!isPalmTreePart)
        {
            return true
        }

        const isTrunk = meshName.includes('tronc') || meshName.includes('trunk')
        return isTrunk
    }

    isPalmTreePart(object)
    {
        let current = object
        while(current)
        {
            const name = (current.name || '').toLowerCase()
            if(name.includes('palmier') || name.includes('palm'))
            {
                return true
            }
            current = current.parent
        }
        return false
    }

    getCollisionBoxes()
    {
        return this.collisionBoxes ?? []
    }

    getCollisionMeshes()
    {
        return this.collisionMeshes ?? []
    }

    removeStaleMapRoots()
    {
        const staleRoots = []
        for(const child of this.scene.children)
        {
            if(child?.userData?.isMapModelRoot)
            {
                staleRoots.push(child)
            }
        }

        for(const staleRoot of staleRoots)
        {
            this.scene.remove(staleRoot)
        }
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

        this.collisionBoxes = null
        this.collisionMeshes = null
    }
}
