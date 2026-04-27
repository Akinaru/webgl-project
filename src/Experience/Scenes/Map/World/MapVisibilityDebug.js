import * as THREE from 'three'
import Experience from '../../../Experience.js'

export default class MapVisibilityDebug
{
    constructor({ mapModel = null } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.mapModel = mapModel
        this.entriesByUuid = new Map()
        this.branchStatsByUuid = new Map()
        this.summaryBindings = []

        this.summary = {
            rootEntries: 0,
            totalNodes: 0,
            totalMeshes: 0,
            totalTriangles: '0',
            visibleMeshes: 0,
            visibleTriangles: '0'
        }

        this.setDebug()
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled)
        {
            return
        }

        this.rootObjects = this.mapModel?.getDebugVisibilityRoots?.() ?? []
        this.summary.rootEntries = this.rootObjects.length

        let totalNodes = 0
        let totalMeshes = 0
        let totalTriangles = 0

        for(const rootObject of this.rootObjects)
        {
            const stats = this.getBranchStats(rootObject)
            totalNodes += stats.nodeCount
            totalMeshes += stats.meshCount
            totalTriangles += stats.triangleCount
        }

        this.summary.totalNodes = totalNodes
        this.summary.totalMeshes = totalMeshes
        this.summary.totalTriangles = this.formatCount(totalTriangles)

        this.debugFolder = this.debug.addFolder('🗺 Map Visibility', { expanded: false })
        this.summaryFolder = this.debug.addFolder('Summary', {
            parent: this.debugFolder,
            expanded: false
        })

        this.setSummaryBindings()
        this.setActions()

        for(const rootObject of this.rootObjects)
        {
            this.createObjectEntry({
                object: rootObject,
                parentFolder: this.debugFolder
            })
        }

