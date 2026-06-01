import * as THREE from 'three'
import Experience from '../../../Experience.js'
import { MAP_OBJECT_DEFINITIONS } from './MapObjects.definitions.js'
import * as MapObjectsConstants from './MapObjects.constants.js'

export default class MapObjects
{
    constructor({
        mapModel,
        definitions = MAP_OBJECT_DEFINITIONS
    } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.debug = this.experience.debug
        this.mapModel = mapModel
        this.definitions = Array.isArray(definitions) ? definitions : []
        this.entries = []
        this.groundRaycaster = new THREE.Raycaster()
        this.groundRayOrigin = new THREE.Vector3()
        this.groundRayDirection = new THREE.Vector3(0, -1, 0)
        this.debugFolder = null
        this.objectDebugFolders = new Set()

        this.root = new THREE.Group()
        this.root.name = MapObjectsConstants.MAP_OBJECTS_ROOT_NAME
        this.scene.add(this.root)

        this.init()
        this.setDebug()
    }

    init()
    {
        for(const definition of this.definitions)
        {
            const entry = this.createEntry(definition)
            if(entry)
            {
                this.entries.push(entry)
            }
        }
    }

    createEntry(definition)
    {
        const sourceObject = this.resolveSourceObject(definition)
        if(!sourceObject)
        {
            console.warn(`[MapObjects] Objet introuvable pour "${definition?.key ?? 'unknown'}".`)
            return null
        }

        const container = new THREE.Group()
        container.name = `mapObject:${definition.key}`
        container.userData.mapObjectKey = definition.key

        const object = this.createPivotNormalizedObject(sourceObject)
        container.add(object)
        this.root.add(container)

        const state = this.createState(definition)
        const entry = {
            definition,
            container,
            object,
            state
        }

        this.applyEntryState(entry)
        return entry
    }

    resolveSourceObject(definition)
    {
        const resourceName = definition?.resourceName
        const resource = resourceName ? this.resources.items?.[resourceName] : null
        const sourceScene = resource?.scene
        if(!sourceScene)
        {
            return null
        }

        const selector = definition?.selector ?? {}
        if(selector.rootObjectName)
        {
            const rootMatch = sourceScene.getObjectByName(selector.rootObjectName)
            if(rootMatch)
            {
                return rootMatch
            }
        }

        if(selector.fallbackNodeName)
        {
            const fallback = sourceScene.getObjectByName(selector.fallbackNodeName)
            if(fallback)
            {
                return fallback
            }
        }

        return null
    }

