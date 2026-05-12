import * as THREE from 'three'
import Experience from '../../../Experience.js'
import CenterScreenRaycaster from '../../../Utils/CenterScreenRaycaster.js'
import { setupSceneRecuperationTubeWaterControllerDebug } from './TubeWaterController.debug.js'
import * as SceneRecuperationTubeWaterControllerConstants from './TubeWaterController.constants.js'

import * as setupMethods from './TubeWaterController/setup.js'
import * as topologyMethods from './TubeWaterController/topology.js'
import * as interactionMethods from './TubeWaterController/interaction.js'
import * as flowMethods from './TubeWaterController/flow.js'
import * as renderingMethods from './TubeWaterController/rendering.js'
import * as mathMethods from './TubeWaterController/math.js'
import * as lifecycleMethods from './TubeWaterController/lifecycle.js'

export default class SceneRecuperationTubeWaterController
{
constructor({ recuperationModel, debugParentFolder = null, sharedWaterColors = null } = {})
{
    this.experience = new Experience()
    this.inputs = this.experience.inputs
    this.debug = this.experience.debug
    this.debugParentFolder = debugParentFolder
    this.sharedWaterColors = sharedWaterColors
    this.recuperationModel = recuperationModel
    this.tubeMeshes = this.recuperationModel?.getTubeWaterMeshes?.() ?? []
    this.rotationTargets = this.recuperationModel?.getTubeWaterRotationTargets?.() ?? []
    this.flow = {
        fillSpeed: SceneRecuperationTubeWaterControllerConstants.FLOW_FILL_SPEED_PER_SECOND
    }
    this.rotation = {
        speed: SceneRecuperationTubeWaterControllerConstants.ROTATION_SPEED_PER_SECOND
    }
    this.waterShader = {
        animateTubeOpacity: false,
        animateWindowOpacity: false,
        foamSpeedMultiplier: 1,
        foamRotation: 0,
        foamScalePrimary: 2.2,
        foamScaleSecondary: 4.4,
        bodyScale: 1.35,
        repeatNoiseScale: 3.2,
        repeatNoiseStrength: 0.22,
        foamThresholdMin: 0.7,
        foamThresholdMax: 0.9,
        foamMix: 0.35,
        foamOpacity: 0.34,
        frontOpacity: 0.32,
        frontWidthSingle: 0.14,
        frontWidthDual: 0.16,
        waterShadowStrength: 0.48,
        waterMidLow: 0.82,
        waterMidHigh: 1.08,
        waterHighlightMix: 0.36,
        bodyBlendBase: 0.62,
        bodyBlendGain: 0.18,
        emissiveBase: 0.55,
        emissiveFoam: 0.22,
        emissiveFront: 0.45,
        foamColor: '#FDFDF7'
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
    this.activeTubeRotationsByUuid = new Map()
    this.playerRotatedTubeUuids = new Set()
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
    this.rotationPivotScratch = new THREE.Vector3()
    this.rotationAxisScratch = new THREE.Vector3()
    this.endpointA = new THREE.Vector3()
    this.endpointB = new THREE.Vector3()
    this.endpointDirA = new THREE.Vector3()
    this.endpointDirB = new THREE.Vector3()
    this.disconnectedColor = new THREE.Color(SceneRecuperationTubeWaterControllerConstants.DISCONNECTED_COLOR)
    this.tubeConnectedColor = new THREE.Color(SceneRecuperationTubeWaterControllerConstants.CONNECTED_COLOR)
    this.tubeConnectedEmissiveColor = new THREE.Color(SceneRecuperationTubeWaterControllerConstants.CONNECTED_EMISSIVE)
    this.windowConnectedColor = new THREE.Color(SceneRecuperationTubeWaterControllerConstants.CONNECTED_COLOR)
    this.windowConnectedEmissiveColor = new THREE.Color(SceneRecuperationTubeWaterControllerConstants.CONNECTED_EMISSIVE)
    this.emissiveOffColor = new THREE.Color('#000000')
    this.colorMix = new THREE.Color()
    this.emissiveMix = new THREE.Color()
    this.tmpColor = new THREE.Color()
    this.foamColor = new THREE.Color(this.waterShader.foamColor)
    this.patternOffset = new THREE.Vector2()
    this.patternWorldCenter = new THREE.Vector3()

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
    this.recuperationModel?.refreshCollisionBoxes?.()
    this.applySharedWaterColors()
    this.setDebug()
    this.setEvents()
}

}

Object.assign(
    SceneRecuperationTubeWaterController.prototype,
    setupMethods,
    topologyMethods,
    interactionMethods,
    flowMethods,
    renderingMethods,
    mathMethods,
    lifecycleMethods
)
