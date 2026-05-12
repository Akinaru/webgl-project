import * as THREE from 'three'
import Experience from '../../../Experience.js'
import * as ShowerParticlesConstants from './ShowerParticles.constants.js'
export default class ShowerParticles
{
    constructor({ recuperationModel = null } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.recuperationModel = recuperationModel
        this.tmpMatrix = new THREE.Matrix4()
        this.tmpPosition = new THREE.Vector3()
        this.tmpScale = new THREE.Vector3(1, 1, 1)
        this.tmpQuaternion = new THREE.Quaternion()
        this.isActive = false
        this.remainingDuration = 0
        this.origin = new THREE.Vector3()
        this.spread = new THREE.Vector3(0.35, 0, 0.35)
        this.floorY = -2.5

        this.shower = this.recuperationModel?.getFirstObjectForNameTokens?.(ShowerParticlesConstants.SHOWER_NAME_TOKENS, { exact: true }) ?? null
        this.setBoundsFromShower()
        this.setMesh()
        this.resetDrops()
    }

    setBoundsFromShower()
    {
        if(!this.shower)
        {
            return
        }

        const bounds = new THREE.Box3().setFromObject(this.shower)
        const center = bounds.getCenter(new THREE.Vector3())
        const size = bounds.getSize(new THREE.Vector3())

        this.origin.set(center.x, bounds.min.y, center.z)
        this.spread.set(
            Math.max(0.25, size.x * 0.45),
            0,
            Math.max(0.25, size.z * 0.45)
        )
        this.floorY = bounds.min.y - 3.6
    }

    setMesh()
    {
        this.geometry = new THREE.CapsuleGeometry(ShowerParticlesConstants.DROP_RADIUS, ShowerParticlesConstants.DROP_LENGTH, 2, 6)
        this.material = new THREE.MeshBasicMaterial({
            color: '#8fd3ff',
            transparent: true,
            opacity: 0.75,
            depthWrite: false
        })
        this.mesh = new THREE.InstancedMesh(this.geometry, this.material, ShowerParticlesConstants.DROP_COUNT)
        this.mesh.visible = false
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.scene.add(this.mesh)

        this.drops = Array.from({ length: ShowerParticlesConstants.DROP_COUNT }, () => ({
            position: new THREE.Vector3(),
            speed: 0
        }))
    }

    resetDrop(drop, randomizeY = true)
    {
        drop.position.set(
            this.origin.x + (Math.random() - 0.5) * this.spread.x * 2,
            this.origin.y - (randomizeY ? Math.random() * 1.8 : 0),
            this.origin.z + (Math.random() - 0.5) * this.spread.z * 2
        )
        drop.speed = THREE.MathUtils.lerp(ShowerParticlesConstants.FALL_SPEED_MIN, ShowerParticlesConstants.FALL_SPEED_MAX, Math.random())
    }

    resetDrops()
    {
        for(const drop of this.drops)
        {
            this.resetDrop(drop, true)
        }

        this.syncMesh()
    }

    start(durationSeconds = 5.5)
    {
        this.isActive = true
        this.remainingDuration = durationSeconds
        this.mesh.visible = true
        this.resetDrops()
    }

    stop()
    {
        this.isActive = false
        this.remainingDuration = 0
        if(this.mesh)
        {
            this.mesh.visible = false
        }
    }

    update(deltaMs = this.experience.time.delta)
    {
        if(!this.isActive)
        {
            return
        }

        const deltaSeconds = Math.max(0.001, Math.min(0.05, (deltaMs || 16.67) * 0.001))
        this.remainingDuration = Math.max(0, this.remainingDuration - deltaSeconds)
        if(this.remainingDuration <= 0)
        {
            this.stop()
            return
        }

        for(const drop of this.drops)
        {
            drop.position.y -= drop.speed * deltaSeconds
            if(drop.position.y <= this.floorY)
            {
                this.resetDrop(drop, false)
            }
        }

        this.syncMesh()
    }

    syncMesh()
    {
        if(!this.mesh)
        {
            return
        }

        for(let index = 0; index < this.drops.length; index++)
        {
            const drop = this.drops[index]
            this.tmpPosition.copy(drop.position)
            this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, this.tmpScale)
            this.mesh.setMatrixAt(index, this.tmpMatrix)
        }

        this.mesh.instanceMatrix.needsUpdate = true
    }

    destroy()
    {
        if(this.mesh)
        {
            this.scene.remove(this.mesh)
            this.mesh.geometry.dispose()
            this.mesh.material.dispose()
        }

        this.mesh = null
        this.geometry = null
        this.material = null
        this.shower = null
        this.drops = null
        this.recuperationModel = null
    }
}
