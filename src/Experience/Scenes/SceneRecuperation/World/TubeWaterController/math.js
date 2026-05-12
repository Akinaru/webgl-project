import * as THREE from 'three'
import * as SceneRecuperationTubeWaterControllerConstants from '../TubeWaterController.constants.js'

export function normalizeObjectName(value)
{
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}


export function getDeltaSeconds()
{
    return Math.min(this.experience.time?.delta ?? 0, 50) * 0.001
}


export function getRotationAxisWorld(target, out)
{
    this.localAxis.set(0, 0, 0)
    this.localAxis[SceneRecuperationTubeWaterControllerConstants.ROTATION_AXIS] = 1
    target.getWorldQuaternion(this.targetQuaternionWorld)
    return out.copy(this.localAxis).applyQuaternion(this.targetQuaternionWorld).normalize()
}


export function getFlowAxisWorld(target, out)
{
    this.localAxis.set(0, 0, 0)
    this.localAxis[SceneRecuperationTubeWaterControllerConstants.FLOW_AXIS] = 1
    target.getWorldQuaternion(this.targetQuaternionWorld)
    return out.copy(this.localAxis).applyQuaternion(this.targetQuaternionWorld).normalize()
}


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


export function normalizeAngle(value)
{
    return THREE.MathUtils.euclideanModulo(value, Math.PI * 2)
}


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


export function normalizeQuarterTurnOffset(value)
{
    return ((value % 4) + 4) % 4
}


