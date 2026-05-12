import * as THREE from 'three'
import * as SceneRecuperationTubeWaterControllerConstants from '../TubeWaterController.constants.js'

export function collectJoinTargets()
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


export function buildTubeOrder()
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


export function getTargetMeta(target, fallbackIndex)
{
    const name = this.getModuleNameForTarget(target)
    const match = name.match(SceneRecuperationTubeWaterControllerConstants.MODULE_ROTATION_TARGET_PATTERN)
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


export function getModuleNameForTarget(target)
{
    let current = target
    let moduleCandidate = null
    while(current)
    {
        const name = String(current.name || '')
        if(SceneRecuperationTubeWaterControllerConstants.MODULE_ROTATION_TARGET_PATTERN.test(name))
        {
            // Keep climbing: exported GLTF nodes can contain nested helper
            // modules (e.g. module-angle_04) inside the real puzzle module.
            moduleCandidate = name
        }
        current = current.parent
    }

    return moduleCandidate ?? String(target?.name || '')
}


export function getBranchSortWeight(branchType)
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


export function buildConnectionDependencies()
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


export function getTargetsByMeta(predicate)
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


export function buildBranchDependencies(branchType)
{
    const branchTargets = this.getTargetsByMeta((meta) =>
        meta.branchType === branchType && meta.order === SceneRecuperationTubeWaterControllerConstants.BRANCH_BASE_ORDER
    )
    if(branchTargets.length === 0)
    {
        return
    }

    const entryDependency = this.getMainAtOrder(SceneRecuperationTubeWaterControllerConstants.BRANCH_BASE_ORDER) ?? this.getLastMainBeforeOrder(SceneRecuperationTubeWaterControllerConstants.BRANCH_BASE_ORDER)
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


export function getLastMainBeforeOrder(order)
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


export function getMainAtOrder(order)
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


export function applySpecialGateDependencies()
{
    const mergeTargets = this.getTargetsByMeta((meta) =>
        meta.branchType === 'main' && meta.order === SceneRecuperationTubeWaterControllerConstants.SPECIAL_GATE_ORDER_MERGE
    )
    const afterMergeTargets = this.getTargetsByMeta((meta) =>
        meta.branchType === 'main' && meta.order === SceneRecuperationTubeWaterControllerConstants.SPECIAL_GATE_ORDER_AFTER_MERGE
    )
    if(mergeTargets.length === 0 && afterMergeTargets.length === 0)
    {
        return
    }

    const b9Uuid = this.findBranchUuid('b', SceneRecuperationTubeWaterControllerConstants.REQUIRED_B_BRANCH_INDEX_FOR_MERGE)
    const t3Uuid = this.findBranchUuid('t', SceneRecuperationTubeWaterControllerConstants.REQUIRED_T_BRANCH_INDEX_FOR_MERGE)

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


export function applyBidirectionalBBranchDependencies()
{
    const bBranchByIndex = new Map()
    for(const target of this.rotationTargets)
    {
        if(!target)
        {
            continue
        }

        const meta = this.targetMetaByUuid.get(target.uuid)
        if(!meta || meta.order !== SceneRecuperationTubeWaterControllerConstants.BRANCH_BASE_ORDER || meta.branchType !== 'b')
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

        if(branchIndex === SceneRecuperationTubeWaterControllerConstants.REQUIRED_B_BRANCH_INDEX_FOR_MERGE)
        {
            this.windowSourceByTubeUuid.set(tubeUuid, SceneRecuperationTubeWaterControllerConstants.BRANCH_WINDOW_KEY)
        }

        this.connectionDependencyGroupsByUuid.set(tubeUuid, groups)
    }
}


export function applyBidirectionalTBranchDependencies()
{
    const tBranchByIndex = new Map()
    for(const target of this.rotationTargets)
    {
        if(!target)
        {
            continue
        }

        const meta = this.targetMetaByUuid.get(target.uuid)
        if(!meta || meta.order !== SceneRecuperationTubeWaterControllerConstants.BRANCH_BASE_ORDER || meta.branchType !== 't')
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

        if(branchIndex === SceneRecuperationTubeWaterControllerConstants.REQUIRED_T_BRANCH_INDEX_FOR_MERGE)
        {
            this.windowSourceByTubeUuid.set(tubeUuid, SceneRecuperationTubeWaterControllerConstants.BRANCH_WINDOW_KEY)
        }

        this.connectionDependencyGroupsByUuid.set(tubeUuid, groups)
    }
}


export function buildWindowTubeDependencies()
{
    this.requiredWindowByTubeUuid.clear()

    const t1Uuid = this.findBranchUuid('t', 1)
    const b1Uuid = this.findBranchUuid('b', 1)
    const main14Uuid = this.getMainAtOrder(SceneRecuperationTubeWaterControllerConstants.SPECIAL_GATE_ORDER_MERGE)
    const main21Uuid = this.getMainAtOrder(21)

    if(t1Uuid)
    {
        this.requiredWindowByTubeUuid.set(t1Uuid, SceneRecuperationTubeWaterControllerConstants.PRIMARY_WINDOW_KEY)
    }

    if(b1Uuid)
    {
        this.requiredWindowByTubeUuid.set(b1Uuid, SceneRecuperationTubeWaterControllerConstants.PRIMARY_WINDOW_KEY)
    }

    if(main14Uuid)
    {
        this.requiredWindowByTubeUuid.set(main14Uuid, SceneRecuperationTubeWaterControllerConstants.BRANCH_WINDOW_KEY)
    }

    if(main21Uuid)
    {
        this.requiredWindowByTubeUuid.set(main21Uuid, SceneRecuperationTubeWaterControllerConstants.AFTER_20_WINDOW_KEY)
    }
}


export function findBranchUuid(branchType, branchIndex)
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

        if(meta.order === SceneRecuperationTubeWaterControllerConstants.BRANCH_BASE_ORDER && meta.branchType === branchType && meta.branchIndex === branchIndex)
        {
            return target.uuid
        }
    }

    return null
}


export function findJoinTargetsForTube(tubeTarget)
{
    const name = String(tubeTarget?.name || '').toLowerCase()
    const isModuleTarget = SceneRecuperationTubeWaterControllerConstants.MODULE_ROTATION_TARGET_PATTERN.test(name)
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
        if(!name.includes(SceneRecuperationTubeWaterControllerConstants.TUBE_JOIN_NAME_TOKEN))
        {
            return
        }

        visited.add(child.uuid)
        joinTargets.push(child)
    })

    return joinTargets
}


export function randomizeInitialRotations()
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
            this.rotateTubeAssembly(target, randomQuarterTurns * SceneRecuperationTubeWaterControllerConstants.QUARTER_TURN)
        }

        const turnDirection = Math.random() >= 0.5 ? 1 : -1
        this.turnDirectionByMeshUuid.set(target.uuid, turnDirection)
    })
}


export function computeStartAlignedTubes()
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


