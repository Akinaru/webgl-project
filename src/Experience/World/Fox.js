import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Fox
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time
        this.debug = this.experience.debug

        if(this.debug.active)
        {
            this.debugFolder = this.debug.ui.addFolder('fox')
        }

        this.resource = this.resources.items.foxModel

        if(this.resource)
        {
            this.setModel()
            this.setAnimation()
        }
        else
        {
            this.setFallback()
        }
    }

    setModel()
    {
        this.model = this.resource.scene
        this.model.scale.set(0.02, 0.02, 0.02)
        this.model.position.y = -0.6

        this.model.traverse((child) =>
        {
            if(child instanceof THREE.Mesh)
            {
                child.castShadow = true
            }
        })

        this.scene.add(this.model)
    }

    setAnimation()
    {
        this.animation = {}
        this.animation.mixer = new THREE.AnimationMixer(this.model)
        this.animation.actions = {}
        this.animation.actions.idle = this.animation.mixer.clipAction(this.resource.animations[0])
        this.animation.actions.walking = this.animation.mixer.clipAction(this.resource.animations[1])
        this.animation.actions.running = this.animation.mixer.clipAction(this.resource.animations[2])
        this.animation.actions.current = this.animation.actions.idle
        this.animation.actions.current.play()

        this.animation.play = (name) =>
        {
            const newAction = this.animation.actions[name]
            const oldAction = this.animation.actions.current

            newAction.reset()
            newAction.play()
            newAction.crossFadeFrom(oldAction, 1)

            this.animation.actions.current = newAction
        }

        if(this.debug.active)
        {
            const debugObject = {
                playIdle: () => this.animation.play('idle'),
                playWalking: () => this.animation.play('walking'),
                playRunning: () => this.animation.play('running')
            }

            this.debugFolder.add(debugObject, 'playIdle')
            this.debugFolder.add(debugObject, 'playWalking')
            this.debugFolder.add(debugObject, 'playRunning')
        }
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
        if(this.animation?.mixer)
        {
            this.animation.mixer.update(this.time.delta * 0.001)
            return
        }

        if(this.fallback)
        {
            this.fallback.rotation.x += this.time.delta * 0.0004
            this.fallback.rotation.y += this.time.delta * 0.0007
        }
    }
}
