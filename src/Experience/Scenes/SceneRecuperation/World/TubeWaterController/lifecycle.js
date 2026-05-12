import * as THREE from 'three'
import * as SceneRecuperationTubeWaterControllerConstants from '../TubeWaterController.constants.js'

export function destroy()
{
    this.inputs?.off?.('sceneinteractdown.recuperationTubeWater')
    if(this.debugOwnsFolder)
    {
        this.debugFolder?.dispose?.()
    }
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
    this.activeTubeRotationsByUuid.clear()
    this.playerRotatedTubeUuids.clear()
    this.blueWindowMeshes = []
    this.blueWindowMeshesByName.clear()
    this.blueWindowShaderMaterialsByMeshUuid.clear()
    this.blueWindowFlowProgressByName.clear()
    this.requiredWindowByTubeUuid.clear()
    this.windowSourceByTubeUuid.clear()
}

