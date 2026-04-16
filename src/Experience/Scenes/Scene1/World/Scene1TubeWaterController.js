import * as THREE from 'three'
import Experience from '../../../Experience.js'

const QUARTER_TURN = Math.PI * 0.5
const ROTATION_AXIS = 'z'
const FLOW_AXIS = 'y'
const TUBE_JOIN_NAME_TOKEN = 'tube-join'
const MODULE_ROTATION_TARGET_PATTERN = /module-(?:angle|straight)(?:_instance)?[_\s-]?(\d+)(?:[_\s-]?([bt])(\d+))?(?:[._\s-]\d+)*$/i
const BRANCH_BASE_ORDER = 13
const SPECIAL_GATE_ORDER_MERGE = 14
const SPECIAL_GATE_ORDER_AFTER_MERGE = 15
const REQUIRED_B_BRANCH_INDEX_FOR_MERGE = 9
const REQUIRED_T_BRANCH_INDEX_FOR_MERGE = 3
const ROTATION_EPSILON = 0.02
const DISCONNECTED_COLOR = '#4a5665'
const CONNECTED_COLOR = '#4ea7ff'
const CONNECTED_EMISSIVE = '#2d7bc2'
const FLOW_FILL_SPEED_PER_SECOND = 1.9
const FLOW_PROGRESS_EPSILON = 1e-4
const FLOW_COORD_ATTRIBUTE = 'aFlowCoord'
const FLOW_COORD_EPSILON = 1e-5
const ANGLE_OUTER_FILL_BIAS = 0.45
const ANGLE_FLOW_MIN_SPAN = Math.PI * 0.25
const ANGLE_FLOW_MAX_SPAN = Math.PI * 0.75

