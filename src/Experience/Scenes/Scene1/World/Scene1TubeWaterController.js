import * as THREE from 'three'
import Experience from '../../../Experience.js'
import CenterScreenRaycaster from '../../../Utils/CenterScreenRaycaster.js'

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
const FLOW_FILL_SPEED_PER_SECOND = 0.45
const FLOW_PROGRESS_EPSILON = 1e-4
const FLOW_COORD_ATTRIBUTE = 'aFlowCoord'
const FLOW_COORD_EPSILON = 1e-5
const ANGLE_FLOW_MIN_SPAN = Math.PI * 0.25
const ANGLE_FLOW_MAX_SPAN = Math.PI * 0.75
const BLUE_WINDOW_NAME_PATTERN = /fenetre[\s_-]?blue/i
const WINDOW_COORD_ATTRIBUTE = 'aWindowCoord'
const WINDOW_FLOW_AXIS = 'x'
const PRIMARY_WINDOW_KEY = 'fenetre-blue'
const BRANCH_WINDOW_KEY = 'fenetre-blue_1'
const AFTER_20_WINDOW_KEY = 'fenetre-blue_2'

export default class Scene1TubeWaterController
{
    constructor({ scene1Model } = {})
    {
        this.experience = new Experience()
        this.inputs = this.experience.inputs
        this.debug = this.experience.debug
        this.scene1Model = scene1Model
        this.tubeMeshes = this.scene1Model?.getTubeWaterMeshes?.() ?? []
        this.rotationTargets = this.scene1Model?.getTubeWaterRotationTargets?.() ?? []
        this.flow = {
            fillSpeed: FLOW_FILL_SPEED_PER_SECOND
        }

        this.centerRaycaster = new CenterScreenRaycaster({
            getCamera: () => this.experience.camera?.instance ?? null
        })
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
        this.activeFlowSourceByTubeUuid = new Map()
        this.dualInflowByTubeUuid = new Map()
        this.flowShaderMaterialsByTubeUuid = new Map()
        this.flowEntryByTubeUuid = new Map()
        this.rotationTargetUuidByName = new Map()
        this.blueWindowMeshes = []
        this.blueWindowMeshesByName = new Map()
        this.blueWindowShaderMaterialsByMeshUuid = new Map()
        this.blueWindowFlowProgressByName = new Map()
        this.requiredWindowByTubeUuid = new Map()
        this.windowSourceByTubeUuid = new Map()
        this.startAlignedTubeUuids = new Set()
        this.flowAnimationStarted = false
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
        this.tubeConnectedColor = new THREE.Color(CONNECTED_COLOR)
        this.tubeConnectedEmissiveColor = new THREE.Color(CONNECTED_EMISSIVE)
        this.windowConnectedColor = new THREE.Color(CONNECTED_COLOR)
        this.windowConnectedEmissiveColor = new THREE.Color(CONNECTED_EMISSIVE)
        this.emissiveOffColor = new THREE.Color('#000000')
        this.colorMix = new THREE.Color()
        this.emissiveMix = new THREE.Color()
        this.tmpColor = new THREE.Color()

        this.collectJoinTargets()
        this.buildTubeOrder()
        this.buildConnectionDependencies()
        this.buildWindowTubeDependencies()
        this.setupTubeMaterials()
        this.setupBlueWindowMeshes()
        this.captureInitialRotations()
        this.computeStartAlignedTubes()
        this.randomizeInitialRotations()
        this.resetFlowAnimation()
        this.scene1Model?.refreshCollisionBoxes?.()
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

    setupBlueWindowMeshes()
    {
        this.blueWindowMeshes = []
        this.blueWindowMeshesByName.clear()
        this.blueWindowShaderMaterialsByMeshUuid.clear()
        this.blueWindowFlowProgressByName.clear()

        const root = this.scene1Model?.model
        if(!root)
        {
            return
        }

        let genericBlueWindowCount = 0
        root.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            const normalizedName = this.normalizeObjectName(child.name || '')
            if(!BLUE_WINDOW_NAME_PATTERN.test(normalizedName))
            {
                return
            }

            const materials = Array.isArray(child.material) ? child.material : [child.material]
            const clonedMaterials = materials.map((material) => material?.clone?.() ?? material)
            child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0]
            if(child.geometry?.clone)
            {
                child.geometry = child.geometry.clone()
            }

            this.setupBlueWindowCoordAttribute(child)
            for(const material of clonedMaterials)
            {
                this.setupBlueWindowShaderMaterial(material, child)
            }

            this.blueWindowMeshes.push(child)

            let windowKey = normalizedName
            if(normalizedName === 'fenetre-blue')
            {
                windowKey = genericBlueWindowCount === 0
                    ? 'fenetre-blue'
                    : `fenetre-blue_${genericBlueWindowCount}`
                genericBlueWindowCount++
            }

            if(!this.blueWindowMeshesByName.has(windowKey))
            {
                this.blueWindowMeshesByName.set(windowKey, [])
            }
            this.blueWindowMeshesByName.get(windowKey).push(child)
        })
    }

    setupBlueWindowCoordAttribute(mesh)
    {
        const geometry = mesh?.geometry
        const position = geometry?.attributes?.position
        if(!geometry || !position)
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

        const minCoord = bounds.min[WINDOW_FLOW_AXIS]
        const maxCoord = bounds.max[WINDOW_FLOW_AXIS]
        const range = maxCoord - minCoord
        if(!(Number.isFinite(range) && range > 1e-5))
        {
            return
        }

        const coordValues = new Float32Array(position.count)
        for(let index = 0; index < position.count; index++)
        {
            const axisValue = position.getX(index)
            coordValues[index] = THREE.MathUtils.clamp((axisValue - minCoord) / range, 0, 1)
        }

        geometry.setAttribute(WINDOW_COORD_ATTRIBUTE, new THREE.BufferAttribute(coordValues, 1))
        geometry.attributes[WINDOW_COORD_ATTRIBUTE].needsUpdate = true
    }

    setupBlueWindowShaderMaterial(material, mesh)
    {
        if(!material || typeof material.onBeforeCompile !== 'function')
        {
            return
        }

        const geometry = mesh?.geometry
        if(!geometry?.attributes?.[WINDOW_COORD_ATTRIBUTE] || !geometry.attributes?.position)
        {
            return
        }

        const windowUniforms = {
            uWindowProgress: { value: 0 },
            uWindowDisconnectedColor: { value: this.disconnectedColor.clone() },
            uWindowConnectedColor: { value: this.windowConnectedColor.clone() },
            uWindowConnectedEmissiveColor: { value: this.windowConnectedEmissiveColor.clone() },
            uWindowEmissiveIntensity: { value: 0.68 }
        }
        material.userData.windowFlowUniforms = windowUniforms

        const previousOnBeforeCompile = material.onBeforeCompile
        material.onBeforeCompile = (shader, renderer) =>
        {
            previousOnBeforeCompile?.(shader, renderer)

            shader.uniforms.uWindowProgress = windowUniforms.uWindowProgress
            shader.uniforms.uWindowDisconnectedColor = windowUniforms.uWindowDisconnectedColor
            shader.uniforms.uWindowConnectedColor = windowUniforms.uWindowConnectedColor
            shader.uniforms.uWindowConnectedEmissiveColor = windowUniforms.uWindowConnectedEmissiveColor
            shader.uniforms.uWindowEmissiveIntensity = windowUniforms.uWindowEmissiveIntensity

            if(shader.vertexShader.includes('#include <begin_vertex>'))
            {
                shader.vertexShader = shader.vertexShader
                    .replace(
                        'void main() {',
                        `attribute float ${WINDOW_COORD_ATTRIBUTE};
varying float vWindowCoord;
void main() {`
                    )
                    .replace(
                        '#include <begin_vertex>',
                        `#include <begin_vertex>
vWindowCoord = ${WINDOW_COORD_ATTRIBUTE};`
                    )
            }

            if(shader.fragmentShader.includes('#include <color_fragment>'))
            {
                shader.fragmentShader = shader.fragmentShader
                    .replace(
                        'void main() {',
                        `varying float vWindowCoord;
uniform float uWindowProgress;
uniform vec3 uWindowDisconnectedColor;
uniform vec3 uWindowConnectedColor;
uniform vec3 uWindowConnectedEmissiveColor;
uniform float uWindowEmissiveIntensity;
void main() {`
                    )
                    .replace(
                        '#include <color_fragment>',
                        `#include <color_fragment>
float windowFillMask = step(vWindowCoord, uWindowProgress);
diffuseColor.rgb = mix(uWindowDisconnectedColor, uWindowConnectedColor, windowFillMask);`
                    )
                    .replace(
                        '#include <emissivemap_fragment>',
                        `#include <emissivemap_fragment>
totalEmissiveRadiance = mix(vec3(0.0), uWindowConnectedEmissiveColor * uWindowEmissiveIntensity, windowFillMask);`
                    )
            }
        }

        material.customProgramCacheKey = () => `${material.type}_windowFlow`
        material.needsUpdate = true

        if(!this.blueWindowShaderMaterialsByMeshUuid.has(mesh.uuid))
        {
            this.blueWindowShaderMaterialsByMeshUuid.set(mesh.uuid, [])
        }
        this.blueWindowShaderMaterialsByMeshUuid.get(mesh.uuid).push(material)
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
            uFlowDualSided: { value: 0 },
            uFlowFeather: { value: 0.05 },
            uFlowMin: { value: min },
            uFlowRange: { value: range },
            uFlowDisconnectedColor: { value: this.disconnectedColor.clone() },
            uFlowConnectedColor: { value: this.tubeConnectedColor.clone() },
            uFlowConnectedEmissiveColor: { value: this.tubeConnectedEmissiveColor.clone() },
            uFlowEmissiveIntensity: { value: 0.68 }
        }

        material.userData.flowUniforms = flowUniforms

        const previousOnBeforeCompile = material.onBeforeCompile
        material.onBeforeCompile = (shader, renderer) =>
        {
            previousOnBeforeCompile?.(shader, renderer)

            shader.uniforms.uFlowProgress = flowUniforms.uFlowProgress
            shader.uniforms.uFlowDirection = flowUniforms.uFlowDirection
            shader.uniforms.uFlowDualSided = flowUniforms.uFlowDualSided
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
uniform float uFlowDualSided;
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
float flowProgress = clamp(uFlowProgress, 0.0, 1.0);
float flowCoordSingle = uFlowDirection >= 0.0 ? vFlowCoord : (1.0 - vFlowCoord);
float flowFillSingle = 1.0 - smoothstep(flowProgress - flowEdge, flowProgress, flowCoordSingle);
float flowCoordDual = min(vFlowCoord, 1.0 - vFlowCoord);
float flowFillDual = 1.0 - smoothstep((flowProgress * 0.5) - flowEdge, (flowProgress * 0.5), flowCoordDual);
float dualFillCompleted = step(0.9999, flowProgress);
flowFillDual = mix(flowFillDual, 1.0, dualFillCompleted);
float flowFill = mix(flowFillSingle, flowFillDual, step(0.5, uFlowDualSided));
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
        const joinGuidedAngleProjection = angleProjection
            ? this.refineAngleFlowProjectionWithTubeJoins(angleProjection, mesh, tubeUuid, bounds)
            : null
        const effectiveAngleProjection = joinGuidedAngleProjection ?? angleProjection
        const flowProjection = angleProjection
            ? {
                type: 'angle',
                cornerX: effectiveAngleProjection.cornerX,
                cornerY: effectiveAngleProjection.cornerY,
                angleMin: effectiveAngleProjection.angleMin,
                angleRange: effectiveAngleProjection.angleRange,
                radiusMin: effectiveAngleProjection.radiusMin,
                radiusRange: effectiveAngleProjection.radiusRange
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
                const dx = x - effectiveAngleProjection.cornerX
                const dy = y - effectiveAngleProjection.cornerY
                const theta = Math.atan2(dy, dx)
                flowCoord = this.getAngleArcProgress(theta, effectiveAngleProjection.angleMin, effectiveAngleProjection.angleRange)
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

    refineAngleFlowProjectionWithTubeJoins(angleProjection, mesh, tubeUuid, bounds)
    {
        if(!angleProjection || !mesh || !tubeUuid || !bounds)
        {
            return angleProjection
        }

        const localJoinCenters = this.getTubeJoinCentersInMeshLocal(mesh, tubeUuid)
        if(localJoinCenters.length < 2)
        {
            return angleProjection
        }

        let maxDistanceSq = -Infinity
        let joinA = null
        let joinB = null
        for(let i = 0; i < localJoinCenters.length; i++)
        {
            for(let j = i + 1; j < localJoinCenters.length; j++)
            {
                const dx = localJoinCenters[i].x - localJoinCenters[j].x
                const dy = localJoinCenters[i].y - localJoinCenters[j].y
                const dz = localJoinCenters[i].z - localJoinCenters[j].z
                const distanceSq = (dx * dx) + (dy * dy) + (dz * dz)
                if(distanceSq <= maxDistanceSq)
                {
                    continue
                }
                maxDistanceSq = distanceSq
                joinA = localJoinCenters[i]
                joinB = localJoinCenters[j]
            }
        }

        if(!joinA || !joinB)
        {
            return angleProjection
        }

        const corners = [
            { x: bounds.min.x, y: bounds.min.y },
            { x: bounds.min.x, y: bounds.max.y },
            { x: bounds.max.x, y: bounds.min.y },
            { x: bounds.max.x, y: bounds.max.y }
        ]

        let bestProjection = null
        let bestScore = Number.POSITIVE_INFINITY
        for(const corner of corners)
        {
            const angleAReal = Math.atan2(joinA.y - corner.y, joinA.x - corner.x)
            const angleBReal = Math.atan2(joinB.y - corner.y, joinB.x - corner.x)
            let delta = Math.atan2(Math.sin(angleBReal - angleAReal), Math.cos(angleBReal - angleAReal))
            let angleMin = angleAReal
            if(delta < 0)
            {
                angleMin = angleBReal
                delta = -delta
            }

            if(!(Number.isFinite(delta) && delta > FLOW_COORD_EPSILON))
            {
                continue
            }

            const radiusA = Math.sqrt(((joinA.x - corner.x) ** 2) + ((joinA.y - corner.y) ** 2))
            const radiusB = Math.sqrt(((joinB.x - corner.x) ** 2) + ((joinB.y - corner.y) ** 2))
            const radiusMismatch = Math.abs(radiusA - radiusB)
            const quarterTurnDelta = Math.abs(delta - (Math.PI * 0.5))
            const score = (radiusMismatch * 2.5) + quarterTurnDelta
            if(score >= bestScore)
            {
                continue
            }
            bestScore = score

            bestProjection = {
                ...angleProjection,
                cornerX: corner.x,
                cornerY: corner.y,
                angleMin,
                angleRange: delta,
                isJoinGuided: true
            }
        }

        return bestProjection ?? angleProjection
    }

    getTubeJoinCentersInMeshLocal(mesh, tubeUuid)
    {
        const joinTargets = this.joinTargetsByTubeUuid.get(tubeUuid) ?? []
        if(joinTargets.length === 0)
        {
            return []
        }

        const objectBounds = new THREE.Box3()
        const worldCenter = new THREE.Vector3()
        const localCenter = new THREE.Vector3()
        const centers = []

        mesh.updateMatrixWorld(true)

        for(const joinTarget of joinTargets)
        {
            if(!joinTarget)
            {
                continue
            }

            joinTarget.updateMatrixWorld(true)
            objectBounds.setFromObject(joinTarget)
            if(objectBounds.isEmpty())
            {
                continue
            }

            objectBounds.getCenter(worldCenter)
            localCenter.copy(worldCenter)
            mesh.worldToLocal(localCenter)
            centers.push({
                x: localCenter.x,
                y: localCenter.y,
                z: localCenter.z
            })
        }

        return centers
    }

    getAngleArcProgress(theta, angleMin, angleRange)
    {
        const safeRange = Math.max(angleRange, FLOW_COORD_EPSILON)
        const arcStart = angleMin
        const arcEnd = angleMin + safeRange
        let bestClampedAngle = arcStart
        let bestDistance = Number.POSITIVE_INFINITY

        for(const wrap of [-Math.PI * 2, 0, Math.PI * 2])
        {
            const wrappedTheta = theta + wrap
            const clampedTheta = THREE.MathUtils.clamp(wrappedTheta, arcStart, arcEnd)
            const distance = Math.abs(wrappedTheta - clampedTheta)
            if(distance < bestDistance)
            {
                bestDistance = distance
                bestClampedAngle = clampedTheta
            }
        }

        return (bestClampedAngle - arcStart) / safeRange
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
            return this.getAngleArcProgress(theta, flowProjection.angleMin, flowProjection.angleRange)
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
        this.rotationTargetUuidByName.clear()

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
            const moduleName = this.getModuleNameForTarget(target)
            this.rotationTargetUuidByName.set(this.normalizeObjectName(moduleName), target.uuid)
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
        this.windowSourceByTubeUuid.clear()

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
        this.applyBidirectionalBBranchDependencies()
        this.applyBidirectionalTBranchDependencies()
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

    applyBidirectionalBBranchDependencies()
    {
        const bBranchByIndex = new Map()
        for(const target of this.rotationTargets)
        {
            if(!target)
            {
                continue
            }

            const meta = this.targetMetaByUuid.get(target.uuid)
            if(!meta || meta.order !== BRANCH_BASE_ORDER || meta.branchType !== 'b')
            {
                continue
            }

            bBranchByIndex.set(meta.branchIndex, target.uuid)
        }

        const bIndexes = Array.from(bBranchByIndex.keys()).sort((a, b) => a - b)
        for(const branchIndex of bIndexes)
        {
            const tubeUuid = bBranchByIndex.get(branchIndex)
            if(!tubeUuid)
            {
                continue
            }

            const groups = this.connectionDependencyGroupsByUuid.get(tubeUuid) ?? []
            const prevUuid = bBranchByIndex.get(branchIndex - 1)
            const nextUuid = bBranchByIndex.get(branchIndex + 1)

            if(prevUuid && !groups.some((group) => group.length === 1 && group[0] === prevUuid))
            {
                groups.push([prevUuid])
            }

            if(nextUuid && !groups.some((group) => group.length === 1 && group[0] === nextUuid))
            {
                groups.push([nextUuid])
            }

            if(branchIndex === REQUIRED_B_BRANCH_INDEX_FOR_MERGE)
            {
                this.windowSourceByTubeUuid.set(tubeUuid, BRANCH_WINDOW_KEY)
            }

            this.connectionDependencyGroupsByUuid.set(tubeUuid, groups)
        }
    }

    applyBidirectionalTBranchDependencies()
    {
        const tBranchByIndex = new Map()
        for(const target of this.rotationTargets)
        {
            if(!target)
            {
                continue
            }

            const meta = this.targetMetaByUuid.get(target.uuid)
            if(!meta || meta.order !== BRANCH_BASE_ORDER || meta.branchType !== 't')
            {
                continue
            }

            tBranchByIndex.set(meta.branchIndex, target.uuid)
        }

        const tIndexes = Array.from(tBranchByIndex.keys()).sort((a, b) => a - b)
        for(const branchIndex of tIndexes)
        {
            const tubeUuid = tBranchByIndex.get(branchIndex)
            if(!tubeUuid)
            {
                continue
            }

            const groups = this.connectionDependencyGroupsByUuid.get(tubeUuid) ?? []
            const prevUuid = tBranchByIndex.get(branchIndex - 1)
            const nextUuid = tBranchByIndex.get(branchIndex + 1)

            if(prevUuid && !groups.some((group) => group.length === 1 && group[0] === prevUuid))
            {
                groups.push([prevUuid])
            }

            if(nextUuid && !groups.some((group) => group.length === 1 && group[0] === nextUuid))
            {
                groups.push([nextUuid])
            }

            if(branchIndex === REQUIRED_T_BRANCH_INDEX_FOR_MERGE)
            {
                this.windowSourceByTubeUuid.set(tubeUuid, BRANCH_WINDOW_KEY)
            }

            this.connectionDependencyGroupsByUuid.set(tubeUuid, groups)
        }
    }

    buildWindowTubeDependencies()
    {
        this.requiredWindowByTubeUuid.clear()

        const t1Uuid = this.findBranchUuid('t', 1)
        const b1Uuid = this.findBranchUuid('b', 1)
        const main14Uuid = this.getMainAtOrder(SPECIAL_GATE_ORDER_MERGE)
        const main21Uuid = this.getMainAtOrder(21)

        if(t1Uuid)
        {
            this.requiredWindowByTubeUuid.set(t1Uuid, PRIMARY_WINDOW_KEY)
        }

        if(b1Uuid)
        {
            this.requiredWindowByTubeUuid.set(b1Uuid, PRIMARY_WINDOW_KEY)
        }

        if(main14Uuid)
        {
            this.requiredWindowByTubeUuid.set(main14Uuid, BRANCH_WINDOW_KEY)
        }

        if(main21Uuid)
        {
            this.requiredWindowByTubeUuid.set(main21Uuid, AFTER_20_WINDOW_KEY)
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
            const shouldStartAligned = this.startAlignedTubeUuids.has(target.uuid)
            if(!isSource && !shouldStartAligned && randomQuarterTurns > 0)
            {
                this.rotateTubeAssembly(target, randomQuarterTurns * QUARTER_TURN)
            }

            const turnDirection = Math.random() >= 0.5 ? 1 : -1
            this.turnDirectionByMeshUuid.set(target.uuid, turnDirection)
        })
    }

    computeStartAlignedTubes()
    {
        this.startAlignedTubeUuids.clear()
        const mainTargets = this.getTargetsByMeta((meta) => meta.branchType === 'main')
        const fixedTargets = mainTargets.slice(0, 3)
        for(const target of fixedTargets)
        {
            if(target?.uuid)
            {
                this.startAlignedTubeUuids.add(target.uuid)
            }
        }
    }

    setEvents()
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

        this.inputs?.on?.('sceneinteractdown.scene1TubeWater', this.onMouseDown)
    }

    getTubeMeshAtCenter()
    {
        return this.centerRaycaster.intersectFirst(this.tubeMeshes, false)
    }

    update()
    {
        this.hoveredTubeMesh = this.getTubeMeshAtCenter()
        if(this.flowAnimationStarted)
        {
            this.updateFlowState(this.getDeltaSeconds())
        }
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
        if(this.flowAnimationStarted)
        {
            this.updateFlowState()
        }
        this.scene1Model?.refreshCollisionBoxes?.()
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
        this.updateBlueWindowFlowProgress(deltaSeconds)
        this.applyTubeFlowColors()
        this.applyBlueWindowColors()
    }

    resetFlowAnimation()
    {
        this.flowAnimationStarted = false
        this.flowProgressByTubeUuid.clear()
        this.activeFlowSourceByTubeUuid.clear()
        this.flowEntryByTubeUuid.clear()

        for(const target of this.rotationTargets)
        {
            if(!target?.uuid)
            {
                continue
            }
            this.flowProgressByTubeUuid.set(target.uuid, 0)
        }

        this.blueWindowFlowProgressByName.set('fenetre-blue', 0)
        this.blueWindowFlowProgressByName.set('fenetre-blue_1', 0)
        this.blueWindowFlowProgressByName.set('fenetre-blue_2', 0)

        this.updateFlowState(0)
    }

    startFlowAnimation()
    {
        if(this.flowAnimationStarted)
        {
            return
        }

        this.flowAnimationStarted = true
        this.updateFlowState(0)
    }

    updateBlueWindowFlowProgress(deltaSeconds)
    {
        const stepFill = Math.max(0, deltaSeconds) * Math.max(0, this.flow.fillSpeed ?? FLOW_FILL_SPEED_PER_SECOND)
        const gateReadyByName = new Map([
            ['fenetre-blue', this.isModuleFlowComplete('module-angle_13')],
            ['fenetre-blue_1', this.isModuleFlowComplete('module-straight_13_t3') || this.isModuleFlowComplete('module-angle_13_b9')],
            ['fenetre-blue_2', this.isModuleFlowComplete('module-angle_20')]
        ])

        for(const [windowName, isReady] of gateReadyByName)
        {
            const current = this.blueWindowFlowProgressByName.get(windowName) ?? 0
            if(isReady)
            {
                this.blueWindowFlowProgressByName.set(windowName, this.moveTowards(current, 1, stepFill))
                continue
            }

            // Requested UX: water in windows must disappear instantly when the
            // upstream flow is no longer valid.
            this.blueWindowFlowProgressByName.set(windowName, 0)
        }
    }

    applyBlueWindowColors()
    {
        if(this.blueWindowMeshes.length === 0)
        {
            return
        }

        const windowProgressByName = new Map([
            ['fenetre-blue', this.blueWindowFlowProgressByName.get('fenetre-blue') ?? 0],
            ['fenetre-blue_1', this.blueWindowFlowProgressByName.get('fenetre-blue_1') ?? 0],
            ['fenetre-blue_2', this.blueWindowFlowProgressByName.get('fenetre-blue_2') ?? 0]
        ])

        // Preferred path: explicit window names (fenêtre-blue, _1, _2).
        for(const [windowName, flowProgress] of windowProgressByName)
        {
            const meshes = this.blueWindowMeshesByName.get(windowName) ?? []
            for(const mesh of meshes)
            {
                this.applyBlueWindowMeshState(mesh, flowProgress)
            }
        }

        // Fallback for GLTF exports where all three windows share the same name.
        const fallbackMeshBuckets = [
            this.blueWindowMeshesByName.get('fenetre-blue') ?? [],
            this.blueWindowMeshesByName.get('fenetre-blue_1') ?? [],
            this.blueWindowMeshesByName.get('fenetre-blue_2') ?? []
        ]
        if(fallbackMeshBuckets.every((bucket) => bucket.length === 0) && this.blueWindowMeshes.length > 0)
        {
            const fallbackProgress = [
                windowProgressByName.get('fenetre-blue') ?? 0,
                windowProgressByName.get('fenetre-blue_1') ?? 0,
                windowProgressByName.get('fenetre-blue_2') ?? 0
            ]
            for(let index = 0; index < this.blueWindowMeshes.length; index++)
            {
                const progress = fallbackProgress[Math.min(index, fallbackProgress.length - 1)]
                this.applyBlueWindowMeshState(this.blueWindowMeshes[index], progress)
            }
        }
    }

    applyBlueWindowMeshState(mesh, flowProgress)
    {
        const colorLerp = THREE.MathUtils.clamp(flowProgress ?? 0, 0, 1)
        const shaderMaterials = this.blueWindowShaderMaterialsByMeshUuid.get(mesh.uuid) ?? []
        for(const shaderMaterial of shaderMaterials)
        {
            const uniforms = shaderMaterial?.userData?.windowFlowUniforms
            if(uniforms?.uWindowProgress)
            {
                uniforms.uWindowProgress.value = colorLerp
            }
        }

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for(const material of materials)
        {
            if(!material)
            {
                continue
            }

            if(material.userData?.windowFlowUniforms)
            {
                continue
            }

            if(material.color)
            {
                this.colorMix.lerpColors(this.disconnectedColor, this.windowConnectedColor, colorLerp)
                material.color.copy(this.colorMix)
            }

            if(material.emissive)
            {
                this.emissiveMix.lerpColors(this.emissiveOffColor, this.windowConnectedEmissiveColor, colorLerp)
                material.emissive.copy(this.emissiveMix)
                material.emissiveIntensity = 0.68 * colorLerp
            }

            material.needsUpdate = true
        }
    }

    getModuleFlowProgress(moduleName)
    {
        const normalizedName = this.normalizeObjectName(moduleName)
        const targetUuid = this.rotationTargetUuidByName.get(normalizedName)
        if(!targetUuid)
        {
            return 0
        }

        const flowProgress = this.flowProgressByTubeUuid.get(targetUuid) ?? 0
        return THREE.MathUtils.clamp(flowProgress, 0, 1)
    }

    getMaxModuleFlowProgress(moduleNames = [])
    {
        let maxProgress = 0
        for(const moduleName of moduleNames)
        {
            maxProgress = Math.max(maxProgress, this.getModuleFlowProgress(moduleName))
        }
        return maxProgress
    }

    isModuleFlowComplete(moduleName)
    {
        return this.getModuleFlowProgress(moduleName) >= (1 - FLOW_PROGRESS_EPSILON)
    }

    isBlueWindowFlowComplete(windowName)
    {
        const flowProgress = this.blueWindowFlowProgressByName.get(windowName) ?? 0
        return flowProgress >= (1 - FLOW_PROGRESS_EPSILON)
    }

    isWindowSourceReady(tubeUuid)
    {
        const windowName = this.windowSourceByTubeUuid.get(tubeUuid)
        if(!windowName)
        {
            return false
        }

        return this.isBlueWindowFlowComplete(windowName)
    }

    normalizeObjectName(value)
    {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
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
        this.activeFlowSourceByTubeUuid.clear()
        this.dualInflowByTubeUuid.clear()

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
            const fillSources = this.resolveTubeFillSources(tubeUuid)
            const dependencyGroups = this.connectionDependencyGroupsByUuid.get(tubeUuid) ?? []
            const requiresSource = dependencyGroups.length > 0
            if(requiresSource && fillSources.length === 0)
            {
                this.flowProgressByTubeUuid.set(tubeUuid, 0)
                continue
            }

            const primarySource = fillSources[0] ?? null
            if(primarySource)
            {
                this.activeFlowSourceByTubeUuid.set(tubeUuid, primarySource)
            }
            const isDualInflow = this.shouldUseDualInflow(tubeUuid, fillSources)
            this.dualInflowByTubeUuid.set(tubeUuid, isDualInflow)

            const fillStep = isDualInflow ? (stepFill * 2) : stepFill
            const nextProgress = this.moveTowards(currentProgress, 1, fillStep)
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

        return this.resolveTubeFillSources(tubeUuid).length > 0
    }

    resolveTubeFillSources(tubeUuid)
    {
        const requiredWindowName = this.requiredWindowByTubeUuid.get(tubeUuid)
        if(requiredWindowName && !this.isBlueWindowFlowComplete(requiredWindowName))
        {
            return []
        }

        const dependencySources = this.getReadyDependencySourceUuids(tubeUuid)
        if(dependencySources.length > 0)
        {
            return dependencySources.map((tubeUuid) => ({
                type: 'tube',
                tubeUuid
            }))
        }

        const windowName = this.windowSourceByTubeUuid.get(tubeUuid)
        if(windowName && this.isBlueWindowFlowComplete(windowName))
        {
            return [{
                type: 'window',
                windowName
            }]
        }

        return []
    }

    getReadyDependencySourceUuids(tubeUuid)
    {
        const dependencyGroups = this.connectionDependencyGroupsByUuid.get(tubeUuid) ?? []
        const dependencyUuids = new Set()

        for(const group of dependencyGroups)
        {
            if(group.length === 0)
            {
                continue
            }

            const isGroupReady = group.every((dependencyUuid) =>
            {
                const dependencyProgress = this.flowProgressByTubeUuid.get(dependencyUuid) ?? 0
                return dependencyProgress >= (1 - FLOW_PROGRESS_EPSILON)
            })
            if(!isGroupReady)
            {
                continue
            }

            dependencyUuids.add(group[0])
        }

        return Array.from(dependencyUuids).sort((tubeA, tubeB) =>
        {
            const progressA = this.flowProgressByTubeUuid.get(tubeA) ?? 0
            const progressB = this.flowProgressByTubeUuid.get(tubeB) ?? 0
            return progressB - progressA
        })
    }

    shouldUseDualInflow(tubeUuid, fillSources)
    {
        if(!this.isBranchTube(tubeUuid))
        {
            return false
        }

        const tubeSourceCount = fillSources.filter((source) => source?.type === 'tube').length
        return tubeSourceCount >= 2
    }

    isBranchTube(tubeUuid)
    {
        const meta = this.targetMetaByUuid.get(tubeUuid)
        return Boolean(meta && meta.order === BRANCH_BASE_ORDER && (meta.branchType === 'b' || meta.branchType === 't'))
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

        return this.isWindowSourceReady(tubeUuid)
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
        const activeSource = this.activeFlowSourceByTubeUuid.get(tubeUuid)
        if(activeSource?.type === 'tube' && activeSource.tubeUuid)
        {
            const inferredDirection = this.inferFlowDirectionFromNeighbor(tubeUuid, activeSource.tubeUuid)
            if(inferredDirection !== 0)
            {
                return inferredDirection
            }
        }

        if(activeSource?.type === 'window' && activeSource.windowName)
        {
            const inferredDirection = this.inferFlowDirectionFromWindow(tubeUuid, activeSource.windowName)
            if(inferredDirection !== 0)
            {
                return inferredDirection
            }
        }

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

    inferFlowDirectionFromWindow(tubeUuid, windowName)
    {
        const worldPosition = this.getWindowSourceWorldPosition(windowName)
        if(!worldPosition)
        {
            return 0
        }

        return this.inferFlowDirectionFromWorldPosition(tubeUuid, worldPosition)
    }

    getWindowSourceWorldPosition(windowName)
    {
        const meshes = this.blueWindowMeshesByName.get(windowName) ?? []
        let sourceMesh = meshes[0] ?? null

        if(!sourceMesh && this.blueWindowMeshes.length > 0)
        {
            const fallbackIndexByWindow = new Map([
                ['fenetre-blue', 0],
                ['fenetre-blue_1', 1],
                ['fenetre-blue_2', 2]
            ])
            const fallbackIndex = fallbackIndexByWindow.get(windowName)
            if(fallbackIndex !== undefined)
            {
                sourceMesh = this.blueWindowMeshes[Math.min(fallbackIndex, this.blueWindowMeshes.length - 1)] ?? null
            }
        }

        if(!sourceMesh)
        {
            return null
        }

        this.bounds.setFromObject(sourceMesh)
        if(this.bounds.isEmpty())
        {
            return sourceMesh.getWorldPosition(this.targetWorldPosition)
        }

        return this.bounds.getCenter(this.targetWorldPosition)
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
        return this.inferFlowDirectionFromWorldPosition(tubeUuid, this.targetWorldPosition)
    }

    inferFlowDirectionFromWorldPosition(tubeUuid, worldPosition)
    {
        const currentTubeMeshes = this.tubeMeshesByTargetUuid.get(tubeUuid) ?? []
        const currentTubeMesh = currentTubeMeshes[0]
        if(!currentTubeMesh)
        {
            return 0
        }

        currentTubeMesh.updateMatrixWorld(true)
        this.localPosition.copy(worldPosition)
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
                if(flowUniforms?.uFlowDualSided)
                {
                    flowUniforms.uFlowDualSided.value = this.dualInflowByTubeUuid.get(target.uuid) ? 1 : 0
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
                        this.colorMix.lerpColors(this.disconnectedColor, this.tubeConnectedColor, flowProgress)
                        material.color.copy(this.colorMix)
                    }

                    if(material.emissive)
                    {
                        this.emissiveMix.lerpColors(this.emissiveOffColor, this.tubeConnectedEmissiveColor, flowProgress)
                        material.emissive.copy(this.emissiveMix)
                        material.emissiveIntensity = 0.68 * flowProgress
                    }

                    material.needsUpdate = true
                }
            }
        }
    }

    setTubeFlowColor(colorValue)
    {
        if(colorValue === null || colorValue === undefined)
        {
            this.tubeConnectedColor.set(CONNECTED_COLOR)
            this.tubeConnectedEmissiveColor.set(CONNECTED_EMISSIVE)
            this.windowConnectedColor.set(CONNECTED_COLOR)
            this.windowConnectedEmissiveColor.set(CONNECTED_EMISSIVE)
        }
        else
        {
            this.tmpColor.set(colorValue)
            this.tubeConnectedColor.copy(this.tmpColor)
            this.tubeConnectedEmissiveColor.copy(this.tmpColor).lerp(this.emissiveOffColor, 0.44)
            this.windowConnectedColor.copy(this.tmpColor)
            this.windowConnectedEmissiveColor.copy(this.tmpColor).lerp(this.emissiveOffColor, 0.44)
        }

        for(const shaderMaterials of this.flowShaderMaterialsByTubeUuid.values())
        {
            for(const shaderMaterial of shaderMaterials)
            {
                const flowUniforms = shaderMaterial?.userData?.flowUniforms
                if(!flowUniforms)
                {
                    continue
                }

                flowUniforms.uFlowConnectedColor?.value?.copy?.(this.tubeConnectedColor)
                flowUniforms.uFlowConnectedEmissiveColor?.value?.copy?.(this.tubeConnectedEmissiveColor)
            }
        }

        for(const shaderMaterials of this.blueWindowShaderMaterialsByMeshUuid.values())
        {
            for(const shaderMaterial of shaderMaterials)
            {
                const windowFlowUniforms = shaderMaterial?.userData?.windowFlowUniforms
                if(!windowFlowUniforms)
                {
                    continue
                }

                windowFlowUniforms.uWindowConnectedColor?.value?.copy?.(this.windowConnectedColor)
                windowFlowUniforms.uWindowConnectedEmissiveColor?.value?.copy?.(this.windowConnectedEmissiveColor)
            }
        }

        this.applyTubeFlowColors()
        this.applyBlueWindowColors()
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
        this.inputs?.off?.('sceneinteractdown.scene1TubeWater')
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
        this.activeFlowSourceByTubeUuid.clear()
        this.dualInflowByTubeUuid.clear()
        this.rotationTargetUuidByName.clear()
        this.blueWindowMeshes = []
        this.blueWindowMeshesByName.clear()
        this.blueWindowShaderMaterialsByMeshUuid.clear()
        this.blueWindowFlowProgressByName.clear()
        this.requiredWindowByTubeUuid.clear()
        this.windowSourceByTubeUuid.clear()
    }
}
