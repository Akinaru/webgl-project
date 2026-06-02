import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import * as CeilingLightsConstants from './CeilingLights.constants.js'

export default class SceneRecyclageCeilingLights
{
    constructor({ recyclageModel = null, debugParentFolder = null } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.recyclageModel = recyclageModel
        this.entries = []
        this.tmpBounds = new THREE.Box3()
        this.tmpCenter = new THREE.Vector3()

        this.settings = {
            emissiveColor: new THREE.Color(CeilingLightsConstants.CEILING_LIGHT_EMISSIVE_COLOR),
            emissiveIntensity: CeilingLightsConstants.CEILING_LIGHT_EMISSIVE_INTENSITY,
            pointColor: new THREE.Color(CeilingLightsConstants.CEILING_LIGHT_POINT_COLOR),
            pointIntensity: CeilingLightsConstants.CEILING_LIGHT_POINT_INTENSITY,
            pointDistance: CeilingLightsConstants.CEILING_LIGHT_POINT_DISTANCE,
            pointHeightOffset: CeilingLightsConstants.CEILING_LIGHT_POINT_HEIGHT_OFFSET
        }

        this.setUp()

        if(this.debug?.isDebugEnabled && debugParentFolder)
        {
            this.setDebug(debugParentFolder)
        }
    }

    setUp()
    {
        const model = this.recyclageModel?.model
        if(!model)
        {
            return
        }

        model.traverse((child) =>
        {
            if(!(child instanceof THREE.Object3D))
            {
                return
            }

            const normalizedName = String(child.name || '').trim().toLowerCase()
            if(normalizedName !== CeilingLightsConstants.CEILING_LIGHT_NAME_TOKEN)
            {
                return
            }

            this.applyGlowToObject(child)
        })

        this.applySettings()
    }

    applyGlowToObject(object)
    {
        const meshes = []
        object.traverse((child) =>
        {
            if(child instanceof THREE.Mesh)
            {
                meshes.push(child)
            }
        })

        if(meshes.length === 0)
        {
            return
        }

        const runtimeMaterials = []
        for(const mesh of meshes)
        {
            const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const cloned = sourceMaterials.map((material) =>
            {
                const runtimeMaterial = material?.clone?.() ?? material
                if(runtimeMaterial)
                {
                    runtimeMaterial.needsUpdate = true
                }
                return runtimeMaterial
            })

            mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]
            runtimeMaterials.push(...cloned)
        }

        this.tmpBounds.setFromObject(object)
        const lightAnchor = new THREE.Object3D()
        if(!this.tmpBounds.isEmpty())
        {
            this.tmpBounds.getCenter(this.tmpCenter)
            object.worldToLocal(this.tmpCenter)
            lightAnchor.position.copy(this.tmpCenter)
        }

        lightAnchor.position.y += this.settings.pointHeightOffset

        const light = new THREE.PointLight(
            this.settings.pointColor,
            this.settings.pointIntensity,
            this.settings.pointDistance
        )
        light.castShadow = false
        lightAnchor.add(light)
        object.add(lightAnchor)

        this.entries.push({ object, light, lightAnchor, runtimeMaterials })
    }

    applySettings()
    {
        for(const entry of this.entries)
        {
            for(const material of entry.runtimeMaterials)
            {
                if(!material)
                {
                    continue
                }

                if(material.emissive?.copy)
                {
                    material.emissive.copy(this.settings.emissiveColor)
                    material.emissiveIntensity = this.settings.emissiveIntensity
                }

                material.needsUpdate = true
            }

            if(!(entry.light instanceof THREE.PointLight))
            {
                continue
            }

            entry.light.color.copy(this.settings.pointColor)
            entry.light.intensity = this.settings.pointIntensity
            entry.light.distance = this.settings.pointDistance
            entry.lightAnchor.position.y = this.settings.pointHeightOffset
        }
    }

    setDebug(parentFolder)
    {
        const debug = this.debug
        const applySettings = () => this.applySettings()

        this.debugFolder = debug.addFolder('Lumieres plafond', {
            parent: parentFolder,
            expanded: false
        })

        debug.addThreeColorBinding(this.debugFolder, this.settings, 'emissiveColor', {
            label: 'Couleur emissive'
        })?.on?.('change', applySettings)

        debug.addBinding(this.debugFolder, this.settings, 'emissiveIntensity', {
            label: 'Intensite emissive',
            min: 0,
            max: 10,
            step: 0.01
        })?.on?.('change', applySettings)

        debug.addThreeColorBinding(this.debugFolder, this.settings, 'pointColor', {
            label: 'Couleur point light'
        })?.on?.('change', applySettings)

        debug.addBinding(this.debugFolder, this.settings, 'pointIntensity', {
            label: 'Intensite point light',
            min: 0,
            max: 20,
            step: 0.01
        })?.on?.('change', applySettings)

        debug.addBinding(this.debugFolder, this.settings, 'pointDistance', {
            label: 'Distance point light',
            min: 0,
            max: 20,
            step: 0.01
        })?.on?.('change', applySettings)

        debug.addBinding(this.debugFolder, this.settings, 'pointHeightOffset', {
            label: 'Offset hauteur',
            min: -2,
            max: 2,
            step: 0.01
        })?.on?.('change', applySettings)
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugFolder = null

        for(const entry of this.entries)
        {
            entry.object?.remove?.(entry.lightAnchor)

            for(const material of entry.runtimeMaterials)
            {
                material?.dispose?.()
            }
        }

        this.entries = []
        this.recyclageModel = null
    }
}
