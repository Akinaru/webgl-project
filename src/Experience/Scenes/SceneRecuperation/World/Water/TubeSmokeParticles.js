import * as THREE from 'three'
import Experience from '../../../../Experience.js'

export default class TubeSmokeParticles
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        
        this.count = 200
        this.particles = []
        this.nextIndex = 0

        this.tmpMatrix = new THREE.Matrix4()
        this.tmpPosition = new THREE.Vector3()
        this.tmpQuaternion = new THREE.Quaternion()
        this.tmpScale = new THREE.Vector3()

        this.setGeometry()
        this.setMaterial()
        this.setMesh()
        this.setParticles()
    }

    setGeometry()
    {
        this.geometry = new THREE.SphereGeometry(1, 8, 8)
    }

    setMaterial()
    {
        this.material = new THREE.MeshBasicMaterial({
            color: '#ffffff',
            transparent: true,
            opacity: 0.4,
            depthWrite: false
        })
    }

    setMesh()
    {
        this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.count)
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.mesh.frustumCulled = false
        this.scene.add(this.mesh)
        
        // Hide all initially
        this.tmpScale.setScalar(0)
        this.tmpMatrix.makeScale(0, 0, 0)
        for(let i = 0; i < this.count; i++)
        {
            this.mesh.setMatrixAt(i, this.tmpMatrix)
        }
        this.mesh.instanceMatrix.needsUpdate = true
    }

    setParticles()
    {
        for(let i = 0; i < this.count; i++)
        {
            this.particles.push({
                active: false,
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                life: 0,
                maxLife: 0,
                baseScale: 0
            })
        }
    }

    triggerBurst(position, particleCount = 15)
    {
        for(let i = 0; i < particleCount; i++)
        {
            const particle = this.particles[this.nextIndex]
            this.nextIndex = (this.nextIndex + 1) % this.count

            particle.active = true
            particle.position.copy(position)
            
            // Random velocity in a sphere
            particle.velocity.set(
                (Math.random() - 0.5) * 2.5,
                (Math.random() - 0.5) * 2.5,
                (Math.random() - 0.5) * 2.5
            )
            
            particle.life = 0
            particle.maxLife = 0.6 + Math.random() * 0.4
            particle.baseScale = 0.08 + Math.random() * 0.12
        }
    }

    update(deltaMs)
    {
        const deltaSeconds = deltaMs * 0.001
        let hasUpdate = false

        for(let i = 0; i < this.count; i++)
        {
            const particle = this.particles[i]
            if(!particle.active) continue

            particle.life += deltaSeconds
            if(particle.life >= particle.maxLife)
            {
                particle.active = false
                this.tmpMatrix.makeScale(0, 0, 0)
                this.mesh.setMatrixAt(i, this.tmpMatrix)
                hasUpdate = true
                continue
            }

            // Move
            particle.position.addScaledVector(particle.velocity, deltaSeconds)
            particle.velocity.multiplyScalar(0.96) // Friction

            // Scale animation: grow then shrink
            const progress = particle.life / particle.maxLife
            let scale = 0
            if(progress < 0.2)
            {
                scale = (progress / 0.2) * particle.baseScale
            }
            else
            {
                scale = (1 - (progress - 0.2) / 0.8) * particle.baseScale
            }

            this.tmpPosition.copy(particle.position)
            this.tmpScale.setScalar(scale)
            this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, this.tmpScale)
            this.mesh.setMatrixAt(i, this.tmpMatrix)
            hasUpdate = true
        }

        if(hasUpdate)
        {
            this.mesh.instanceMatrix.needsUpdate = true
        }
    }

    destroy()
    {
        this.scene.remove(this.mesh)
        this.geometry.dispose()
        this.material.dispose()
    }
}
