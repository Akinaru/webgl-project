import * as THREE from 'three'
import Experience from '../../../Experience.js'
import CenterScreenRaycaster from '../../../Utils/CenterScreenRaycaster.js'

const VALIDATION_BUTTON_LIGHT_COLOR = '#ff5a5a'
const VALIDATION_BUTTON_LIGHT_INTENSITY = 0.85
const VALIDATION_BUTTON_LIGHT_DISTANCE = 2.1
const VALIDATION_BUTTON_LIGHT_HEIGHT_OFFSET = 0.12
const VALIDATION_BUTTON_DISABLED_COLOR = '#6f7c85'
const VALIDATION_BUTTON_DISABLED_EMISSIVE = '#2d343a'
const VALIDATION_BUTTON_DISABLED_LIGHT_INTENSITY = 0.18

export default class ValidationButton
{
    constructor({
        buttonMeshes = [],
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
        this.isEnabled = true
        this.buttonMeshes = Array.isArray(buttonMeshes)
            ? buttonMeshes.filter((mesh) => mesh instanceof THREE.Mesh)
            : []
        this.activeButtonMesh = this.buttonMeshes[0] ?? null
        this.activeButtonBaseY = this.activeButtonMesh?.position?.y ?? 0
        this.buttonMaterialDefaults = new WeakMap()
        this.buttonLightDefaults = null

        this.position = position
        this.group = null

        this.centerRaycaster = new CenterScreenRaycaster({
            getCamera: () => this.experience.camera?.instance ?? null
        })

        if(!this.activeButtonMesh)
        {
            this.setPedestal()
            this.setButton()
        }
        this.setEvents()
        this.setDebug(debugParentFolder)
        this.captureDefaultVisualState()
        this.refreshVisualState()
    }

    setPedestal()
    {
        this.group = new THREE.Group()
        this.group.position.copy(this.position)
        this.scene.add(this.group)

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

        this.buttonLight = new THREE.PointLight(
            VALIDATION_BUTTON_LIGHT_COLOR,
            VALIDATION_BUTTON_LIGHT_INTENSITY,
            VALIDATION_BUTTON_LIGHT_DISTANCE
        )
        this.buttonLight.position.set(0, VALIDATION_BUTTON_LIGHT_HEIGHT_OFFSET, 0)
        this.buttonLight.castShadow = false
        this.buttonRoot.add(this.buttonLight)
    }

    setEvents()
    {
        this.onMouseDown = () =>
        {
            if(this.isEnabled !== true)
            {
                return
            }

            const meshes = this.buttonMeshes.length > 0
                ? this.buttonMeshes
                : [this.buttonMesh].filter(Boolean)
            const hit = this.centerRaycaster.intersectFirstHit(meshes, false)
            if(hit && hit.distance < 3)
            {
                this.activeButtonMesh = hit.object instanceof THREE.Mesh
                    ? hit.object
                    : this.activeButtonMesh
                if(this.activeButtonMesh)
                {
                    this.activeButtonBaseY = this.activeButtonMesh.position.y
                }
                this.pressButton()
            }
        }

        this.inputs?.on('sceneinteractdown.distributionValidation', this.onMouseDown)
    }

    setEnabled(isEnabled = true)
    {
        this.isEnabled = Boolean(isEnabled)
        this.refreshVisualState()
    }

    pressButton()
    {
        this.experience.sound?.playMenuClick?.()

        const buttonMesh = this.activeButtonMesh ?? this.buttonMesh
        const originalY = buttonMesh?.position?.y ?? this.activeButtonBaseY
        if(buttonMesh)
        {
            buttonMesh.position.y = originalY - 0.04
        }

        setTimeout(() => {
            if(buttonMesh)
            {
                buttonMesh.position.y = originalY
            }
            this.onValidate?.()
        }, 150)
    }

    refreshVisualState()
    {
        const buttonMeshes = [
            ...this.buttonMeshes,
            this.buttonMesh
        ].filter((mesh) => mesh instanceof THREE.Mesh)

        for(const mesh of buttonMeshes)
        {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            for(const material of materials)
            {
                if(!material)
                {
                    continue
                }

                if(material.color)
                {
                    const defaults = this.buttonMaterialDefaults.get(material) ?? null
                    const defaultColor = defaults?.color ?? '#ff3333'
                    material.color.set(this.isEnabled ? defaultColor : VALIDATION_BUTTON_DISABLED_COLOR)
                }

                if(material.emissive)
                {
                    const defaults = this.buttonMaterialDefaults.get(material) ?? null
                    const defaultEmissive = defaults?.emissive ?? '#aa0000'
                    const defaultEmissiveIntensity = defaults?.emissiveIntensity ?? 0.5
                    material.emissive.set(this.isEnabled ? defaultEmissive : VALIDATION_BUTTON_DISABLED_EMISSIVE)
                    material.emissiveIntensity = this.isEnabled ? defaultEmissiveIntensity : 0.12
                }

                material.needsUpdate = true
            }
        }

        if(this.buttonLight)
        {
            const defaultLightColor = this.buttonLightDefaults?.color ?? VALIDATION_BUTTON_LIGHT_COLOR
            const defaultLightIntensity = this.buttonLightDefaults?.intensity ?? VALIDATION_BUTTON_LIGHT_INTENSITY
            this.buttonLight.color.set(this.isEnabled ? defaultLightColor : VALIDATION_BUTTON_DISABLED_COLOR)
            this.buttonLight.intensity = this.isEnabled
                ? defaultLightIntensity
                : VALIDATION_BUTTON_DISABLED_LIGHT_INTENSITY
        }
    }

    captureDefaultVisualState()
    {
        const buttonMeshes = [
            ...this.buttonMeshes,
            this.buttonMesh
        ].filter((mesh) => mesh instanceof THREE.Mesh)

        for(const mesh of buttonMeshes)
        {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            for(const material of materials)
            {
                if(!material || this.buttonMaterialDefaults.has(material))
                {
                    continue
                }

                this.buttonMaterialDefaults.set(material, {
                    color: material.color?.getHexString?.() ? `#${material.color.getHexString()}` : '#ff3333',
                    emissive: material.emissive?.getHexString?.() ? `#${material.emissive.getHexString()}` : '#aa0000',
                    emissiveIntensity: typeof material.emissiveIntensity === 'number' ? material.emissiveIntensity : 0.5
                })
            }
        }

        if(this.buttonLight && !this.buttonLightDefaults)
        {
            this.buttonLightDefaults = {
                color: `#${this.buttonLight.color.getHexString()}`,
                intensity: this.buttonLight.intensity
            }
        }
    }

    setDebug(parent)
    {
        if(!this.debug?.isDebugEnabled) return

        const folder = this.debug.addFolder('Bouton Validation', {
            parent: parent || this.debug.ui,
            expanded: false
        })

        if(!this.group)
        {
            return
        }

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
        if(this.group)
        {
            this.scene.remove(this.group)
        }
        this.pedestal?.geometry?.dispose?.()
        this.pedestal?.material?.dispose?.()
        this.buttonBase?.geometry?.dispose?.()
        this.buttonBase?.material?.dispose?.()
        this.buttonMesh?.geometry?.dispose?.()
        this.buttonMesh?.material?.dispose?.()
        this.buttonRoot?.remove?.(this.buttonLight)
        this.buttonLight = null
        this.group = null
    }
}
