import * as THREE from 'three'
import Experience from '../../../Experience.js'
import CenterScreenRaycaster from '../../../Utils/CenterScreenRaycaster.js'

export default class ValidationButton
{
    constructor({
        position = new THREE.Vector3(5, 0, 0),
        onValidate = null,
        debugParentFolder = null
    } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug
        this.inputs = this.experience.inputs
        this.onValidate = onValidate

        this.position = position
        this.group = new THREE.Group()
        this.group.position.copy(this.position)
        this.scene.add(this.group)

        this.centerRaycaster = new CenterScreenRaycaster({
            getCamera: () => this.experience.camera?.instance ?? null
        })

        this.setPedestal()
        this.setButton()
        this.setEvents()
        this.setDebug(debugParentFolder)
    }

    setPedestal()
    {
        this.pedestal = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.25, 1.2, 16),
            new THREE.MeshStandardMaterial({
                color: '#445566',
                metalness: 0.8,
                roughness: 0.2
            })
        )
        this.pedestal.position.y = 0.6
        this.pedestal.castShadow = true
        this.pedestal.receiveShadow = true
        this.group.add(this.pedestal)
    }

    setButton()
    {
        this.buttonRoot = new THREE.Group()
        this.buttonRoot.position.y = 1.2
        this.group.add(this.buttonRoot)

        this.buttonBase = new THREE.Mesh(
            new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16),
            new THREE.MeshStandardMaterial({ color: '#222222' })
        )
        this.buttonRoot.add(this.buttonBase)

        this.buttonMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.1, 0.15, 16),
            new THREE.MeshStandardMaterial({ 
                color: '#ff3333',
                emissive: '#aa0000',
                emissiveIntensity: 0.5
            })
        )
        this.buttonMesh.position.y = 0.08
        this.buttonMesh.name = 'validation_button_click'
        this.buttonRoot.add(this.buttonMesh)
    }

    setEvents()
    {
        this.onMouseDown = () =>
        {
            const hit = this.centerRaycaster.intersectFirstHit([this.buttonMesh], false)
            if(hit && hit.distance < 3)
            {
                this.pressButton()
            }
        }

        this.inputs?.on('sceneinteractdown.distributionValidation', this.onMouseDown)
    }

    pressButton()
    {
        this.experience.sound?.playMenuClick?.()
        
        // Animation de pression
        const originalY = 0.08
        this.buttonMesh.position.y = 0.02
        
        setTimeout(() => {
            if(this.buttonMesh) this.buttonMesh.position.y = originalY
            this.onValidate?.()
        }, 150)
    }

    setDebug(parent)
    {
        if(!this.debug?.isDebugEnabled) return

        const folder = this.debug.addFolder('Bouton Validation', {
            parent: parent || this.debug.ui,
            expanded: false
        })

        this.debug.addBinding(folder, this.group.position, 'x', { min: -20, max: 20, step: 0.1, label: 'Pos X' })
        this.debug.addBinding(folder, this.group.position, 'y', { min: -5, max: 10, step: 0.1, label: 'Pos Y' })
        this.debug.addBinding(folder, this.group.position, 'z', { min: -20, max: 30, step: 0.1, label: 'Pos Z' })
    }

    update()
    {
        // Optionnel: faire pulser le bouton quand c'est résolu
    }

    destroy()
    {
        this.inputs?.off('sceneinteractdown.distributionValidation')
        this.scene.remove(this.group)
        this.pedestal.geometry.dispose()
        this.pedestal.material.dispose()
        this.buttonBase.geometry.dispose()
        this.buttonBase.material.dispose()
        this.buttonMesh.geometry.dispose()
        this.buttonMesh.material.dispose()
        this.group = null
    }
}
