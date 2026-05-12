import * as THREE from 'three'
import * as SceneRecuperationTubeWaterControllerConstants from '../TubeWaterController.constants.js'

/**
 * Normalise un nom (minuscule, sans accents) pour les comparaisons.
 */
export function normalizeObjectName(value)
{
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}


/**
 * Retourne un delta time sécurisé en secondes pour les calculs runtime.
 */
export function getDeltaSeconds()
{
    return Math.min(this.experience.time?.delta ?? 0, 50) * 0.001
}


/**
 * Calcule l axe de rotation monde d un module.
 */
export function getRotationAxisWorld(target, out)
{
    this.localAxis.set(0, 0, 0)
    this.localAxis[SceneRecuperationTubeWaterControllerConstants.ROTATION_AXIS] = 1
    target.getWorldQuaternion(this.targetQuaternionWorld)
    return out.copy(this.localAxis).applyQuaternion(this.targetQuaternionWorld).normalize()
}


/**
 * Calcule l axe monde utilisé pour le sens de flux.
 */
export function getFlowAxisWorld(target, out)
{
    this.localAxis.set(0, 0, 0)
    this.localAxis[SceneRecuperationTubeWaterControllerConstants.FLOW_AXIS] = 1
    target.getWorldQuaternion(this.targetQuaternionWorld)
    return out.copy(this.localAxis).applyQuaternion(this.targetQuaternionWorld).normalize()
}


/**
 * Retourne le centre monde d un objet (bounds ou position).
 */
export function getWorldCenter(target, out)
{
    target.updateMatrixWorld(true)
    this.bounds.setFromObject(target)
    if(this.bounds.isEmpty())
    {
        return out.setFromMatrixPosition(target.matrixWorld)
    }

    return this.bounds.getCenter(out)
}


/**
 * Fait tourner un objet autour d un pivot/axe exprimés en monde.
 */
export function rotateObjectAroundWorldAxis(object, pivotWorld, axisWorld, angle)
{
    if(!object)
    {
        return
    }

    object.updateMatrixWorld(true)
    this.deltaQuaternion.setFromAxisAngle(axisWorld, angle)

    this.worldPosition.setFromMatrixPosition(object.matrixWorld)
    this.worldPosition.sub(pivotWorld).applyQuaternion(this.deltaQuaternion).add(pivotWorld)

    if(object.parent)
    {
        object.parent.updateMatrixWorld(true)
        this.localPosition.copy(this.worldPosition)
        object.parent.worldToLocal(this.localPosition)
        object.position.copy(this.localPosition)
    }
    else
    {
        object.position.copy(this.worldPosition)
    }

    object.getWorldQuaternion(this.objectQuaternionWorld)
    this.objectQuaternionWorld.premultiply(this.deltaQuaternion)

    if(object.parent)
    {
        object.parent.getWorldQuaternion(this.parentQuaternionWorld)
        this.parentQuaternionInverse.copy(this.parentQuaternionWorld).invert()
        this.objectQuaternionLocal.copy(this.parentQuaternionInverse).multiply(this.objectQuaternionWorld)
        object.quaternion.copy(this.objectQuaternionLocal)
    }
    else
    {
        object.quaternion.copy(this.objectQuaternionWorld)
    }

    object.updateMatrixWorld(true)
}


/**
 * Normalise un angle dans [0, 2PI).
 */
export function normalizeAngle(value)
{
    return THREE.MathUtils.euclideanModulo(value, Math.PI * 2)
}


/**
 * Met à jour le nombre de quarts de tour appliqués à un module.
 */
export function trackQuarterTurnOffset(tubeTarget, angle)
{
    if(!tubeTarget)
    {
        return
    }

    const deltaTurns = Math.round(angle / SceneRecuperationTubeWaterControllerConstants.QUARTER_TURN)
    if(deltaTurns === 0)
    {
        return
    }

    const currentOffset = this.quarterTurnsFromInitialByTubeUuid.get(tubeTarget.uuid) ?? 0
    this.quarterTurnsFromInitialByTubeUuid.set(
        tubeTarget.uuid,
        this.normalizeQuarterTurnOffset(currentOffset + deltaTurns)
    )
}


/**
 * Normalise un offset de quarts de tour dans [0,3].
 */
export function normalizeQuarterTurnOffset(value)
{
    return ((value % 4) + 4) % 4
}


