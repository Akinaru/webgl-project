import * as THREE from 'three'
import * as SceneRecuperationTubeWaterControllerConstants from '../TubeWaterController.constants.js'

export function setEvents()
{
    this.onMouseDown = (event) =>
    {
        const tubeMesh = this.hoveredTubeMesh || this.getTubeMeshAtCenter()
        if(!tubeMesh)
        {
            return
        }

        this.rotateTubeByQuarterTurn(tubeMesh)
    }

    this.inputs?.on?.('sceneinteractdown.recuperationTubeWater', this.onMouseDown)
}


export function getTubeMeshAtCenter()
{
    return this.centerRaycaster.intersectFirst(this.tubeMeshes, false)
}


export function update()
{
    this.hoveredTubeMesh = this.getTubeMeshAtCenter()
    this.updateTubeRotations(this.getDeltaSeconds())
    if(this.flowAnimationStarted)
    {
        this.updateFlowState(this.getDeltaSeconds())
    }
}


export function isHoveringTube()
{
    return Boolean(this.hoveredTubeMesh)
}


export function rotateTubeByQuarterTurn(mesh)
{
    const rotationTarget = this.recuperationModel?.getTubeWaterRotationTargetFromObject?.(mesh) ?? mesh
    if(!rotationTarget)
    {
        return
    }

    const sourceTarget = this.getSourceTubeTarget()
    if(sourceTarget && sourceTarget.uuid === rotationTarget.uuid)
    {
        return
    }

    this.playerRotatedTubeUuids.add(rotationTarget.uuid)
    const direction = this.turnDirectionByMeshUuid.get(rotationTarget.uuid) ?? 1
    this.queueTubeRotation(rotationTarget, SceneRecuperationTubeWaterControllerConstants.QUARTER_TURN * direction)
}


export function getUniqueRotatedTubeCount()
{
    return this.playerRotatedTubeUuids.size
}


export function rotateTubeAssembly(tubeTarget, angle)
{
    if(!tubeTarget)
    {
        return
    }

    this.trackQuarterTurnOffset(tubeTarget, angle)

    this.getWorldCenter(tubeTarget, this.rotationPivotWorld)
    this.getRotationAxisWorld(tubeTarget, this.rotationAxisWorld)
    this.rotateTubeAssemblyAroundAxis(tubeTarget, this.rotationPivotWorld, this.rotationAxisWorld, angle)
}


export function rotateTubeAssemblyAroundAxis(tubeTarget, pivotWorld, axisWorld, angle)
{
    this.rotateObjectAroundWorldAxis(tubeTarget, pivotWorld, axisWorld, angle)

    const joinTargets = this.joinTargetsByTubeUuid.get(tubeTarget.uuid) ?? []
    for(const joinTarget of joinTargets)
    {
        this.rotateObjectAroundWorldAxis(joinTarget, pivotWorld, axisWorld, angle)
    }
}


export function queueTubeRotation(tubeTarget, angle)
{
    if(!tubeTarget || !Number.isFinite(angle) || Math.abs(angle) <= 1e-6)
    {
        return
    }

    const existing = this.activeTubeRotationsByUuid.get(tubeTarget.uuid)
    if(existing)
    {
        existing.remainingAngle += angle
        existing.pendingQuarterTurns += Math.round(angle / SceneRecuperationTubeWaterControllerConstants.QUARTER_TURN)
        return
    }

    this.getWorldCenter(tubeTarget, this.rotationPivotScratch)
    this.getRotationAxisWorld(tubeTarget, this.rotationAxisScratch)

    this.activeTubeRotationsByUuid.set(tubeTarget.uuid, {
        tubeTarget,
        pivotWorld: this.rotationPivotScratch.clone(),
        axisWorld: this.rotationAxisScratch.clone(),
        remainingAngle: angle,
        pendingQuarterTurns: Math.round(angle / SceneRecuperationTubeWaterControllerConstants.QUARTER_TURN)
    })
}


export function updateTubeRotations(deltaSeconds)
{
    if(this.activeTubeRotationsByUuid.size === 0)
    {
        return
    }

    const speed = Math.max(0.1, this.rotation.speed || SceneRecuperationTubeWaterControllerConstants.ROTATION_SPEED_PER_SECOND)
    const maxStep = Math.max(0, deltaSeconds) * speed
    let hasAppliedStep = false

    for(const [tubeUuid, rotationState] of this.activeTubeRotationsByUuid.entries())
    {
        if(!rotationState?.tubeTarget)
        {
            this.activeTubeRotationsByUuid.delete(tubeUuid)
            continue
        }

        const remaining = rotationState.remainingAngle
        if(Math.abs(remaining) <= 1e-6 || maxStep <= 1e-6)
        {
            continue
        }

        const step = Math.sign(remaining) * Math.min(Math.abs(remaining), maxStep)
        this.rotateTubeAssemblyAroundAxis(
            rotationState.tubeTarget,
            rotationState.pivotWorld,
            rotationState.axisWorld,
            step
        )
        rotationState.remainingAngle -= step
        hasAppliedStep = true

        if(Math.abs(rotationState.remainingAngle) > 1e-4)
        {
            continue
        }

        if(rotationState.pendingQuarterTurns !== 0)
        {
            this.trackQuarterTurnOffset(
                rotationState.tubeTarget,
                rotationState.pendingQuarterTurns * SceneRecuperationTubeWaterControllerConstants.QUARTER_TURN
            )
        }

        this.activeTubeRotationsByUuid.delete(tubeUuid)
    }

    if(!hasAppliedStep)
    {
        return
    }

    this.recuperationModel?.refreshCollisionBoxes?.()
}


