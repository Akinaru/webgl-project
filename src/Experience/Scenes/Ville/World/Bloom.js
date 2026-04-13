import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class Bloom
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time

        this.resource = this.resources.items.bloomModel
        this.tmpQuaternion = new THREE.Quaternion()
        this.direction = new THREE.Vector3()

        this.motion = {
            center: new THREE.Vector3(0, 0, -6),
            radius: 7,
            turnSpeed: 0.26,
            walkFrequency: 1.7,
            bobAmplitude: 0.06,
            swingIntensity: 1
        }

        this.armNodes = []

        if(this.resource?.scene)
        {
            this.setModel()
            this.setArmRig()
        }
        else
        {
            this.setFallback()
        }
    }

    setModel()
    {
        this.model = this.resource.scene

        const bounds = new THREE.Box3().setFromObject(this.model)
        const size = bounds.getSize(new THREE.Vector3())
        const targetHeight = 1.7
        const scale = size.y > 0 ? targetHeight / size.y : 1

        this.model.scale.setScalar(scale)
        this.baseY = -bounds.min.y * scale
        this.baseYaw = this.model.rotation.y
        this.model.position.y = this.baseY

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

    setArmRig()
    {
        this.model.traverse((child) =>
        {
            const nodeName = child.name?.toLowerCase() || ''
            const isArmGroup = nodeName.includes('bras')
            const isHand = nodeName.includes('main')

            if(!isArmGroup && !isHand)
            {
                return
            }

            const isRightSide = child.position.x >= 0

            this.armNodes.push({
                node: child,
                baseQuaternion: child.quaternion.clone(),
                axis: isArmGroup ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0),
                amplitude: isArmGroup ? 0.2 : 0.7,
                direction: isArmGroup ? 1 : (isRightSide ? 1 : -1),
                phaseOffset: isArmGroup ? 0 : (isRightSide ? 0 : Math.PI),
                frequencyMultiplier: isArmGroup ? 1 : 1.1
            })
        })
    }

    setFallback()
    {
        this.fallback = new THREE.Mesh(
            new THREE.TorusKnotGeometry(0.45, 0.16, 150, 24),
            new THREE.MeshStandardMaterial({
                color: '#f0f2ff',
                roughness: 0.2,
                metalness: 0.4
            })
        )

        this.fallback.position.y = 0.2
        this.fallback.castShadow = true
        this.scene.add(this.fallback)
    }

    update()
    {
        if(this.model)
        {
            this.updateMotion()
            this.updateArms()
            return
        }

        if(this.fallback)
        {
            this.fallback.rotation.x += this.time.delta * 0.0004
            this.fallback.rotation.y += this.time.delta * 0.0007
        }
    }

    updateMotion()
    {
        const elapsed = this.time.elapsed * 0.001
        const angle = elapsed * this.motion.turnSpeed
        const walkCycle = elapsed * this.motion.walkFrequency * Math.PI * 2

        this.model.position.x = this.motion.center.x + Math.cos(angle) * this.motion.radius
        this.model.position.z = this.motion.center.z + Math.sin(angle) * this.motion.radius
        this.model.position.y = this.baseY + Math.sin(walkCycle) * this.motion.bobAmplitude

        this.direction.set(-Math.sin(angle), 0, Math.cos(angle))
        const heading = Math.atan2(this.direction.x, this.direction.z)
        this.model.rotation.set(0, this.baseYaw + heading, 0)
    }

    updateArms()
    {
        const elapsed = this.time.elapsed * 0.001
        const walkCycle = elapsed * this.motion.walkFrequency * Math.PI * 2

        for(const armPart of this.armNodes)
        {
            const swing = Math.sin(walkCycle * armPart.frequencyMultiplier + armPart.phaseOffset) * armPart.amplitude * this.motion.swingIntensity
            this.tmpQuaternion.setFromAxisAngle(armPart.axis, swing * armPart.direction)
            armPart.node.quaternion.copy(armPart.baseQuaternion).multiply(this.tmpQuaternion)
        }
    }

    destroy()
    {
        if(this.model)
        {
            for(const armPart of this.armNodes)
            {
                armPart.node.quaternion.copy(armPart.baseQuaternion)
            }

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

        this.armNodes = []
    }
}
