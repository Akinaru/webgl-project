import * as THREE from 'three'
import Experience from '../../../Experience.js'

const QUARTER_TURN = Math.PI * 0.5
const ROTATION_AXIS = 'z'
const TUBE_JOIN_NAME_TOKEN = 'tube-join'

export default class Scene1TubeWaterController
{
    constructor({ scene1Model } = {})
    {
        this.experience = new Experience()
        this.inputs = this.experience.inputs
        this.camera = this.experience.camera?.instance
        this.scene1Model = scene1Model
        this.tubeMeshes = this.scene1Model?.getTubeWaterMeshes?.() ?? []
        this.rotationTargets = this.scene1Model?.getTubeWaterRotationTargets?.() ?? []

        this.raycaster = new THREE.Raycaster()
        this.centerNdc = new THREE.Vector2(0, 0)
        this.turnDirectionByMeshUuid = new Map()
        this.joinTargetsByTubeUuid = new Map()
        this.hoveredTubeMesh = null
        this.bounds = new THREE.Box3()
        this.rotationPivotWorld = new THREE.Vector3()
        this.rotationAxisWorld = new THREE.Vector3()
        this.localAxis = new THREE.Vector3()
        this.worldPosition = new THREE.Vector3()
        this.localPosition = new THREE.Vector3()
        this.parentQuaternionWorld = new THREE.Quaternion()
        this.parentQuaternionInverse = new THREE.Quaternion()
        this.objectQuaternionWorld = new THREE.Quaternion()
        this.objectQuaternionLocal = new THREE.Quaternion()
        this.deltaQuaternion = new THREE.Quaternion()
        this.targetQuaternionWorld = new THREE.Quaternion()

        this.collectJoinTargets()
        this.randomizeInitialRotations()
        this.setEvents()
    }

    collectJoinTargets()
    {
        this.joinTargetsByTubeUuid.clear()

        for(const tubeTarget of this.rotationTargets)
        {
            if(!tubeTarget)
            {
                continue
            }

            this.joinTargetsByTubeUuid.set(
                tubeTarget.uuid,
                this.findJoinTargetsForTube(tubeTarget)
            )
        }
    }

    findJoinTargetsForTube(tubeTarget)
    {
        const parent = tubeTarget.parent
        if(!parent)
        {
            return []
        }

        const joinTargets = []
        const visited = new Set()
        parent.traverse((child) =>
        {
            if(child === tubeTarget || visited.has(child.uuid))
            {
                return
            }

            const name = String(child.name || '').toLowerCase()
            if(!name.includes(TUBE_JOIN_NAME_TOKEN))
            {
                return
            }

            visited.add(child.uuid)
            joinTargets.push(child)
        })

        return joinTargets
    }

    randomizeInitialRotations()
    {
        for(const target of this.rotationTargets)
        {
            if(!target)
            {
                continue
            }

            const randomQuarterTurns = Math.floor(Math.random() * 4)
            if(randomQuarterTurns > 0)
            {
                this.rotateTubeAssembly(target, randomQuarterTurns * QUARTER_TURN)
            }

            const turnDirection = Math.random() >= 0.5 ? 1 : -1
            this.turnDirectionByMeshUuid.set(target.uuid, turnDirection)
        }
    }

    setEvents()
    {
        this.onMouseDown = (event) =>
        {
            if(event?.button !== 0)
            {
                return
            }

            const tubeMesh = this.hoveredTubeMesh || this.getTubeMeshAtCenter()
            if(!tubeMesh)
            {
                return
            }

            this.rotateTubeByQuarterTurn(tubeMesh)
        }

        this.inputs?.on?.('mousedown.scene1TubeWater', this.onMouseDown)
    }

    getTubeMeshAtCenter()
    {
        if(!this.camera || this.tubeMeshes.length === 0)
        {
            return null
        }

        this.raycaster.setFromCamera(this.centerNdc, this.camera)
        const hits = this.raycaster.intersectObjects(this.tubeMeshes, false)
        return hits[0]?.object ?? null
    }

    update()
    {
        this.hoveredTubeMesh = this.getTubeMeshAtCenter()
    }

    isHoveringTube()
    {
        return Boolean(this.hoveredTubeMesh)
    }

    rotateTubeByQuarterTurn(mesh)
    {
        const rotationTarget = this.scene1Model?.getTubeWaterRotationTargetFromObject?.(mesh) ?? mesh
        if(!rotationTarget)
        {
            return
        }

        const direction = this.turnDirectionByMeshUuid.get(rotationTarget.uuid) ?? 1
        this.rotateTubeAssembly(rotationTarget, QUARTER_TURN * direction)
    }

    rotateTubeAssembly(tubeTarget, angle)
    {
        if(!tubeTarget)
        {
            return
        }

        this.getWorldCenter(tubeTarget, this.rotationPivotWorld)
        this.getRotationAxisWorld(tubeTarget, this.rotationAxisWorld)
        this.rotateObjectAroundWorldAxis(tubeTarget, this.rotationPivotWorld, this.rotationAxisWorld, angle)

        const joinTargets = this.joinTargetsByTubeUuid.get(tubeTarget.uuid) ?? []
        for(const joinTarget of joinTargets)
        {
            this.rotateObjectAroundWorldAxis(joinTarget, this.rotationPivotWorld, this.rotationAxisWorld, angle)
        }
    }

    getRotationAxisWorld(target, out)
    {
        this.localAxis.set(0, 0, 0)
        this.localAxis[ROTATION_AXIS] = 1
        target.getWorldQuaternion(this.targetQuaternionWorld)
        return out.copy(this.localAxis).applyQuaternion(this.targetQuaternionWorld).normalize()
    }

    getWorldCenter(target, out)
    {
        target.updateMatrixWorld(true)
        this.bounds.setFromObject(target)
        if(this.bounds.isEmpty())
        {
            return out.setFromMatrixPosition(target.matrixWorld)
        }

        return this.bounds.getCenter(out)
    }

    rotateObjectAroundWorldAxis(object, pivotWorld, axisWorld, angle)
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

    destroy()
    {
        this.inputs?.off?.('mousedown.scene1TubeWater')
        this.hoveredTubeMesh = null
        this.turnDirectionByMeshUuid.clear()
    }
}
