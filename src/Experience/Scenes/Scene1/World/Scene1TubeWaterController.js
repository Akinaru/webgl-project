import * as THREE from 'three'
import Experience from '../../../Experience.js'

const QUARTER_TURN = Math.PI * 0.5
const ROTATION_AXIS = 'z'
const FLOW_AXIS = 'y'
const TUBE_JOIN_NAME_TOKEN = 'tube-join'
const TUBE_WATER_ORDER_PATTERN = /tube-water(?:[_\s-]?(\d+))?(?:\.\d+)?$/i
const SOURCE_TUBE_NAME_PATTERN = /tube-water[_\s-]?4$/i
const SOURCE_TUBE_INDEX_FALLBACK = 3
const CONNECTION_DISTANCE_THRESHOLD = 0.52
const CONNECTION_DIRECTION_DOT_MAX = -0.35
const ROTATION_EPSILON = 0.02
const DISCONNECTED_COLOR = '#4a5665'
const CONNECTED_COLOR = '#4ea7ff'
const CONNECTED_EMISSIVE = '#2d7bc2'

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
        this.tubeIndexByUuid = new Map()
        this.tubeOrderByUuid = new Map()
        this.tubeOrderRankByUuid = new Map()
        this.initialRotationByTubeUuid = new Map()
        this.quarterTurnsFromInitialByTubeUuid = new Map()
        this.joinTargetsByTubeUuid = new Map()
        this.tubeMeshesByTargetUuid = new Map()
        this.hoveredTubeMesh = null

        this.bounds = new THREE.Box3()
        this.rotationPivotWorld = new THREE.Vector3()
        this.rotationAxisWorld = new THREE.Vector3()
        this.flowAxisWorld = new THREE.Vector3()
        this.localAxis = new THREE.Vector3()
        this.worldPosition = new THREE.Vector3()
        this.localPosition = new THREE.Vector3()
        this.parentQuaternionWorld = new THREE.Quaternion()
        this.parentQuaternionInverse = new THREE.Quaternion()
        this.objectQuaternionWorld = new THREE.Quaternion()
        this.objectQuaternionLocal = new THREE.Quaternion()
        this.deltaQuaternion = new THREE.Quaternion()
        this.targetQuaternionWorld = new THREE.Quaternion()
        this.targetScale = new THREE.Vector3()
        this.targetWorldPosition = new THREE.Vector3()
        this.endpointA = new THREE.Vector3()
        this.endpointB = new THREE.Vector3()
        this.endpointDirA = new THREE.Vector3()
        this.endpointDirB = new THREE.Vector3()

        this.collectJoinTargets()
        this.buildTubeOrder()
        this.setupTubeMaterials()
        this.captureInitialRotations()
        this.baseAdjacency = this.buildTubeAdjacency()
        this.randomizeInitialRotations()
        this.updateFlowState()
        this.setEvents()
    }

    captureInitialRotations()
    {
        this.initialRotationByTubeUuid.clear()
        this.quarterTurnsFromInitialByTubeUuid.clear()

        for(const target of this.rotationTargets)
        {
            if(!target)
            {
                continue
            }

            this.initialRotationByTubeUuid.set(
                target.uuid,
                this.normalizeAngle(target.rotation[ROTATION_AXIS] || 0)
            )
            this.quarterTurnsFromInitialByTubeUuid.set(target.uuid, 0)
        }
    }

    setupTubeMaterials()
    {
        this.tubeMeshesByTargetUuid.clear()

        for(const mesh of this.tubeMeshes)
        {
            if(!(mesh instanceof THREE.Mesh))
            {
                continue
            }

            const target = this.scene1Model?.getTubeWaterRotationTargetFromObject?.(mesh) ?? mesh
            if(!target)
            {
                continue
            }

            if(!this.tubeMeshesByTargetUuid.has(target.uuid))
            {
                this.tubeMeshesByTargetUuid.set(target.uuid, [])
            }
            this.tubeMeshesByTargetUuid.get(target.uuid).push(mesh)

            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const clonedMaterials = materials.map((material) => material?.clone?.() ?? material)
            mesh.material = Array.isArray(mesh.material) ? clonedMaterials : clonedMaterials[0]
        }
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

    buildTubeOrder()
    {
        this.tubeOrderByUuid.clear()
        this.tubeOrderRankByUuid.clear()

        const sortableTargets = []
        for(let index = 0; index < this.rotationTargets.length; index++)
        {
            const target = this.rotationTargets[index]
            if(!target)
            {
                continue
            }

            const order = this.getTubeOrder(target, index)
            this.tubeOrderByUuid.set(target.uuid, order)
            sortableTargets.push({ target, order, index })
        }

        sortableTargets.sort((a, b) =>
        {
            if(a.order !== b.order)
            {
                return a.order - b.order
            }

            return a.index - b.index
        })

        for(let rank = 0; rank < sortableTargets.length; rank++)
        {
            this.tubeOrderRankByUuid.set(sortableTargets[rank].target.uuid, rank)
        }
    }

    getTubeOrder(target, fallbackIndex)
    {
        const name = String(target?.name || '')
        const match = name.match(TUBE_WATER_ORDER_PATTERN)
        if(!match)
        {
            return Number.MAX_SAFE_INTEGER - (this.rotationTargets.length - fallbackIndex)
        }

        const rawOrder = match[1]
        if(rawOrder === undefined)
        {
            return 0
        }

        const parsedOrder = Number.parseInt(rawOrder, 10)
        return Number.isFinite(parsedOrder) ? parsedOrder : Number.MAX_SAFE_INTEGER - (this.rotationTargets.length - fallbackIndex)
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
        this.tubeIndexByUuid.clear()
        this.rotationTargets.forEach((target, index) =>
        {
            if(!target)
            {
                return
            }
            this.tubeIndexByUuid.set(target.uuid, index)
        })

        const sourceTarget = this.getSourceTubeTarget()

        this.rotationTargets.forEach((target, index) =>
        {
            if(!target)
            {
                return
            }

            const randomQuarterTurns = Math.floor(Math.random() * 4)
            const isSource = Boolean(sourceTarget && sourceTarget.uuid === target.uuid)
            if(!isSource && randomQuarterTurns > 0)
            {
                this.rotateTubeAssembly(target, randomQuarterTurns * QUARTER_TURN)
            }

            const turnDirection = Math.random() >= 0.5 ? 1 : -1
            this.turnDirectionByMeshUuid.set(target.uuid, turnDirection)
        })
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

        const sourceTarget = this.getSourceTubeTarget()
        if(sourceTarget && sourceTarget.uuid === rotationTarget.uuid)
        {
            return
        }

        const direction = this.turnDirectionByMeshUuid.get(rotationTarget.uuid) ?? 1
        this.rotateTubeAssembly(rotationTarget, QUARTER_TURN * direction)
        this.updateFlowState()
    }

    rotateTubeAssembly(tubeTarget, angle)
    {
        if(!tubeTarget)
        {
            return
        }

        this.trackQuarterTurnOffset(tubeTarget, angle)

        this.getWorldCenter(tubeTarget, this.rotationPivotWorld)
        this.getRotationAxisWorld(tubeTarget, this.rotationAxisWorld)
        this.rotateObjectAroundWorldAxis(tubeTarget, this.rotationPivotWorld, this.rotationAxisWorld, angle)

        const joinTargets = this.joinTargetsByTubeUuid.get(tubeTarget.uuid) ?? []
        for(const joinTarget of joinTargets)
        {
            this.rotateObjectAroundWorldAxis(joinTarget, this.rotationPivotWorld, this.rotationAxisWorld, angle)
        }
    }

    updateFlowState()
    {
        const connectedTubeIds = this.computeConnectedTubeIds()
        this.applyTubeFlowColors(connectedTubeIds)
    }

    computeConnectedTubeIds()
    {
        const connected = new Set()
        const sourceTarget = this.getSourceTubeTarget()
        if(!sourceTarget)
        {
            return connected
        }

        const adjacency = this.baseAdjacency instanceof Map
            ? this.baseAdjacency
            : this.buildTubeAdjacency()
        const queue = [sourceTarget.uuid]
        connected.add(sourceTarget.uuid)

        while(queue.length > 0)
        {
            const current = queue.shift()
            const neighbors = adjacency.get(current) ?? new Set()
            for(const neighbor of neighbors)
            {
                if(connected.has(neighbor))
                {
                    continue
                }

                if(!this.isTubeAtInitialRotation(neighbor))
                {
                    continue
                }

                if(!this.arePreviousTubesAtInitialRotation(neighbor))
                {
                    continue
                }

                connected.add(neighbor)
                queue.push(neighbor)
            }
        }

        return connected
    }

    isTubeAtInitialRotation(tubeUuid)
    {
        const target = this.rotationTargets.find((item) => item?.uuid === tubeUuid)
        if(!target)
        {
            return false
        }

        const quarterTurnOffset = this.quarterTurnsFromInitialByTubeUuid.get(tubeUuid)
        if(quarterTurnOffset !== undefined)
        {
            return this.normalizeQuarterTurnOffset(quarterTurnOffset) === 0
        }

        const initialRotation = this.initialRotationByTubeUuid.get(tubeUuid)
        if(initialRotation === undefined)
        {
            return true
        }

        const currentRotation = this.normalizeAngle(target.rotation[ROTATION_AXIS] || 0)
        const delta = Math.abs(
            THREE.MathUtils.euclideanModulo((currentRotation - initialRotation) + Math.PI, Math.PI * 2) - Math.PI
        )
        return delta <= ROTATION_EPSILON
    }

    arePreviousTubesAtInitialRotation(tubeUuid)
    {
        const rank = this.tubeOrderRankByUuid.get(tubeUuid)
        if(rank === undefined || rank <= 0)
        {
            return true
        }

        for(const target of this.rotationTargets)
        {
            if(!target)
            {
                continue
            }

            const targetRank = this.tubeOrderRankByUuid.get(target.uuid)
            if(targetRank === undefined || targetRank >= rank)
            {
                continue
            }

            if(!this.isTubeAtInitialRotation(target.uuid))
            {
                return false
            }
        }

        return true
    }

    getSourceTubeTarget()
    {
        let indexedSource = null

        for(const target of this.rotationTargets)
        {
            if(!target)
            {
                continue
            }

            if(this.tubeIndexByUuid.get(target.uuid) === SOURCE_TUBE_INDEX_FALLBACK)
            {
                indexedSource = target
            }

            const name = String(target?.name || '')
            if(SOURCE_TUBE_NAME_PATTERN.test(name))
            {
                return target
            }
        }

        if(indexedSource)
        {
            return indexedSource
        }

        return this.rotationTargets[SOURCE_TUBE_INDEX_FALLBACK] ?? this.rotationTargets[0] ?? null
    }

    buildTubeAdjacency()
    {
        const adjacency = new Map()
        const endpointsByTube = new Map()

        for(const target of this.rotationTargets)
        {
            if(!target)
            {
                continue
            }

            adjacency.set(target.uuid, new Set())
            endpointsByTube.set(target.uuid, this.computeTubeEndpoints(target))
        }

        for(let i = 0; i < this.rotationTargets.length; i++)
        {
            const tubeA = this.rotationTargets[i]
            if(!tubeA)
            {
                continue
            }

            for(let j = i + 1; j < this.rotationTargets.length; j++)
            {
                const tubeB = this.rotationTargets[j]
                if(!tubeB)
                {
                    continue
                }

                if(!this.areTubesConnected(endpointsByTube.get(tubeA.uuid), endpointsByTube.get(tubeB.uuid)))
                {
                    continue
                }

                adjacency.get(tubeA.uuid)?.add(tubeB.uuid)
                adjacency.get(tubeB.uuid)?.add(tubeA.uuid)
            }
        }

        return adjacency
    }

    computeTubeEndpoints(target)
    {
        this.getWorldCenter(target, this.rotationPivotWorld)
        this.getFlowAxisWorld(target, this.flowAxisWorld)
        const halfLength = this.estimateTubeHalfLengthWorld(target)

        this.endpointA.copy(this.rotationPivotWorld).addScaledVector(this.flowAxisWorld, halfLength)
        this.endpointB.copy(this.rotationPivotWorld).addScaledVector(this.flowAxisWorld, -halfLength)
        this.endpointDirA.copy(this.flowAxisWorld)
        this.endpointDirB.copy(this.flowAxisWorld).multiplyScalar(-1)

        return [
            { point: this.endpointA.clone(), direction: this.endpointDirA.clone() },
            { point: this.endpointB.clone(), direction: this.endpointDirB.clone() }
        ]
    }

    estimateTubeHalfLengthWorld(target)
    {
        if(target instanceof THREE.Mesh && target.geometry)
        {
            target.geometry.computeBoundingBox?.()
            if(target.geometry.boundingBox)
            {
                const size = target.geometry.boundingBox.getSize(new THREE.Vector3())
                target.matrixWorld.decompose(this.targetWorldPosition, this.targetQuaternionWorld, this.targetScale)
                return Math.max(0.16, (size[FLOW_AXIS] * Math.abs(this.targetScale[FLOW_AXIS]) * 0.5) * 0.95)
            }
        }

        this.bounds.setFromObject(target)
        if(this.bounds.isEmpty())
        {
            return 0.45
        }

        const size = this.bounds.getSize(new THREE.Vector3())
        return Math.max(0.16, (Math.max(size.x, size.y, size.z) * 0.5) * 0.42)
    }

    areTubesConnected(endpointsA = [], endpointsB = [])
    {
        for(const endpointA of endpointsA)
        {
            for(const endpointB of endpointsB)
            {
                if(endpointA.point.distanceTo(endpointB.point) > CONNECTION_DISTANCE_THRESHOLD)
                {
                    continue
                }

                if(endpointA.direction.dot(endpointB.direction) > CONNECTION_DIRECTION_DOT_MAX)
                {
                    continue
                }

                return true
            }
        }

        return false
    }

    applyTubeFlowColors(connectedTubeIds)
    {
        for(const target of this.rotationTargets)
        {
            if(!target)
            {
                continue
            }

            const isConnected = connectedTubeIds.has(target.uuid)
            const tubeMeshes = this.tubeMeshesByTargetUuid.get(target.uuid) ?? []
            for(const mesh of tubeMeshes)
            {
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
                for(const material of materials)
                {
                    if(!material)
                    {
                        continue
                    }

                    if(material.color)
                    {
                        material.color.set(isConnected ? CONNECTED_COLOR : DISCONNECTED_COLOR)
                    }

                    if(material.emissive)
                    {
                        material.emissive.set(isConnected ? CONNECTED_EMISSIVE : '#000000')
                        material.emissiveIntensity = isConnected ? 0.68 : 0
                    }

                    material.needsUpdate = true
                }
            }
        }
    }

    getRotationAxisWorld(target, out)
    {
        this.localAxis.set(0, 0, 0)
        this.localAxis[ROTATION_AXIS] = 1
        target.getWorldQuaternion(this.targetQuaternionWorld)
        return out.copy(this.localAxis).applyQuaternion(this.targetQuaternionWorld).normalize()
    }

    getFlowAxisWorld(target, out)
    {
        this.localAxis.set(0, 0, 0)
        this.localAxis[FLOW_AXIS] = 1
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

    normalizeAngle(value)
    {
        return THREE.MathUtils.euclideanModulo(value, Math.PI * 2)
    }

    trackQuarterTurnOffset(tubeTarget, angle)
    {
        if(!tubeTarget)
        {
            return
        }

        const deltaTurns = Math.round(angle / QUARTER_TURN)
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

    normalizeQuarterTurnOffset(value)
    {
        return ((value % 4) + 4) % 4
    }

    destroy()
    {
        this.inputs?.off?.('mousedown.scene1TubeWater')
        this.hoveredTubeMesh = null
        this.turnDirectionByMeshUuid.clear()
        this.tubeOrderByUuid.clear()
        this.tubeOrderRankByUuid.clear()
        this.quarterTurnsFromInitialByTubeUuid.clear()
        this.joinTargetsByTubeUuid.clear()
        this.tubeMeshesByTargetUuid.clear()
    }
}
