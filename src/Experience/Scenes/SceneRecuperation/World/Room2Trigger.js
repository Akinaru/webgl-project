import * as THREE from 'three'
import Experience from '../../../Experience.js'
import * as SceneRecuperationRoom2TriggerConstants from './Room2Trigger.constants.js'
export default class SceneRecuperationRoom2Trigger
{
    constructor({
        recuperationModel = null,
        player = null,
        debugParentFolder = null,
        onEnter = null
    } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug
        this.recuperationModel = recuperationModel
        this.player = player
        this.debugParentFolder = debugParentFolder
        this.onEnter = typeof onEnter === 'function' ? onEnter : null

        this.bounds = new THREE.Box3()
        this.center = new THREE.Vector3()
        this.size = new THREE.Vector3()
        this.wasInside = false
        this.hasTriggered = false

        this.setDefaultState()
        this.setHelper()
        this.setDebug()
        this.updateBoundsFromState()
    }

    setDefaultState()
    {
        const room2Bounds = this.recuperationModel?.getBoundsForNameTokens?.(SceneRecuperationRoom2TriggerConstants.ROOM2_BOUNDS_NAME_TOKENS, { exact: false })
            ?? this.recuperationModel?.getBoundsForNameTokens?.(SceneRecuperationRoom2TriggerConstants.ROOM2_FALLBACK_BOUNDS_NAME_TOKENS, { exact: false })
            ?? null

        if(room2Bounds)
        {
            room2Bounds.getCenter(this.center)
            room2Bounds.getSize(this.size)
            this.size.y = Math.max(SceneRecuperationRoom2TriggerConstants.DEFAULT_MIN_SIZE_Y, this.size.y + SceneRecuperationRoom2TriggerConstants.DEFAULT_MARGIN_Y)
        }
        else
        {
            this.center.set(0, 1.8, -8)
            this.size.set(8, 3.2, 8)
        }

        this.state = {
            enabled: true,
            showZone: false,
            centerX: this.center.x,
            centerY: this.center.y,
            centerZ: this.center.z,
            sizeX: this.size.x,
            sizeY: this.size.y,
            sizeZ: this.size.z
        }
    }

    setHelper()
    {
        this.helper = new THREE.Box3Helper(this.bounds, new THREE.Color(SceneRecuperationRoom2TriggerConstants.ROOM2_TRIGGER_HELPER_COLOR))
        this.helper.visible = false
        this.helper.material.depthTest = false
        this.helper.renderOrder = 10
        this.scene.add(this.helper)
    }

    updateBoundsFromState()
    {
        this.center.set(
            this.state.centerX,
            this.state.centerY,
            this.state.centerZ
        )
        this.size.set(
            Math.max(0.1, this.state.sizeX),
            Math.max(0.1, this.state.sizeY),
            Math.max(0.1, this.state.sizeZ)
        )
        this.bounds.setFromCenterAndSize(this.center, this.size)
        this.helper.visible = Boolean(this.state.showZone)
    }

    update()
    {
        this.updateBoundsFromState()
        this.helper.box = this.bounds
        this.helper.material.color.set(this.hasTriggered ? SceneRecuperationRoom2TriggerConstants.ROOM2_TRIGGER_TRIGGERED_COLOR : SceneRecuperationRoom2TriggerConstants.ROOM2_TRIGGER_HELPER_COLOR)

        if(!this.state.enabled || !this.player?.position)
        {
            return
        }

        const isInside = this.bounds.containsPoint(this.player.position)
        if(isInside && !this.wasInside && !this.hasTriggered)
        {
            this.hasTriggered = true
            this.onEnter?.()
        }

        this.wasInside = isInside
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('Recuperation room2 trigger', {
            parent: this.debugParentFolder || this.debug.ui,
            expanded: false
        })

        this.debug.addBinding(this.debugFolder, this.state, 'enabled', { label: 'active' })
        this.debug.addBinding(this.debugFolder, this.state, 'showZone', { label: 'afficher zone' })

        this.debug.addBinding(this.debugFolder, this.state, 'centerX', {
            label: 'center x',
            min: -30,
            max: 30,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.state, 'centerY', {
            label: 'center y',
            min: -5,
            max: 10,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.state, 'centerZ', {
            label: 'center z',
            min: -30,
            max: 30,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.state, 'sizeX', {
            label: 'size x',
            min: 0.1,
            max: 30,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.state, 'sizeY', {
            label: 'size y',
            min: 0.1,
            max: 12,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.state, 'sizeZ', {
            label: 'size z',
            min: 0.1,
            max: 30,
            step: 0.01
        })

        this.debug.addButton(this.debugFolder, {
            title: 'Reset trigger',
            onClick: () =>
            {
                this.hasTriggered = false
                this.wasInside = false
            }
        })
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugFolder = null
        if(this.helper)
        {
            this.scene.remove(this.helper)
            this.helper.geometry?.dispose?.()
            this.helper.material?.dispose?.()
        }
        this.helper = null
        this.recuperationModel = null
        this.player = null
        this.onEnter = null
    }
}
