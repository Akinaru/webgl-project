import * as THREE from 'three'
import * as SceneRecuperationCeilingLightsConstants from './CeilingLights.constants.js'

export default class SceneRecuperationCeilingLights
{
    constructor({ recuperationModel = null } = {})
    {
        this.recuperationModel = recuperationModel
        this.entries = []
        this.tmpBounds = new THREE.Box3()
        this.tmpCenter = new THREE.Vector3()
        this.room1Names = new Set(SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_ROOM_1_NAMES)
        this.zoneEnabledState = {
            [SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_ZONE.ROOM_1]: true,
            [SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_ZONE.ROOM_2]: false
        }
        this.zoneIntensityState = {
            [SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_ZONE.ROOM_1]: 1,
            [SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_ZONE.ROOM_2]: 0
        }
        this.settings = {
            emissiveColor: new THREE.Color(SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_EMISSIVE_COLOR),
            emissiveIntensity: SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_EMISSIVE_INTENSITY,
            pointColor: new THREE.Color(SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_POINT_COLOR),
            pointIntensity: SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_POINT_INTENSITY,
            pointDistance: SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_POINT_DISTANCE,
            pointHeightOffset: SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_POINT_HEIGHT_OFFSET,
            transitionSpeed: SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_ZONE_TRANSITION_SPEED
        }
        this.setUp()
    }

    setUp()
    {
        const groupNames = SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_GROUP_NAMES

        for(const groupName of groupNames)
        {
            const group = this.recuperationModel?.getFirstObjectForNameTokens?.([groupName], { exact: true }) ?? null
            if(!(group instanceof THREE.Object3D))
            {
                continue
            }

            group.traverse((child) =>
            {
                if(!(child instanceof THREE.Object3D))
                {
                    return
                }

                const normalizedName = String(child.name || '').toLowerCase().trim()
                if(!normalizedName.startsWith(SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_MESH_NAME_PREFIX))
                {
                    return
                }

                this.applyGlowToObject(child, this.resolveZoneForObject(normalizedName))
            })
        }

        this.applySettings()
    }

    resolveZoneForObject(normalizedName)
    {
        return this.room1Names.has(normalizedName)
            ? SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_ZONE.ROOM_1
            : SceneRecuperationCeilingLightsConstants.CEILING_LIGHT_ZONE.ROOM_2
    }

    applyGlowToObject(object, zone)
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
            const nextRuntimeMaterials = sourceMaterials.map((material) =>
            {
                const runtimeMaterial = material?.clone?.() ?? material
                if(!runtimeMaterial)
                {
                    return runtimeMaterial
                }

                runtimeMaterial.needsUpdate = true
                runtimeMaterials.push(runtimeMaterial)
                return runtimeMaterial
            })

            mesh.material = Array.isArray(mesh.material) ? nextRuntimeMaterials : nextRuntimeMaterials[0]
        }

        this.tmpBounds.setFromObject(object)
        const lightAnchor = new THREE.Object3D()
        if(!this.tmpBounds.isEmpty())
        {
            this.tmpBounds.getCenter(this.tmpCenter)
            object.worldToLocal(this.tmpCenter)
            lightAnchor.position.copy(this.tmpCenter)
        }
        else
        {
            lightAnchor.position.set(0, this.settings.pointHeightOffset, 0)
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
        this.entries.push({
            object,
            zone,
            light,
            lightAnchor,
            runtimeMaterials
        })
    }

    setZoneEnabled(zone, isEnabled)
    {
        if(!(zone in this.zoneEnabledState))
        {
            return
        }

        this.zoneEnabledState[zone] = Boolean(isEnabled)
        this.applySettings()
    }

    setZones({ room1 = this.zoneEnabledState.room1, room2 = this.zoneEnabledState.room2 } = {})
    {
        this.zoneEnabledState.room1 = Boolean(room1)
        this.zoneEnabledState.room2 = Boolean(room2)
        this.applySettings()
    }

    isZoneEnabled(zone)
    {
        return this.zoneEnabledState[zone] === true
    }

    update(deltaMs = 16.67)
    {
        const deltaSeconds = Math.max(0.001, Math.min(0.05, (deltaMs || 16.67) * 0.001))
        let hasChanged = false

        for(const [zone, isEnabled] of Object.entries(this.zoneEnabledState))
        {
            const targetValue = isEnabled ? 1 : 0
            const currentValue = this.zoneIntensityState[zone] ?? targetValue
            const nextValue = THREE.MathUtils.damp(
                currentValue,
                targetValue,
                this.settings.transitionSpeed,
                deltaSeconds
            )

            if(Math.abs(nextValue - currentValue) > 0.0001)
            {
                hasChanged = true
            }

            this.zoneIntensityState[zone] = Math.abs(targetValue - nextValue) <= 0.001
                ? targetValue
                : nextValue
        }

        if(hasChanged)
        {
            this.applySettings()
        }
    }

    applySettings()
    {
        for(const entry of this.entries)
        {
            const zoneIntensity = THREE.MathUtils.clamp(this.zoneIntensityState[entry.zone] ?? 0, 0, 1)
            for(const material of entry.runtimeMaterials)
            {
                if(!material)
                {
                    continue
                }

                if(material.emissive?.copy)
                {
                    material.emissive.copy(this.settings.emissiveColor)
                    material.emissiveIntensity = this.settings.emissiveIntensity * zoneIntensity
                }

                material.needsUpdate = true
            }
            if(!(entry.light instanceof THREE.PointLight))
            {
                continue
            }

            entry.light.color.copy(this.settings.pointColor)
            entry.light.intensity = this.settings.pointIntensity * zoneIntensity
            entry.light.distance = this.settings.pointDistance
            entry.lightAnchor.position.y = this.settings.pointHeightOffset
        }
    }

    destroy()
    {
        for(const entry of this.entries)
        {
            entry.object?.remove?.(entry.lightAnchor)

            for(const material of entry.runtimeMaterials)
            {
                material?.dispose?.()
            }
        }
        this.entries = []

        this.recuperationModel = null
    }
}
