import * as THREE from 'three'
import Experience from '../../../Experience.js'
import {
    DEFAULT_ANIMATION_SPEED,
    DEFAULT_CLOSED_Y,
    DEFAULT_OPEN_Y,
    DOOR_NAME_TOKENS
} from './Door.constants.js'

export default class Door
{
    constructor({ recuperationModel = null, debugParentFolder = null } = {})
    {
        this.experience = new Experience()
        this.recuperationModel = recuperationModel
        this.debug = this.experience.debug
        this.debugParentFolder = debugParentFolder

        this.object = this.recuperationModel?.getFirstObjectForNameTokens?.(DOOR_NAME_TOKENS, { exact: true }) ?? null
        this.settings = {
            closedY: DEFAULT_CLOSED_Y,
            openY: DEFAULT_OPEN_Y,
            animationSpeed: DEFAULT_ANIMATION_SPEED
        }
        this.isOpen = false
        this.currentY = this.object?.position?.y ?? this.settings.closedY

        this.applyImmediateY(this.settings.closedY)
        this.setDebug()
    }

    setOpen(isOpen)
    {
        this.isOpen = Boolean(isOpen)
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