        this.refreshSummary()
    }

    setSummaryBindings()
    {
        this.summaryBindings.push(
            this.debug.addManualBinding(this.summaryFolder, this.summary, 'rootEntries', {
                label: 'roots',
                readonly: true
            }),
            this.debug.addManualBinding(this.summaryFolder, this.summary, 'totalNodes', {
                label: 'nodes',
                readonly: true
            }),
            this.debug.addManualBinding(this.summaryFolder, this.summary, 'totalMeshes', {
                label: 'meshes',
                readonly: true
            }),
            this.debug.addManualBinding(this.summaryFolder, this.summary, 'totalTriangles', {
                label: 'triangles',
                readonly: true
            }),
            this.debug.addManualBinding(this.summaryFolder, this.summary, 'visibleMeshes', {
                label: 'visibleMeshes',
                readonly: true
            }),
            this.debug.addManualBinding(this.summaryFolder, this.summary, 'visibleTriangles', {
                label: 'visibleTriangles',
                readonly: true
            })
        )
    }

    setActions()
    {
        this.debug.addButtons(this.debugFolder, {
            label: 'actions',
            columns: 3,
            buttons: [
                {
                    label: 'Show All',
                    onClick: () =>
                    {
                        this.setAllVisible(true)
                    }
                },
                {
                    label: 'Hide All',
                    onClick: () =>
                    {
                        this.setAllVisible(false)
                    }
                },
                {
                    label: 'Sync',
                    onClick: () =>
                    {
                        this.syncStatesFromScene()
                    }
                }
            ]
        })
    }

    createObjectEntry({
        object,
        parentFolder
    })
    {
        if(!object || !parentFolder)
        {
            return null
        }

        const childObjects = object.children.filter((child) => Boolean(child))
        const state = { visible: Boolean(object.visible) }
        const entry = {
            object,
            state,
            childObjects,
            childEntriesBuilt: false,
            folder: null,
            visibilityBinding: null
        }

        this.entriesByUuid.set(object.uuid, entry)

        if(childObjects.length === 0)
        {
            entry.visibilityBinding = this.debug.addBinding(parentFolder, state, 'visible', {
                label: this.formatObjectLabel(object)
            })
            entry.visibilityBinding?.on?.('change', (event) =>
            {
                this.setObjectVisibility(object, Boolean(event.value))
            })
            return entry
        }

        entry.folder = this.debug.addFolder(this.formatObjectLabel(object), {
            parent: parentFolder,
            expanded: false
        })

        const branchStats = this.getBranchStats(object)
        const statsState = {
            nodes: branchStats.nodeCount,
            meshes: branchStats.meshCount,
            triangles: this.formatCount(branchStats.triangleCount)
        }

        entry.visibilityBinding = this.debug.addBinding(entry.folder, state, 'visible', {
            label: 'visible'
        })
        entry.visibilityBinding?.on?.('change', (event) =>
        {
            this.setBranchVisibility(object, Boolean(event.value))
        })

        this.debug.addManualBinding(entry.folder, statsState, 'nodes', {
            label: 'nodes',
            readonly: true
        })
        this.debug.addManualBinding(entry.folder, statsState, 'meshes', {
            label: 'meshes',
            readonly: true
        })
        this.debug.addManualBinding(entry.folder, statsState, 'triangles', {
            label: 'triangles',
            readonly: true
        })

        entry.folder.on?.('fold', (event) =>
        {
            if(!event.expanded || entry.childEntriesBuilt)
            {
                return
            }

            for(const childObject of childObjects)
            {
                this.createObjectEntry({
                    object: childObject,
                    parentFolder: entry.folder
                })
            }

            entry.childEntriesBuilt = true
        })

        return entry
    }

    getBranchStats(object)
    {
        if(!object)
        {
            return {
                nodeCount: 0,
                meshCount: 0,
                triangleCount: 0
            }
        }

        const cachedStats = this.branchStatsByUuid.get(object.uuid)
        if(cachedStats)
        {
            return cachedStats
        }

        const stats = {
            nodeCount: 1,
            meshCount: object instanceof THREE.Mesh ? 1 : 0,
            triangleCount: object instanceof THREE.Mesh ? this.getMeshTriangleCount(object) : 0
        }

        for(const child of object.children)
        {
            const childStats = this.getBranchStats(child)
            stats.nodeCount += childStats.nodeCount
            stats.meshCount += childStats.meshCount
            stats.triangleCount += childStats.triangleCount
        }

        this.branchStatsByUuid.set(object.uuid, stats)
        return stats
    }

    getMeshTriangleCount(mesh)
    {
        const geometry = mesh?.geometry
        if(!geometry)
        {
            return 0
        }

        if(geometry.index)
        {
            return Math.max(0, Math.floor(geometry.index.count / 3))
        }

        const positionAttribute = geometry.attributes?.position
        if(!positionAttribute)
        {
            return 0
        }

        return Math.max(0, Math.floor(positionAttribute.count / 3))
    }

    setObjectVisibility(object, visible)
    {
        if(!object)
        {
            return
        }

        object.visible = visible
        this.syncEntryState(object)
        this.refreshSummary()
    }

    setBranchVisibility(object, visible)
    {
        if(!object)
        {
            return
        }

        object.traverse((child) =>
        {
            child.visible = visible
            this.syncEntryState(child)
        })

        this.refreshSummary()
    }

    setAllVisible(visible)
    {
        for(const rootObject of this.rootObjects)
        {
            rootObject.traverse((child) =>
            {
                child.visible = visible
                this.syncEntryState(child)
            })
        }

        this.refreshSummary()
    }

    syncStatesFromScene()
    {
        for(const entry of this.entriesByUuid.values())
        {
            entry.state.visible = Boolean(entry.object?.visible)
            entry.visibilityBinding?.refresh?.()
        }

        this.refreshSummary()
    }

    syncEntryState(object)
    {
        const entry = this.entriesByUuid.get(object.uuid)
        if(!entry)
        {
            return
        }

        entry.state.visible = Boolean(object.visible)
        entry.visibilityBinding?.refresh?.()
    }

    refreshSummary()
    {
        let visibleMeshes = 0
        let visibleTriangles = 0

        for(const rootObject of this.rootObjects)
        {
            rootObject.traverseVisible((object) =>
            {
                if(!(object instanceof THREE.Mesh))
                {
                    return
                }

                visibleMeshes += 1
                visibleTriangles += this.getMeshTriangleCount(object)
            })
        }

        this.summary.visibleMeshes = visibleMeshes
        this.summary.visibleTriangles = this.formatCount(visibleTriangles)

        for(const binding of this.summaryBindings)
        {
            binding?.refresh?.()
        }
    }

    formatObjectLabel(object)
    {
        const rawName = String(object?.name || '').trim()
        return rawName || object?.type || 'Object3D'
    }

    formatCount(value)
    {
        const numericValue = Number.isFinite(value) ? value : 0
        if(numericValue >= 1000000)
        {
            return `${(numericValue / 1000000).toFixed(2)}M`
        }

        if(numericValue >= 1000)
        {
            return `${(numericValue / 1000).toFixed(1)}k`
        }

        return `${Math.round(numericValue)}`
    }

    destroy()
    {
        this.summaryBindings.length = 0
        this.entriesByUuid.clear()
        this.branchStatsByUuid.clear()
        this.summaryFolder = null
        this.debugFolder?.dispose?.()
        this.debugFolder = null
    }
}
