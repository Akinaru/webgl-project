import * as THREE from 'three'
import * as SceneRecuperationTubeWaterControllerConstants from '../TubeWaterController.constants.js'

/**
 * Recalcule le chemin de flux, la progression et les couleurs des tuyaux/fenêtres.
 */
export function updateFlowState(deltaSeconds = this.getDeltaSeconds())
{
    const { flowPathUuids, flowEntryByTubeUuid } = this.computeSequentialFlowPathUuids()
    this.flowEntryByTubeUuid = flowEntryByTubeUuid
    this.updateTubeFlowProgress(flowPathUuids, deltaSeconds)
    this.updateBlueWindowFlowProgress(deltaSeconds)
    this.applyTubeFlowColors()
    this.applyBlueWindowColors()
}


/**
 * Réinitialise totalement les progressions de flux du puzzle.
 */
export function resetFlowAnimation()
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


/**
 * Démarre l animation de flux si elle n est pas déjà active.
 */
export function startFlowAnimation()
{
    if(this.flowAnimationStarted)
    {
        return
    }

    this.flowAnimationStarted = true
    this.updateFlowState(0)
}


/**
 * Met à jour la progression de remplissage des fenêtres bleues selon les gates.
 */
export function updateBlueWindowFlowProgress(deltaSeconds)
{
    const stepFill = Math.max(0, deltaSeconds) * Math.max(0, this.flow.fillSpeed ?? SceneRecuperationTubeWaterControllerConstants.FLOW_FILL_SPEED_PER_SECOND)
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


/**
 * Retourne la progression de flux d un module nommé.
 */
export function getModuleFlowProgress(moduleName)
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


/**
 * Retourne la progression max parmi plusieurs modules.
 */
export function getMaxModuleFlowProgress(moduleNames = [])
{
    let maxProgress = 0
    for(const moduleName of moduleNames)
    {
        maxProgress = Math.max(maxProgress, this.getModuleFlowProgress(moduleName))
    }
    return maxProgress
}


/**
 * Indique si un module est rempli à 100% (avec epsilon).
 */
export function isModuleFlowComplete(moduleName)
{
    return this.getModuleFlowProgress(moduleName) >= (1 - SceneRecuperationTubeWaterControllerConstants.FLOW_PROGRESS_EPSILON)
}


/**
 * Indique si une fenêtre bleue est considérée complètement remplie.
 */
export function isBlueWindowFlowComplete(windowName)
{
    const flowProgress = this.blueWindowFlowProgressByName.get(windowName) ?? 0
    return flowProgress >= (1 - SceneRecuperationTubeWaterControllerConstants.FLOW_PROGRESS_EPSILON)
}


/**
 * Indique si la source fenêtre requise pour un tube est prête.
 */
export function isWindowSourceReady(tubeUuid)
{
    const windowName = this.windowSourceByTubeUuid.get(tubeUuid)
    if(!windowName)
    {
        return false
    }

    return this.isBlueWindowFlowComplete(windowName)
}


/**
 * Construit le chemin de flux valide en respectant ordre, rotation et dépendances.
 */
export function computeSequentialFlowPathUuids()
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


/**
 * Retourne la dépendance d entrée effectivement satisfaite pour un tube.
 */
export function getSatisfiedEntryDependencyUuid(tubeUuid, connectedTubeIds)
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


/**
 * Fait progresser le remplissage des tubes validés et remet à zéro les autres.
 */
export function updateTubeFlowProgress(flowPathUuids, deltaSeconds)
{
    const flowPathSet = new Set(flowPathUuids)
    const stepFill = Math.max(0, deltaSeconds) * Math.max(0, this.flow.fillSpeed ?? SceneRecuperationTubeWaterControllerConstants.FLOW_FILL_SPEED_PER_SECOND)
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


/**
 * Indique si un tube peut être rempli immédiatement.
 */
export function canTubeFillNow(tubeUuid)
{
    const dependencyGroups = this.connectionDependencyGroupsByUuid.get(tubeUuid) ?? []
    if(dependencyGroups.length === 0)
    {
        return true
    }

    return this.resolveTubeFillSources(tubeUuid).length > 0
}


/**
 * Résout les sources actives de remplissage (tubes voisins ou fenêtre).
 */
export function resolveTubeFillSources(tubeUuid)
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


/**
 * Retourne les dépendances prêtes à alimenter un tube.
 */
export function getReadyDependencySourceUuids(tubeUuid)
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
            return dependencyProgress >= (1 - SceneRecuperationTubeWaterControllerConstants.FLOW_PROGRESS_EPSILON)
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


/**
 * Indique si un tube de branche doit se remplir en double inflow.
 */
export function shouldUseDualInflow(tubeUuid, fillSources)
{
    if(!this.isBranchTube(tubeUuid))
    {
        return false
    }

    const tubeSourceCount = fillSources.filter((source) => source?.type === 'tube').length
    return tubeSourceCount >= 2
}


/**
 * Indique si un tube appartient à une branche spéciale du puzzle.
 */
export function isBranchTube(tubeUuid)
{
    const meta = this.targetMetaByUuid.get(tubeUuid)
    return Boolean(meta && meta.order === SceneRecuperationTubeWaterControllerConstants.BRANCH_BASE_ORDER && (meta.branchType === 'b' || meta.branchType === 't'))
}


/**
 * Avance progressivement une valeur vers une cible avec pas maximum.
 */
export function moveTowards(value, target, maxStep)
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


/**
 * Vérifie si au moins un groupe de dépendances est satisfait pour un tube.
 */
export function areDependencyGroupsSatisfied(tubeUuid, connectedTubeIds)
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


/**
 * Vérifie si un tube est revenu à une orientation compatible avec le flux.
 */
export function isTubeAtInitialRotation(tubeUuid)
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

    const currentRotation = this.normalizeAngle(target.rotation[SceneRecuperationTubeWaterControllerConstants.ROTATION_AXIS] || 0)
    const delta = Math.abs(
        THREE.MathUtils.euclideanModulo((currentRotation - initialRotation) + Math.PI, Math.PI * 2) - Math.PI
    )
    return delta <= SceneRecuperationTubeWaterControllerConstants.ROTATION_EPSILON
}


/**
 * Indique si le module correspond à un tube droit.
 */
export function isStraightTube(tubeUuid)
{
    const target = this.rotationTargets.find((item) => item?.uuid === tubeUuid)
    if(!target)
    {
        return false
    }

    const moduleName = this.getModuleNameForTarget(target)
    return /^module-straight/i.test(moduleName)
}


/**
 * Indique si le module correspond à un tube coudé.
 */
export function isAngleTube(tubeUuid)
{
    const target = this.rotationTargets.find((item) => item?.uuid === tubeUuid)
    if(!target)
    {
        return false
    }

    const moduleName = this.getModuleNameForTarget(target)
    return /^module-angle/i.test(moduleName)
}


/**
 * Indique si le sens d écoulement d un tube droit doit être inversé.
 */
export function isStraightTubeFlowReversed(tubeUuid)
{
    if(!this.isStraightTube(tubeUuid))
    {
        return false
    }

    const quarterTurnOffset = this.quarterTurnsFromInitialByTubeUuid.get(tubeUuid) ?? 0
    return this.normalizeQuarterTurnOffset(quarterTurnOffset) === 2
}


/**
 * Détermine la direction d écoulement courante d un tube.
 */
export function getTubeFlowDirection(tubeUuid)
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


/**
 * Déduit la direction du flux à partir de la position d une fenêtre source.
 */
export function inferFlowDirectionFromWindow(tubeUuid, windowName)
{
    const worldPosition = this.getWindowSourceWorldPosition(windowName)
    if(!worldPosition)
    {
        return 0
    }

    return this.inferFlowDirectionFromWorldPosition(tubeUuid, worldPosition)
}


/**
 * Calcule la position monde utilisée comme source pour une fenêtre.
 */
export function getWindowSourceWorldPosition(windowName)
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


/**
 * Déduit la direction du flux à partir d un tube voisin.
 */
export function inferFlowDirectionFromNeighbor(tubeUuid, neighborTubeUuid)
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


/**
 * Déduit la direction du flux à partir d une position monde projetée localement.
 */
export function inferFlowDirectionFromWorldPosition(tubeUuid, worldPosition)
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


/**
 * Retourne le tube source principal du puzzle.
 */
export function getSourceTubeTarget()
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


