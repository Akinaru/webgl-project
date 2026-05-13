import * as THREE from 'three'
import Experience from '../../../Experience.js'
import BloomRailSystem from '../../Rails/BloomRailSystem.js'
import * as BloomConstants from '../Bloom.constants.js'

/**
 * Nettoie Bloom, ses events, helpers et ressources runtime.
 */
export function destroy()
{
    this.debugFolder?.dispose?.()
    this.animation.action?.stop?.()
    this.animation.mixer?.stopAllAction?.()
    this.animation.mixer = null
    this.animation.action = null
    this.animation.clips = []

    if(this.model)
    {
        for(const armPart of this.armNodes)
        {
            armPart.node.quaternion.copy(armPart.baseQuaternion)
        }

        this.scene.remove(this.model)
        this.model = null
    }

    if(this.fallback)
    {
        this.scene.remove(this.fallback)
        this.fallback.geometry.dispose()
        this.fallback.material.dispose()
        this.fallback = null
    }

    this.rails?.destroy?.()
    this.armNodes = []
    this.armAnimationPairs = []
}