    cloneSourceObject(sourceObject)
    {
        const clone = sourceObject.clone(true)

        clone.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            child.castShadow = true
            child.receiveShadow = true

            if(Array.isArray(child.material))
            {
                child.material = child.material.map((material) => material?.clone?.() ?? material)
                return
            }

            child.material = child.material?.clone?.() ?? child.material
        })

        return clone
    }

    createPivotNormalizedObject(sourceObject)
    {
        const object = this.cloneSourceObject(sourceObject)
        object.updateMatrixWorld(true)

        const bounds = new THREE.Box3().setFromObject(object)
        if(bounds.isEmpty())
        {
            return object
        }

        const center = bounds.getCenter(new THREE.Vector3())
        const min = bounds.min.clone()

        object.position.x -= center.x
        object.position.y -= min.y
        object.position.z -= center.z
        object.updateMatrixWorld(true)

        return object
    }

    createState(definition)
    {
        const position = definition?.transform?.position ?? {}
        const rotation = definition?.transform?.rotation ?? {}
        const scale = definition?.transform?.scale ?? {}
        const snappedY = this.getSnappedYPosition({
            x: position.x ?? 0,
            y: position.y ?? 0,
            z: position.z ?? 0,
            definition
        })

        return {
            visible: true,
            positionX: position.x ?? 0,
            positionY: snappedY,
            positionZ: position.z ?? 0,
            rotationX: rotation.x ?? 0,
            rotationY: rotation.y ?? 0,
            rotationZ: rotation.z ?? 0,
            scaleX: scale.x ?? 1,
            scaleY: scale.y ?? 1,
            scaleZ: scale.z ?? 1
        }
    }

    getSnappedYPosition({ x = 0, y = 0, z = 0, definition } = {})
    {
        const shouldSnap = definition?.placement?.snapToGround === true
        if(!shouldSnap)
        {
            return y
        }

        const groundY = this.getGroundY(x, z)
        if(!Number.isFinite(groundY))
        {
            return y
        }

        const groundOffsetY = definition?.placement?.groundOffsetY ?? 0
        return groundY + groundOffsetY
    }

    getGroundY(x = 0, z = 0)
    {
        const groundMeshes = this.mapModel?.getGroundMeshes?.() ?? []
        if(groundMeshes.length === 0)
        {
            return null
        }

        this.groundRayOrigin.set(x, MapObjectsConstants.MAP_OBJECTS_GROUND_RAY_HEIGHT, z)
        this.groundRaycaster.set(this.groundRayOrigin, this.groundRayDirection)
        this.groundRaycaster.far = MapObjectsConstants.MAP_OBJECTS_GROUND_RAY_MAX_DISTANCE

        const intersections = this.groundRaycaster.intersectObjects(groundMeshes, false)
        return intersections[0]?.point?.y ?? null
    }

    applyEntryState(entry)
    {
        const { container, state } = entry
        container.visible = state.visible === true
        container.position.set(state.positionX, state.positionY, state.positionZ)
        container.rotation.set(state.rotationX, state.rotationY, state.rotationZ)
        container.scale.set(state.scaleX, state.scaleY, state.scaleZ)
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder?.dispose?.()
        this.debugFolder = this.debug.addFolder(MapObjectsConstants.MAP_OBJECTS_DEBUG_FOLDER_TITLE, {
            expanded: false
        })

        for(const entry of this.entries)
        {
            const folder = this.debug.addFolder(entry.definition.label, {
                parent: this.debugFolder,
                expanded: false
            })
            this.objectDebugFolders.add(folder)
            this.bindEntryDebug(folder, entry)
        }
    }

    bindEntryDebug(folder, entry)
    {
        const bind = (key, options = {}) =>
        {
            this.debug.addBinding(folder, entry.state, key, options).on('change', () =>
            {
                this.applyEntryState(entry)
            })
        }

        bind('visible', { label: 'Visible' })
        bind('positionX', { label: 'Position X', min: -100, max: 100, step: 0.01 })
        bind('positionY', { label: 'Position Y', min: -20, max: 40, step: 0.01 })
        bind('positionZ', { label: 'Position Z', min: -100, max: 100, step: 0.01 })
        bind('rotationX', { label: 'Rotation X', min: -Math.PI, max: Math.PI, step: 0.001 })
        bind('rotationY', { label: 'Rotation Y', min: -Math.PI, max: Math.PI, step: 0.001 })
        bind('rotationZ', { label: 'Rotation Z', min: -Math.PI, max: Math.PI, step: 0.001 })
        bind('scaleX', { label: 'Scale X', min: 0.01, max: 10, step: 0.01 })
        bind('scaleY', { label: 'Scale Y', min: 0.01, max: 10, step: 0.01 })
        bind('scaleZ', { label: 'Scale Z', min: 0.01, max: 10, step: 0.01 })

        this.debug.addButton(folder, {
            title: 'Copier les valeurs',
            onClick: async () =>
            {
                await this.copyEntryStateToClipboard(entry)
            }
        })
    }

    buildEntryExportText(entry)
    {
        const { definition, state } = entry
        return [
            `${definition.label}`,
            `Position X`,
            this.formatExportNumber(state.positionX),
            `Position Y`,
            this.formatExportNumber(state.positionY),
            `Position Z`,
            this.formatExportNumber(state.positionZ),
            `Rotation X`,
            this.formatExportNumber(state.rotationX),
            `Rotation Y`,
            this.formatExportNumber(state.rotationY),
            `Rotation Z`,
            this.formatExportNumber(state.rotationZ),
            `Scale X`,
            this.formatExportNumber(state.scaleX),
            `Scale Y`,
            this.formatExportNumber(state.scaleY),
            `Scale Z`,
            this.formatExportNumber(state.scaleZ)
        ].join('\n')
    }

    formatExportNumber(value)
    {
        return Number.isFinite(value) ? value.toFixed(3) : '0.000'
    }

    async copyEntryStateToClipboard(entry)
    {
        const text = this.buildEntryExportText(entry)

        try
        {
            await navigator.clipboard.writeText(text)
            console.info(`[MapObjects] Valeurs copiees pour ${entry.definition.label}`)
        }
        catch(error)
        {
            console.warn(`[MapObjects] Impossible de copier les valeurs pour ${entry.definition.label}:`, error)
        }
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugFolder = null
        this.objectDebugFolders.clear()
        this.entries.length = 0

        if(this.root)
        {
            this.scene.remove(this.root)
            this.root = null
        }
    }
}