export default class Scene1TubeWaterController
{
    constructor({ scene1Model } = {})
    {
        this.experience = new Experience()
        this.inputs = this.experience.inputs
        this.camera = this.experience.camera?.instance
        this.debug = this.experience.debug
        this.scene1Model = scene1Model
        this.tubeMeshes = this.scene1Model?.getTubeWaterMeshes?.() ?? []
        this.rotationTargets = this.scene1Model?.getTubeWaterRotationTargets?.() ?? []
        this.flow = {
            fillSpeed: FLOW_FILL_SPEED_PER_SECOND
        }

        this.raycaster = new THREE.Raycaster()
        this.centerNdc = new THREE.Vector2(0, 0)
        this.turnDirectionByMeshUuid = new Map()
        this.tubeIndexByUuid = new Map()
        this.targetMetaByUuid = new Map()
        this.orderedTargetUuids = []
        this.connectionDependencyGroupsByUuid = new Map()
        this.initialRotationByTubeUuid = new Map()
        this.quarterTurnsFromInitialByTubeUuid = new Map()
        this.joinTargetsByTubeUuid = new Map()
        this.tubeMeshesByTargetUuid = new Map()
        this.flowProgressByTubeUuid = new Map()
        this.flowShaderMaterialsByTubeUuid = new Map()
        this.flowEntryByTubeUuid = new Map()
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
        this.disconnectedColor = new THREE.Color(DISCONNECTED_COLOR)
        this.connectedColor = new THREE.Color(CONNECTED_COLOR)
        this.connectedEmissiveColor = new THREE.Color(CONNECTED_EMISSIVE)
        this.emissiveOffColor = new THREE.Color('#000000')
        this.colorMix = new THREE.Color()
        this.emissiveMix = new THREE.Color()

        this.collectJoinTargets()
        this.buildTubeOrder()
        this.buildConnectionDependencies()
        this.setupTubeMaterials()
        this.captureInitialRotations()
        this.randomizeInitialRotations()
        this.updateFlowState()
        this.setDebug()
        this.setEvents()
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('🧩 Scene1 Tube Flow', { expanded: false })
        this.debug.addBinding(this.debugFolder, this.flow, 'fillSpeed', {
            label: 'fillSpeed',
            min: 0.1,
            max: 8,
            step: 0.05
        })
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
            if(mesh.geometry?.clone)
            {
                mesh.geometry = mesh.geometry.clone()
            }

            this.setupFlowCoordAttribute(mesh, target.uuid)

            for(const material of clonedMaterials)
            {
                this.setupFlowShaderMaterial(material, mesh, target.uuid)
            }
        }
    }

    setupFlowShaderMaterial(material, mesh, tubeUuid)
    {
        if(!material || typeof material.onBeforeCompile !== 'function')
        {
            return
        }

        const geometry = mesh?.geometry
        if(!geometry?.attributes?.position)
        {
            return
        }

        if(!geometry.boundingBox)
        {
            geometry.computeBoundingBox?.()
        }

        const bounds = geometry.boundingBox
        if(!bounds)
        {
            return
        }

        const min = bounds.min[FLOW_AXIS]
        const max = bounds.max[FLOW_AXIS]
        const range = max - min
        if(!(Number.isFinite(range) && range > 1e-5))
        {
            return
        }

        const flowUniforms = {
            uFlowProgress: { value: 0 },
            uFlowDirection: { value: 1 },
            uFlowFeather: { value: 0.05 },
            uFlowMin: { value: min },
            uFlowRange: { value: range },
            uFlowDisconnectedColor: { value: this.disconnectedColor.clone() },
            uFlowConnectedColor: { value: this.connectedColor.clone() },
            uFlowConnectedEmissiveColor: { value: this.connectedEmissiveColor.clone() },
            uFlowEmissiveIntensity: { value: 0.68 }
        }

        material.userData.flowUniforms = flowUniforms

        const previousOnBeforeCompile = material.onBeforeCompile
        material.onBeforeCompile = (shader, renderer) =>
        {
            previousOnBeforeCompile?.(shader, renderer)

            shader.uniforms.uFlowProgress = flowUniforms.uFlowProgress
            shader.uniforms.uFlowDirection = flowUniforms.uFlowDirection
            shader.uniforms.uFlowFeather = flowUniforms.uFlowFeather
            shader.uniforms.uFlowMin = flowUniforms.uFlowMin
            shader.uniforms.uFlowRange = flowUniforms.uFlowRange
            shader.uniforms.uFlowDisconnectedColor = flowUniforms.uFlowDisconnectedColor
            shader.uniforms.uFlowConnectedColor = flowUniforms.uFlowConnectedColor
            shader.uniforms.uFlowConnectedEmissiveColor = flowUniforms.uFlowConnectedEmissiveColor
            shader.uniforms.uFlowEmissiveIntensity = flowUniforms.uFlowEmissiveIntensity

            if(shader.vertexShader.includes('#include <begin_vertex>'))
            {
                shader.vertexShader = shader.vertexShader
                    .replace(
                        'void main() {',
                        `attribute float ${FLOW_COORD_ATTRIBUTE};
varying float vFlowCoord;
void main() {`
                    )
                    .replace(
                        '#include <begin_vertex>',
                        `#include <begin_vertex>
vFlowCoord = clamp(${FLOW_COORD_ATTRIBUTE}, 0.0, 1.0);`
                    )
            }

            let flowFragmentShader = shader.fragmentShader
                .replace(
                    'void main() {',
                    `varying float vFlowCoord;
uniform float uFlowProgress;
uniform float uFlowDirection;
uniform float uFlowFeather;
uniform vec3 uFlowDisconnectedColor;
uniform vec3 uFlowConnectedColor;
uniform vec3 uFlowConnectedEmissiveColor;
uniform float uFlowEmissiveIntensity;
void main() {`
                )

            const hasDiffuseLine = flowFragmentShader.includes('vec4 diffuseColor = vec4( diffuse, opacity );')
            if(hasDiffuseLine)
            {
                flowFragmentShader = flowFragmentShader.replace(
                    'vec4 diffuseColor = vec4( diffuse, opacity );',
                    `float flowEdge = max(0.0001, uFlowFeather);
float flowCoord = uFlowDirection >= 0.0 ? vFlowCoord : (1.0 - vFlowCoord);
float flowFill = 1.0 - smoothstep(uFlowProgress - flowEdge, uFlowProgress, flowCoord);
vec3 flowBaseColor = mix(uFlowDisconnectedColor, uFlowConnectedColor, flowFill);
vec4 diffuseColor = vec4(flowBaseColor, opacity);`
                )
            }

            if(hasDiffuseLine && flowFragmentShader.includes('vec3 totalEmissiveRadiance = emissive;'))
            {
                flowFragmentShader = flowFragmentShader.replace(
                    'vec3 totalEmissiveRadiance = emissive;',
                    'vec3 totalEmissiveRadiance = uFlowConnectedEmissiveColor * (uFlowEmissiveIntensity * flowFill);'
                )
            }

            shader.fragmentShader = flowFragmentShader
        }

        const previousProgramCacheKey = material.customProgramCacheKey?.bind(material)
        material.customProgramCacheKey = () =>
        {
            const previousKey = previousProgramCacheKey ? previousProgramCacheKey() : ''
            return `${previousKey}|scene1-flow-fill-v2`
        }

        material.needsUpdate = true

        if(!this.flowShaderMaterialsByTubeUuid.has(tubeUuid))
        {
            this.flowShaderMaterialsByTubeUuid.set(tubeUuid, [])
        }
        this.flowShaderMaterialsByTubeUuid.get(tubeUuid).push(material)
    }

    setupFlowCoordAttribute(mesh, tubeUuid)
    {
        const geometry = mesh?.geometry
        const positionAttribute = geometry?.attributes?.position
        if(!geometry || !positionAttribute)
        {
            return
        }

        if(!geometry.boundingBox)
        {
            geometry.computeBoundingBox?.()
        }

        const bounds = geometry.boundingBox
        if(!bounds)
        {
            return
        }

        const min = bounds.min[FLOW_AXIS]
        const max = bounds.max[FLOW_AXIS]
        const range = max - min
        const hasAxisRange = Number.isFinite(range) && range > FLOW_COORD_EPSILON

        const isAngleTube = this.isAngleTube(tubeUuid)
        if(!hasAxisRange && !isAngleTube)
        {
            return
        }

        const angleProjection = isAngleTube
            ? this.computeAngleFlowProjection(positionAttribute, bounds)
            : null
        const flowProjection = angleProjection
            ? {
                type: 'angle',
                cornerX: angleProjection.cornerX,
                cornerY: angleProjection.cornerY,
                angleMin: angleProjection.angleMin,
                angleRange: angleProjection.angleRange,
                radiusMin: angleProjection.radiusMin,
                radiusRange: angleProjection.radiusRange
            }
            : {
                type: 'axis',
                min,
                range: Math.max(range, FLOW_COORD_EPSILON)
            }
        geometry.userData.flowProjection = flowProjection

        const flowCoordArray = new Float32Array(positionAttribute.count)
        for(let index = 0; index < positionAttribute.count; index++)
        {
            let flowCoord
            if(angleProjection)
            {
                const x = positionAttribute.getX(index)
                const y = positionAttribute.getY(index)
                const dx = x - angleProjection.cornerX
                const dy = y - angleProjection.cornerY
                const theta = Math.atan2(dy, dx)
                const thetaNorm = (theta - angleProjection.angleMin) / angleProjection.angleRange
                const radius = Math.sqrt((dx * dx) + (dy * dy))
                const radiusNorm = (radius - angleProjection.radiusMin) / angleProjection.radiusRange
                flowCoord = thetaNorm + ((0.5 - radiusNorm) * ANGLE_OUTER_FILL_BIAS)
            }
            else
            {
                const axisValue = positionAttribute.getY(index)
                flowCoord = (axisValue - min) / Math.max(range, FLOW_COORD_EPSILON)
            }

            flowCoordArray[index] = THREE.MathUtils.clamp(flowCoord, 0, 1)
        }

        geometry.setAttribute(FLOW_COORD_ATTRIBUTE, new THREE.BufferAttribute(flowCoordArray, 1))
    }

    computeAngleFlowProjection(positionAttribute, bounds)
    {
        const corners = [
            [bounds.min.x, bounds.min.y],
            [bounds.min.x, bounds.max.y],
            [bounds.max.x, bounds.min.y],
            [bounds.max.x, bounds.max.y]
        ]

        let bestProjection = null
        for(const [cornerX, cornerY] of corners)
        {
            let angleMin = Number.POSITIVE_INFINITY
            let angleMax = Number.NEGATIVE_INFINITY
            let radiusMin = Number.POSITIVE_INFINITY
            let radiusMax = Number.NEGATIVE_INFINITY

            for(let index = 0; index < positionAttribute.count; index++)
            {
                const dx = positionAttribute.getX(index) - cornerX
                const dy = positionAttribute.getY(index) - cornerY
                const angle = Math.atan2(dy, dx)
                const radius = Math.sqrt((dx * dx) + (dy * dy))
                if(angle < angleMin)
                {
                    angleMin = angle
                }
                if(angle > angleMax)
                {
                    angleMax = angle
                }
                if(radius < radiusMin)
                {
                    radiusMin = radius
                }
                if(radius > radiusMax)
                {
                    radiusMax = radius
                }
            }

            const angleRange = angleMax - angleMin
            if(!(Number.isFinite(angleRange) && angleRange >= ANGLE_FLOW_MIN_SPAN && angleRange <= ANGLE_FLOW_MAX_SPAN))
            {
                continue
            }

            const radiusRange = radiusMax - radiusMin
            if(!(Number.isFinite(radiusRange) && radiusRange > FLOW_COORD_EPSILON))
            {
                continue
            }

            if(!bestProjection || radiusRange > bestProjection.radiusRange)
            {
                bestProjection = {
                    cornerX,
                    cornerY,
                    angleMin,
                    angleRange,
                    radiusMin,
                    radiusRange
                }
            }
        }

        return bestProjection
    }

    computeLocalFlowCoord(mesh, localPosition)
    {
        const flowProjection = mesh?.geometry?.userData?.flowProjection
        if(!flowProjection || !localPosition)
        {
            return null
        }

        if(flowProjection.type === 'angle')
        {
            const dx = localPosition.x - flowProjection.cornerX
            const dy = localPosition.y - flowProjection.cornerY
            const theta = Math.atan2(dy, dx)
            const thetaNorm = (theta - flowProjection.angleMin) / Math.max(flowProjection.angleRange, FLOW_COORD_EPSILON)
            const radius = Math.sqrt((dx * dx) + (dy * dy))
            const radiusNorm = (radius - flowProjection.radiusMin) / Math.max(flowProjection.radiusRange, FLOW_COORD_EPSILON)
            return thetaNorm + ((0.5 - radiusNorm) * ANGLE_OUTER_FILL_BIAS)
        }

        return (localPosition[FLOW_AXIS] - flowProjection.min) / Math.max(flowProjection.range, FLOW_COORD_EPSILON)
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
        this.targetMetaByUuid.clear()
        this.orderedTargetUuids = []

        const sortableTargets = []
        for(let index = 0; index < this.rotationTargets.length; index++)
        {
            const target = this.rotationTargets[index]
            if(!target)
            {
                continue
            }

            const meta = this.getTargetMeta(target, index)
            this.targetMetaByUuid.set(target.uuid, meta)
            sortableTargets.push({ target, meta, index })
        }

        sortableTargets.sort((a, b) =>
        {
            if(a.meta.order !== b.meta.order)
            {
                return a.meta.order - b.meta.order
            }

            if(a.meta.branchType !== b.meta.branchType)
            {
                return this.getBranchSortWeight(a.meta.branchType) - this.getBranchSortWeight(b.meta.branchType)
            }

            if(a.meta.branchIndex !== b.meta.branchIndex)
            {
                return a.meta.branchIndex - b.meta.branchIndex
            }

            return a.index - b.index
        })

        for(const item of sortableTargets)
        {
            this.orderedTargetUuids.push(item.target.uuid)
        }
    }

    getTargetMeta(target, fallbackIndex)
    {
        const name = this.getModuleNameForTarget(target)
        const match = name.match(MODULE_ROTATION_TARGET_PATTERN)
        if(!match)
        {
            return {
                order: Number.MAX_SAFE_INTEGER - (this.rotationTargets.length - fallbackIndex),
                branchType: 'main',
                branchIndex: 0
            }
        }

        const parsedOrder = Number.parseInt(match[1], 10)
        const branchType = match[2] ? String(match[2]).toLowerCase() : 'main'
        const parsedBranchIndex = match[3] ? Number.parseInt(match[3], 10) : 0

        return {
            order: Number.isFinite(parsedOrder) ? parsedOrder : Number.MAX_SAFE_INTEGER - (this.rotationTargets.length - fallbackIndex),
            branchType: branchType === 'b' || branchType === 't' ? branchType : 'main',
            branchIndex: Number.isFinite(parsedBranchIndex) ? parsedBranchIndex : 0
        }
    }

    getModuleNameForTarget(target)
    {
        let current = target
        let moduleCandidate = null
        while(current)
        {
            const name = String(current.name || '')
            if(MODULE_ROTATION_TARGET_PATTERN.test(name))
            {
                // Keep climbing: exported GLTF nodes can contain nested helper
                // modules (e.g. module-angle_04) inside the real puzzle module.
                moduleCandidate = name
            }
            current = current.parent
        }

        return moduleCandidate ?? String(target?.name || '')
    }

    getBranchSortWeight(branchType)
    {
        if(branchType === 'main')
        {
            return 0
        }

        if(branchType === 't')
        {
            return 1
        }

        if(branchType === 'b')
        {
            return 2
        }

        return 3
    }

    buildConnectionDependencies()
    {
        this.connectionDependencyGroupsByUuid.clear()

        for(const targetUuid of this.orderedTargetUuids)
        {
            this.connectionDependencyGroupsByUuid.set(targetUuid, [])
        }

        const mainTargets = this.getTargetsByMeta(({ branchType }) => branchType === 'main')
        let previousMainUuid = null
        for(const target of mainTargets)
        {
            const dependencyGroups = []
            if(previousMainUuid)
            {
                dependencyGroups.push([previousMainUuid])
            }

            this.connectionDependencyGroupsByUuid.set(target.uuid, dependencyGroups)
            previousMainUuid = target.uuid
        }

        this.buildBranchDependencies('t')
        this.buildBranchDependencies('b')
        this.applySpecialGateDependencies()
    }

    getTargetsByMeta(predicate)
    {
        return this.rotationTargets
            .filter((target) => target && predicate(this.targetMetaByUuid.get(target.uuid) ?? {}))
            .sort((targetA, targetB) =>
            {
                const metaA = this.targetMetaByUuid.get(targetA.uuid) ?? { order: Number.MAX_SAFE_INTEGER, branchIndex: 0, branchType: 'main' }
                const metaB = this.targetMetaByUuid.get(targetB.uuid) ?? { order: Number.MAX_SAFE_INTEGER, branchIndex: 0, branchType: 'main' }
                if(metaA.order !== metaB.order)
                {
                    return metaA.order - metaB.order
                }

                if(metaA.branchIndex !== metaB.branchIndex)
                {
                    return metaA.branchIndex - metaB.branchIndex
                }

                return 0
            })
    }

    buildBranchDependencies(branchType)
    {
        const branchTargets = this.getTargetsByMeta((meta) =>
            meta.branchType === branchType && meta.order === BRANCH_BASE_ORDER
        )
        if(branchTargets.length === 0)
        {
            return
        }

        const entryDependency = this.getMainAtOrder(BRANCH_BASE_ORDER) ?? this.getLastMainBeforeOrder(BRANCH_BASE_ORDER)
        let previousBranchUuid = null
        for(const target of branchTargets)
        {
            const dependencyGroups = []
            if(previousBranchUuid)
            {
                dependencyGroups.push([previousBranchUuid])
            }
            else if(entryDependency)
            {
                dependencyGroups.push([entryDependency])
            }

            this.connectionDependencyGroupsByUuid.set(target.uuid, dependencyGroups)
            previousBranchUuid = target.uuid
        }
    }

    getLastMainBeforeOrder(order)
    {
        let candidate = null
        let candidateOrder = -Infinity

        for(const target of this.rotationTargets)
        {
            if(!target)
            {
                continue
            }

            const meta = this.targetMetaByUuid.get(target.uuid)
            if(!meta || meta.branchType !== 'main')
            {
                continue
            }

            if(meta.order < order && meta.order > candidateOrder)
            {
                candidate = target.uuid
                candidateOrder = meta.order
            }
        }

        return candidate
    }

    getMainAtOrder(order)
    {
        for(const target of this.rotationTargets)
        {
            if(!target)
            {
                continue
            }

            const meta = this.targetMetaByUuid.get(target.uuid)
            if(!meta)
            {
                continue
            }

            if(meta.branchType === 'main' && meta.order === order)
            {
                return target.uuid
            }
        }

        return null
    }

    applySpecialGateDependencies()
    {
        const mergeTargets = this.getTargetsByMeta((meta) =>
            meta.branchType === 'main' && meta.order === SPECIAL_GATE_ORDER_MERGE
        )
        const afterMergeTargets = this.getTargetsByMeta((meta) =>
            meta.branchType === 'main' && meta.order === SPECIAL_GATE_ORDER_AFTER_MERGE
        )
        if(mergeTargets.length === 0 && afterMergeTargets.length === 0)
        {
            return
        }

        const b9Uuid = this.findBranchUuid('b', REQUIRED_B_BRANCH_INDEX_FOR_MERGE)
        const t3Uuid = this.findBranchUuid('t', REQUIRED_T_BRANCH_INDEX_FOR_MERGE)

        if(mergeTargets.length > 0 && (b9Uuid || t3Uuid))
        {
            const mergeDependencyGroups = []
            if(b9Uuid)
            {
                mergeDependencyGroups.push([b9Uuid])
            }
            if(t3Uuid)
            {
                mergeDependencyGroups.push([t3Uuid])
            }

            for(const mergeTarget of mergeTargets)
            {
                this.connectionDependencyGroupsByUuid.set(mergeTarget.uuid, mergeDependencyGroups)
            }
        }

        if(afterMergeTargets.length > 0)
        {
            const mergeUuids = mergeTargets.map((target) => target.uuid)
            if(mergeUuids.length > 0)
            {
                for(const afterMergeTarget of afterMergeTargets)
                {
                    this.connectionDependencyGroupsByUuid.set(
                        afterMergeTarget.uuid,
                        mergeUuids.map((mergeUuid) => [mergeUuid])
                    )
                }
            }
        }
    }

    findBranchUuid(branchType, branchIndex)
    {
        for(const target of this.rotationTargets)
        {
            if(!target)
            {
                continue
            }

            const meta = this.targetMetaByUuid.get(target.uuid)
            if(!meta)
            {
                continue
            }

            if(meta.order === BRANCH_BASE_ORDER && meta.branchType === branchType && meta.branchIndex === branchIndex)
            {
                return target.uuid
            }
        }

        return null
    }

    findJoinTargetsForTube(tubeTarget)
    {
        const name = String(tubeTarget?.name || '').toLowerCase()
        const isModuleTarget = MODULE_ROTATION_TARGET_PATTERN.test(name)
        const traversalRoot = isModuleTarget ? tubeTarget : tubeTarget.parent
        if(!traversalRoot)
        {
            return []
        }

        const joinTargets = []
        const visited = new Set()
        traversalRoot.traverse((child) =>
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
        this.updateFlowState(this.getDeltaSeconds())
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

    updateFlowState(deltaSeconds = this.getDeltaSeconds())
    {
        const { flowPathUuids, flowEntryByTubeUuid } = this.computeSequentialFlowPathUuids()
        this.flowEntryByTubeUuid = flowEntryByTubeUuid
        this.updateTubeFlowProgress(flowPathUuids, deltaSeconds)
        this.applyTubeFlowColors()
    }

    computeSequentialFlowPathUuids()
    {
        const connected = new Set()
        const flowPath = []
        const flowEntryByTubeUuid = new Map()
        const orderedUuids = this.orderedTargetUuids.length > 0
            ? this.orderedTargetUuids
            : this.rotationTargets.map((target) => target?.uuid).filter(Boolean)

        let hasProgress = true
        while(hasProgress)
        {
            hasProgress = false
            for(const tubeUuid of orderedUuids)
            {
                if(connected.has(tubeUuid))
                {
                    continue
                }

                if(!this.isTubeAtInitialRotation(tubeUuid))
                {
                    continue
                }

                if(!this.areDependencyGroupsSatisfied(tubeUuid, connected))
                {
                    continue
                }

                const entryDependencyUuid = this.getSatisfiedEntryDependencyUuid(tubeUuid, connected)
                connected.add(tubeUuid)
                flowPath.push(tubeUuid)
                if(entryDependencyUuid)
                {
                    flowEntryByTubeUuid.set(tubeUuid, entryDependencyUuid)
                }
                hasProgress = true
                break
            }
        }

        return {
            flowPathUuids: flowPath,
            flowEntryByTubeUuid
        }
    }

    getSatisfiedEntryDependencyUuid(tubeUuid, connectedTubeIds)
    {
        const dependencyGroups = this.connectionDependencyGroupsByUuid.get(tubeUuid) ?? []
        for(const group of dependencyGroups)
        {
            if(group.length === 0)
            {
                continue
            }

            if(group.every((dependencyUuid) => connectedTubeIds.has(dependencyUuid)))
            {
                return group[0]
            }
        }

        return null
    }

    updateTubeFlowProgress(flowPathUuids, deltaSeconds)
    {
        const flowPathSet = new Set(flowPathUuids)
        const stepFill = Math.max(0, deltaSeconds) * Math.max(0, this.flow.fillSpeed ?? FLOW_FILL_SPEED_PER_SECOND)

        for(const target of this.rotationTargets)
        {
            if(!target)
            {
                continue
            }

            const tubeUuid = target.uuid
            if(!flowPathSet.has(tubeUuid))
            {
                this.flowProgressByTubeUuid.set(tubeUuid, 0)
                continue
            }

            if(!this.flowProgressByTubeUuid.has(tubeUuid))
            {
                this.flowProgressByTubeUuid.set(tubeUuid, 0)
            }
        }

        for(const tubeUuid of flowPathUuids)
        {
            const currentProgress = this.flowProgressByTubeUuid.get(tubeUuid) ?? 0
            if(!this.canTubeFillNow(tubeUuid))
            {
                this.flowProgressByTubeUuid.set(tubeUuid, 0)
                continue
            }

            const nextProgress = this.moveTowards(currentProgress, 1, stepFill)
            this.flowProgressByTubeUuid.set(tubeUuid, nextProgress)
        }
    }

    canTubeFillNow(tubeUuid)
    {
        const dependencyGroups = this.connectionDependencyGroupsByUuid.get(tubeUuid) ?? []
        if(dependencyGroups.length === 0)
        {
            return true
        }

        for(const group of dependencyGroups)
        {
            const isGroupReady = group.every((dependencyUuid) =>
            {
                const dependencyProgress = this.flowProgressByTubeUuid.get(dependencyUuid) ?? 0
                return dependencyProgress >= (1 - FLOW_PROGRESS_EPSILON)
            })
            if(isGroupReady)
            {
                return true
            }
        }

        return false
    }

    moveTowards(value, target, maxStep)
    {
        if(maxStep <= 0)
        {
            return THREE.MathUtils.clamp(value, 0, 1)
        }

        const delta = target - value
        if(Math.abs(delta) <= maxStep)
        {
            return THREE.MathUtils.clamp(target, 0, 1)
        }

        return THREE.MathUtils.clamp(
            value + Math.sign(delta) * maxStep,
            0,
            1
        )
    }

    getDeltaSeconds()
    {
        return Math.min(this.experience.time?.delta ?? 0, 50) * 0.001
    }

    areDependencyGroupsSatisfied(tubeUuid, connectedTubeIds)
    {
        const dependencyGroups = this.connectionDependencyGroupsByUuid.get(tubeUuid) ?? []
        if(dependencyGroups.length === 0)
        {
            return true
        }

        for(const group of dependencyGroups)
        {
            if(group.every((dependencyUuid) => connectedTubeIds.has(dependencyUuid)))
            {
                return true
            }
        }

        return false
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
            const normalizedOffset = this.normalizeQuarterTurnOffset(quarterTurnOffset)
            if(this.isStraightTube(tubeUuid))
            {
                return normalizedOffset === 0 || normalizedOffset === 2
            }
            return normalizedOffset === 0
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

    isStraightTube(tubeUuid)
    {
        const target = this.rotationTargets.find((item) => item?.uuid === tubeUuid)
        if(!target)
        {
            return false
        }

        const moduleName = this.getModuleNameForTarget(target)
        return /^module-straight/i.test(moduleName)
    }

    isAngleTube(tubeUuid)
    {
        const target = this.rotationTargets.find((item) => item?.uuid === tubeUuid)
        if(!target)
        {
            return false
        }

        const moduleName = this.getModuleNameForTarget(target)
        return /^module-angle/i.test(moduleName)
    }

    isStraightTubeFlowReversed(tubeUuid)
    {
        if(!this.isStraightTube(tubeUuid))
        {
            return false
        }

        const quarterTurnOffset = this.quarterTurnsFromInitialByTubeUuid.get(tubeUuid) ?? 0
        return this.normalizeQuarterTurnOffset(quarterTurnOffset) === 2
    }

    getTubeFlowDirection(tubeUuid)
    {
        const entryDependencyUuid = this.flowEntryByTubeUuid.get(tubeUuid)
        if(entryDependencyUuid)
        {
            const inferredDirection = this.inferFlowDirectionFromNeighbor(tubeUuid, entryDependencyUuid)
            if(inferredDirection !== 0)
            {
                return inferredDirection
            }
        }

        if(!this.isStraightTube(tubeUuid))
        {
            return 1
        }

        return this.isStraightTubeFlowReversed(tubeUuid) ? -1 : 1
    }

    inferFlowDirectionFromNeighbor(tubeUuid, neighborTubeUuid)
    {
        const currentTube = this.rotationTargets.find((item) => item?.uuid === tubeUuid)
        const neighborTube = this.rotationTargets.find((item) => item?.uuid === neighborTubeUuid)
        if(!currentTube || !neighborTube)
        {
            return 0
        }

        const currentTubeMeshes = this.tubeMeshesByTargetUuid.get(tubeUuid) ?? []
        const currentTubeMesh = currentTubeMeshes[0]
        if(!currentTubeMesh)
        {
            return 0
        }

        currentTube.updateMatrixWorld(true)
        currentTubeMesh.updateMatrixWorld(true)
        neighborTube.updateMatrixWorld(true)
        this.targetWorldPosition.setFromMatrixPosition(neighborTube.matrixWorld)
        this.localPosition.copy(this.targetWorldPosition)
        currentTubeMesh.worldToLocal(this.localPosition)
        const localFlowCoord = this.computeLocalFlowCoord(currentTubeMesh, this.localPosition)
        if(!Number.isFinite(localFlowCoord))
        {
            return 0
        }
        return localFlowCoord >= 0.5 ? -1 : 1
    }

    getSourceTubeTarget()
    {
        let sourceTarget = null
        let sourceOrder = Number.POSITIVE_INFINITY

        for(const target of this.rotationTargets)
        {
            if(!target)
            {
                continue
            }

            const meta = this.targetMetaByUuid.get(target.uuid)
            if(!meta || meta.branchType !== 'main')
            {
                continue
            }

            if(meta.order < sourceOrder)
            {
                sourceOrder = meta.order
                sourceTarget = target
            }
        }

        return sourceTarget ?? this.rotationTargets[0] ?? null
    }

    applyTubeFlowColors()
    {
        for(const target of this.rotationTargets)
        {
            if(!target)
            {
                continue
            }

            const flowProgress = this.flowProgressByTubeUuid.get(target.uuid) ?? 0
            const flowDirection = this.getTubeFlowDirection(target.uuid)
            const shaderMaterials = this.flowShaderMaterialsByTubeUuid.get(target.uuid) ?? []
            for(const shaderMaterial of shaderMaterials)
            {
                const flowUniforms = shaderMaterial?.userData?.flowUniforms
                if(flowUniforms?.uFlowProgress)
                {
                    flowUniforms.uFlowProgress.value = flowProgress
                }
                if(flowUniforms?.uFlowDirection)
                {
                    flowUniforms.uFlowDirection.value = flowDirection
                }
            }

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

                    // Fallback path for materials where onBeforeCompile shader hook
                    // is not available.
                    const usesFlowShader = Boolean(material.userData?.flowUniforms)
                    if(usesFlowShader)
                    {
                        continue
                    }

                    if(material.color)
                    {
                        this.colorMix.lerpColors(this.disconnectedColor, this.connectedColor, flowProgress)
                        material.color.copy(this.colorMix)
                    }

                    if(material.emissive)
                    {
                        this.emissiveMix.lerpColors(this.emissiveOffColor, this.connectedEmissiveColor, flowProgress)
                        material.emissive.copy(this.emissiveMix)
                        material.emissiveIntensity = 0.68 * flowProgress
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
        this.debugFolder?.dispose?.()
        this.debugFolder = null
        this.hoveredTubeMesh = null
        this.turnDirectionByMeshUuid.clear()
        this.targetMetaByUuid.clear()
        this.orderedTargetUuids = []
        this.connectionDependencyGroupsByUuid.clear()
        this.quarterTurnsFromInitialByTubeUuid.clear()
        this.joinTargetsByTubeUuid.clear()
        this.tubeMeshesByTargetUuid.clear()
        this.flowProgressByTubeUuid.clear()
        this.flowShaderMaterialsByTubeUuid.clear()
        this.flowEntryByTubeUuid.clear()
    }
}
