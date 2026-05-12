import * as THREE from 'three'
import Experience from '../../../Experience.js'
import SpatialBoxOctree from '../../../Utils/SpatialBoxOctree.js'
import * as InputBindingsConstants from '../../../Inputs/InputBindings.constants.js'
import * as PlayerConstants from '../Player.constants.js'

/**
 * Nettoie les listeners input et ressources debug du joueur.
 */
export function destroy()
{
    this.inputs?.off?.('click.player')
    this.inputs?.off?.('pointerlockchange.player')
    this.inputs?.off?.('mousemove.player')

    const isCanvasStillPointerLocked = this.inputs?.isPointerLocked?.(this.canvas) || false
    document.body.classList.toggle('is-pointer-locked', isCanvasStillPointerLocked)
    this.debugFolder?.dispose?.()
    this.collisionOctreePayloads = []
}

