import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import * as DoorConstants from './Door.constants.js'
export default class Door
{
    constructor({ recuperationModel = null, debugParentFolder = null, onOpened = null } = {})
    {
        this.experience = new Experience()
        this.recuperationModel = recuperationModel
        this.debug = this.experience.debug
        this.debugParentFolder = debugParentFolder
        this.onOpened = typeof onOpened === 'function' ? onOpened : null

        this.object = this.recuperationModel?.getFirstObjectForNameTokens?.(DoorConstants.DOOR_NAME_TOKENS, { exact: true }) ?? null
        this.settings = {
            closedY: DoorConstants.DEFAULT_CLOSED_Y,
            openY: DoorConstants.DEFAULT_OPEN_Y,
            animationSpeed: DoorConstants.DEFAULT_ANIMATION_SPEED
        }
        this.isOpen = false
        this.hasReachedOpenTarget = false
        this.currentY = this.object?.position?.y ?? this.settings.closedY

        this.applyImmediateY(this.settings.closedY)
        this.setDebug()
    }

    setOpen(isOpen)
    {
        const nextIsOpen = Boolean(isOpen)
        if(this.isOpen === nextIsOpen)
        {
            return
        }

        this.isOpen = nextIsOpen

        if(this.isOpen)
        {
            this.hasReachedOpenTarget = false
        }
    }

    getTargetY()
    {
        return this.isOpen
            ? this.settings.openY
            : this.settings.closedY
    }

    applyImmediateY(value)
    {
        this.currentY = value

        if(this.object?.position)
        {
            this.object.position.y = value
        }
    }

    update(deltaMs = this.experience.time.delta)
    {
        if(!this.object?.position)
        {
            return
        }

        const deltaSeconds = Math.max(0.001, Math.min(0.05, (deltaMs || 16.67) * 0.001))
        const targetY = this.getTargetY()
        this.currentY = THREE.MathUtils.damp(
            this.currentY,
            targetY,
            this.settings.animationSpeed,
            deltaSeconds
        )
        this.object.position.y = this.currentY

        if(this.isOpen && !this.hasReachedOpenTarget)
        {
            const remainingDistance = Math.abs(targetY - this.currentY)
            if(remainingDistance <= 0.01)
            {
                this.hasReachedOpenTarget = true
                this.currentY = targetY
                this.object.position.y = targetY
                this.onOpened?.()
            }
        }
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled || !this.object)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('Porte', {
            parent: this.debugParentFolder || this.debug.ui,
            expanded: false
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'closedY', {
            label: 'Y ferme',
            min: -10,
            max: 10,
            step: 0.001
        }).on('change', ({ value }) =>
        {
            if(!this.isOpen)
            {
                this.applyImmediateY(value)
            }
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'openY', {
            label: 'Y ouvert',
            min: -10,
            max: 10,
            step: 0.001
        })
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugFolder = null
        this.object = null
        this.recuperationModel = null
    }
}
