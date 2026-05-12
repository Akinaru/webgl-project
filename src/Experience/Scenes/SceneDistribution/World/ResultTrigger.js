import * as THREE from 'three'
import Experience from '../../../Experience.js'
import * as SceneDistributionResultConstants from './Result.constants.js'
import * as SceneDistributionResultTriggerConstants from './ResultTrigger.constants.js'

export default class SceneDistributionResultTrigger
{
    constructor({
        distributionModel = null,
        player = null,
        debugParentFolder = null,
        onEnter = null
    } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug
        this.distributionModel = distributionModel
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
        const roomEndBounds = this.distributionModel?.getBoundsForNameTokens?.(['room_end'], { exact: true }) ?? null
        if(roomEndBounds)
        {
            roomEndBounds.getCenter(this.center)
            roomEndBounds.getSize(this.size)
            this.size.y = Math.max(SceneDistributionResultTriggerConstants.DEFAULT_MIN_SIZE_Y, this.size.y + SceneDistributionResultTriggerConstants.DEFAULT_MARGIN_Y)
        }
        else
        {
            this.center.set(2.7, 1.8, 11.3)
            this.size.set(4, 3, 5)
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
        this.helper = new THREE.Box3Helper(this.bounds, new THREE.Color(SceneDistributionResultConstants.RESULT_ZONE_HELPER_COLOR))
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
        this.helper.material.color.set(this.hasTriggered ? SceneDistributionResultConstants.RESULT_ZONE_TRIGGERED_COLOR : SceneDistributionResultConstants.RESULT_ZONE_HELPER_COLOR)

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

        this.debugFolder = this.debug.addFolder('Distribution result trigger', {
            parent: this.debugParentFolder || this.debug.ui,
            expanded: false
        })

        this.debug.addBinding(this.debugFolder, this.state, 'enabled', { label: 'active' })
        this.debug.addBinding(this.debugFolder, this.state, 'showZone', { label: 'afficher zone' })

        this.debug.addBinding(this.debugFolder, this.state, 'centerX', {
            label: 'center x',
            min: -20,
            max: 20,
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
            min: -20,
            max: 30,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.state, 'sizeX', {
            label: 'size x',
            min: 0.1,
            max: 20,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.state, 'sizeY', {
            label: 'size y',
            min: 0.1,
            max: 10,
            step: 0.01
        })
        this.debug.addBinding(this.debugFolder, this.state, 'sizeZ', {
            label: 'size z',
            min: 0.1,
            max: 20,
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
        this.distributionModel = null
        this.player = null
        this.onEnter = null
    }
}
