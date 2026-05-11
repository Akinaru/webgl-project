import * as THREE from 'three'
import Experience from '../../../Experience.js'

const DEFAULT_OPEN_OFFSET_Y = 2
const DEFAULT_ANIMATION_SPEED = 5.5
const DOOR_TOKENS = ['door_exit', 'door_end']

export default class SceneDistributionDoorController
{
    constructor({
        distributionModel = null,
        debugParentFolder = null
    } = {})
    {
        this.experience = new Experience()
        this.distributionModel = distributionModel
        this.debug = this.experience.debug
        this.debugParentFolder = debugParentFolder
        this.settings = {
            openOffsetY: DEFAULT_OPEN_OFFSET_Y,
            animationSpeed: DEFAULT_ANIMATION_SPEED
        }
        this.isOpen = false
        this.doors = []

        this.setDoors()
        this.setDebug()
    }

    setDoors()
    {
        this.doors = DOOR_TOKENS
            .map((token) =>
            {
                const object = this.distributionModel?.getFirstObjectForNameTokens?.([token], { exact: true }) ?? null
                if(!(object instanceof THREE.Object3D))
                {
                    return null
                }

                return {
                    token,
                    object,
                    closedY: object.position.y,
                    currentY: object.position.y
                }
            })
            .filter(Boolean)
    }

    setOpen(isOpen)
    {
        this.isOpen = Boolean(isOpen)
    }

    getOpenY(door)
    {
        return door.closedY + this.settings.openOffsetY
    }

    update(deltaMs = this.experience.time.delta)
    {
        const deltaSeconds = Math.max(0.001, Math.min(0.05, (deltaMs || 16.67) * 0.001))

        for(const door of this.doors)
        {
            if(!door.object?.position)
            {
                continue
            }

            const targetY = this.isOpen
                ? this.getOpenY(door)
                : door.closedY
            door.currentY = THREE.MathUtils.damp(
                door.currentY,
                targetY,
                this.settings.animationSpeed,
                deltaSeconds
            )
            door.object.position.y = door.currentY
        }
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('Distribution doors', {
            parent: this.debugParentFolder || this.debug.ui,
            expanded: false
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'openOffsetY', {
            label: 'open offset Y',
            min: 0,
            max: 6,
            step: 0.001
        })
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugFolder = null
        this.doors = []
        this.distributionModel = null
    }
}
