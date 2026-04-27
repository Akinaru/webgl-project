import * as THREE from 'three'

const EPSILON = 1e-6

function toVector3(point)
{
    if(point instanceof THREE.Vector3)
    {
        return point.clone()
    }

    if(Array.isArray(point))
    {
        return new THREE.Vector3(
            Number(point[0] ?? 0),
            Number(point[1] ?? 0),
            Number(point[2] ?? 0)
        )
    }

    if(point && typeof point === 'object')
    {
        return new THREE.Vector3(
            Number(point.x ?? 0),
            Number(point.y ?? 0),
            Number(point.z ?? 0)
        )
    }

    return null
}

function createGraphFromLegacyLines(lines = [])
{
    const nodes = []
    const edges = []
    const nodeByKey = new Map()

    const getOrCreateNode = (point) =>
    {
        const key = `${point.x.toFixed(3)}:${point.y.toFixed(3)}:${point.z.toFixed(3)}`
        if(nodeByKey.has(key))
        {
            return nodeByKey.get(key)
        }

        const id = `n${nodes.length + 1}`
        const node = { id, x: point.x, y: point.y, z: point.z }
        nodes.push(node)
        nodeByKey.set(key, id)
        return id
    }

    for(const line of Array.isArray(lines) ? lines : [])
    {
        if(!Array.isArray(line) || line.length < 2)
        {
            continue
        }

        for(let index = 0; index < line.length - 1; index++)
        {
            const start = toVector3(line[index])
            const end = toVector3(line[index + 1])
            if(!(start instanceof THREE.Vector3) || !(end instanceof THREE.Vector3))
            {
                continue
            }

            const startId = getOrCreateNode(start)
            const endId = getOrCreateNode(end)
            edges.push({ a: startId, b: endId })
        }
    }

    return { nodes, edges }
}

function sanitizeGraph(input)
{
    if(Array.isArray(input))
    {
        return sanitizeGraph(createGraphFromLegacyLines(input))
    }

    const rawNodes = Array.isArray(input?.nodes) ? input.nodes : []
    const rawEdges = Array.isArray(input?.edges) ? input.edges : []

    const nodes = []
    const nodeIds = new Set()

    for(const rawNode of rawNodes)
    {
        if(!rawNode || typeof rawNode !== 'object')
        {
            continue
        }

        const id = String(rawNode.id ?? '').trim()
        const x = Number(rawNode.x)
        const y = Number(rawNode.y)
        const z = Number(rawNode.z)

        if(!id || nodeIds.has(id) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z))
        {
            continue
        }

        nodeIds.add(id)
        nodes.push({
            id,
            x,
            y,
            z
        })
    }

    const edges = []
    const edgeKeys = new Set()

    for(const rawEdge of rawEdges)
    {
        if(!rawEdge)
        {
            continue
        }

        const a = String(rawEdge.a ?? rawEdge[0] ?? '').trim()
        const b = String(rawEdge.b ?? rawEdge[1] ?? '').trim()

        if(!a || !b || a === b || !nodeIds.has(a) || !nodeIds.has(b))
        {
            continue
        }

        const key = a < b ? `${a}:${b}` : `${b}:${a}`
        if(edgeKeys.has(key))
        {
            continue
        }

        edgeKeys.add(key)
        edges.push({ a, b })
    }

    return { nodes, edges }
}

export default class BloomRailSystem
{
    constructor({
        scene = null,
        rails = [],
        speed = 4,
        railSwitchDistance = 0.7,
        endpointSwitchDistance = 1.4,
        helperPointRadius = 0.08,
        showHelpers = false
    } = {})
    {
        this.scene = scene
        this.settings = {
            speed,
            railSwitchDistance,
            endpointSwitchDistance,
            helperPointRadius,
            showHelpers
        }

        this.graph = {
            nodes: [],
            edges: []
        }

        this.nodesById = new Map()
        this.adjacency = new Map()
        this.edgeSegments = []
        this.lastInsertedNodeId = null

        this.closestPoint = new THREE.Vector3()

        this.helperGroup = new THREE.Group()
        this.helperGroup.name = '__bloomRailsDebug'
        this.helperLines = []
        this.helperPoints = []

        if(this.scene)
        {
            this.scene.add(this.helperGroup)
        }

        this.setRails(rails)
        this.setHelpersVisible(this.settings.showHelpers)
    }

    setRails(rawRails = [])
    {
        this.graph = sanitizeGraph(rawRails)
        this.rebuildRuntimeData()
        this.rebuildHelpers()

        const firstNode = this.graph.nodes[0]
        this.lastInsertedNodeId = firstNode ? firstNode.id : null
    }

    hasRails()
    {
        return this.edgeSegments.length > 0
    }

    rebuildRuntimeData()
    {
        this.nodesById = new Map()
        this.adjacency = new Map()
        this.edgeSegments = []

        for(const node of this.graph.nodes)
        {
            const position = new THREE.Vector3(node.x, node.y, node.z)
            this.nodesById.set(node.id, position)
            this.adjacency.set(node.id, [])
        }

        for(const edge of this.graph.edges)
        {
            const start = this.nodesById.get(edge.a)
            const end = this.nodesById.get(edge.b)
            if(!start || !end)
            {
                continue
            }

            const length = start.distanceTo(end)
            if(length <= EPSILON)
            {
                continue
            }

            this.edgeSegments.push({
                a: edge.a,
                b: edge.b,
                start,
                end,
                length
            })

            this.adjacency.get(edge.a).push({ id: edge.b, cost: length })
            this.adjacency.get(edge.b).push({ id: edge.a, cost: length })
        }
    }

    moveAnchorTowards(anchor, targetPosition, deltaSeconds)
    {
        if(!(anchor instanceof THREE.Vector3) || !(targetPosition instanceof THREE.Vector3) || !this.hasRails())
        {
            return false
        }

        const route = this.buildBestRoute(anchor, targetPosition)
        if(route.length === 0)
        {
            return false
        }

        let remainingStep = Math.max(0, this.settings.speed) * Math.max(0, deltaSeconds)
        if(remainingStep <= EPSILON)
        {
            return false
        }

        const before = anchor.clone()
        let waypointIndex = 0

        while(remainingStep > EPSILON && waypointIndex < route.length)
        {
            const waypoint = route[waypointIndex]
            const distance = anchor.distanceTo(waypoint)

            if(distance <= EPSILON)
            {
                waypointIndex++
                continue
            }

            if(distance <= remainingStep)
            {
                anchor.copy(waypoint)
                remainingStep -= distance
                waypointIndex++
                continue
            }

            anchor.lerp(waypoint, remainingStep / distance)
            remainingStep = 0
        }

        return anchor.distanceToSquared(before) > EPSILON
    }

    buildBestRoute(anchor, targetPosition)
    {
        const anchorProjection = this.getClosestProjection(anchor)
        const targetProjection = this.getClosestProjection(targetPosition)

        if(!anchorProjection || !targetProjection)
        {
            return []
        }

        const startId = '__start__'
        const targetId = '__target__'
        const tempAdjacency = this.buildTemporaryAdjacency({
            startId,
            targetId,
            anchorProjection,
            targetProjection
        })
        const shortest = this.computeShortestPaths(startId, tempAdjacency)
        const totalDistance = shortest.distances.get(targetId)
        if(!Number.isFinite(totalDistance))
        {
            return []
        }

        const pathNodeIds = this.reconstructPath(
            shortest.previous,
            startId,
            targetId
        )

        const route = []
        for(let index = 1; index < pathNodeIds.length; index++)
        {
            const nodeId = pathNodeIds[index]
            if(nodeId === targetId)
            {
                route.push(targetProjection.point.clone())
                continue
            }

            if(nodeId === startId)
            {
                continue
            }

            const nodePosition = this.nodesById.get(nodeId)
            if(nodePosition)
            {
                route.push(nodePosition.clone())
            }
        }

        return route
    }

    buildTemporaryAdjacency({
        startId,
        targetId,
        anchorProjection,
        targetProjection
    })
    {
        const temp = new Map()
        for(const [nodeId, neighbors] of this.adjacency.entries())
        {
            temp.set(nodeId, neighbors.map((neighbor) => ({ id: neighbor.id, cost: neighbor.cost })))
        }

        const ensure = (nodeId) =>
        {
            if(!temp.has(nodeId))
            {
                temp.set(nodeId, [])
            }
            return temp.get(nodeId)
        }

        const link = (a, b, cost) =>
        {
            if(!Number.isFinite(cost) || cost < 0)
            {
                return
            }

            const neighborsA = ensure(a)
            const neighborsB = ensure(b)

            neighborsA.push({ id: b, cost })
            neighborsB.push({ id: a, cost })
        }

        ensure(startId)
        ensure(targetId)

        link(startId, anchorProjection.a, anchorProjection.distanceToA)
        link(startId, anchorProjection.b, anchorProjection.distanceToB)
        link(targetId, targetProjection.a, targetProjection.distanceToA)
        link(targetId, targetProjection.b, targetProjection.distanceToB)

        if(anchorProjection.a === targetProjection.a && anchorProjection.b === targetProjection.b)
        {
            const directCost = Math.abs(anchorProjection.t - targetProjection.t) * anchorProjection.length
            link(startId, targetId, directCost)
        }
        else if(anchorProjection.a === targetProjection.b && anchorProjection.b === targetProjection.a)
        {
            const targetParamOnAnchor = 1 - targetProjection.t
            const directCost = Math.abs(anchorProjection.t - targetParamOnAnchor) * anchorProjection.length
            link(startId, targetId, directCost)
        }

        return temp
    }

    computeShortestPaths(startId, adjacency = this.adjacency)
    {
        const distances = new Map()
        const previous = new Map()
        const visited = new Set()

        for(const nodeId of adjacency.keys())
        {
            distances.set(nodeId, Infinity)
        }
        if(!distances.has(startId))
        {
            distances.set(startId, Infinity)
        }
        distances.set(startId, 0)

        while(visited.size < distances.size)
        {
            let currentId = null
            let currentDistance = Infinity

            for(const [nodeId, distance] of distances.entries())
            {
                if(visited.has(nodeId))
                {
                    continue
                }

                if(distance < currentDistance)
                {
                    currentId = nodeId
                    currentDistance = distance
                }
            }

            if(!currentId)
            {
                break
            }

            visited.add(currentId)
            const neighbors = adjacency.get(currentId) ?? []

            for(const neighbor of neighbors)
            {
                const nextDistance = currentDistance + neighbor.cost
                if(nextDistance >= distances.get(neighbor.id))
                {
                    continue
                }

                distances.set(neighbor.id, nextDistance)
                previous.set(neighbor.id, currentId)
            }
        }

        return { distances, previous }
    }

    reconstructPath(previous, startId, targetId)
    {
        if(startId === targetId)
        {
            return [startId]
        }

        const result = [targetId]
        let cursor = targetId

        while(cursor !== startId)
        {
            const parent = previous.get(cursor)
            if(!parent)
            {
                return [startId, targetId]
            }

            result.push(parent)
            cursor = parent
        }

        result.reverse()
        return result
    }

    getClosestProjection(position)
    {
        if(!(position instanceof THREE.Vector3) || this.edgeSegments.length === 0)
        {
            return null
        }

        let best = null
        let bestDistanceSq = Infinity

        for(const segment of this.edgeSegments)
        {
            const projection = this.projectPointOnSegmentXZ(position, segment.start, segment.end)
            if(!projection)
            {
                continue
            }

            const distanceSq = projection.point.distanceToSquared(position)
            if(distanceSq >= bestDistanceSq)
            {
                continue
            }

            bestDistanceSq = distanceSq
            best = {
                a: segment.a,
                b: segment.b,
                point: projection.point.clone(),
                t: projection.t,
                length: segment.length,
                distanceToA: segment.length * projection.t,
                distanceToB: segment.length * (1 - projection.t)
            }
        }

        return best
    }

    projectPointOnSegmentXZ(position, start, end)
    {
        const abX = end.x - start.x
        const abZ = end.z - start.z
        const abLenSq = (abX * abX) + (abZ * abZ)

        if(abLenSq <= EPSILON)
        {
            return null
        }

        const apX = position.x - start.x
        const apZ = position.z - start.z
        const t = THREE.MathUtils.clamp(((apX * abX) + (apZ * abZ)) / abLenSq, 0, 1)

        this.closestPoint.copy(start).lerp(end, t)
        return {
            t,
            point: this.closestPoint
        }
    }

    addNode(point, { connectTo = null } = {})
    {
        const vector = toVector3(point)
        if(!(vector instanceof THREE.Vector3))
        {
            return null
        }

        const nodeId = `n${Date.now()}_${Math.floor(Math.random() * 100000)}`
        this.graph.nodes.push({ id: nodeId, x: vector.x, y: vector.y, z: vector.z })

        if(connectTo && this.nodesById.has(connectTo))
        {
            this.graph.edges.push({ a: connectTo, b: nodeId })
        }

        this.setRails(this.graph)
        this.lastInsertedNodeId = nodeId
        return nodeId
    }

    connectNodes(a, b)
    {
        if(!a || !b || a === b || !this.nodesById.has(a) || !this.nodesById.has(b))
        {
            return false
        }

        const exists = this.graph.edges.some((edge) =>
            (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a)
        )

        if(exists)
        {
            return false
        }

        this.graph.edges.push({ a, b })
        this.setRails(this.graph)
        return true
    }

    appendPoint(point)
    {
        if(this.graph.nodes.length === 0)
        {
            this.addNode(point)
            return true
        }

        const anchorId = this.lastInsertedNodeId ?? this.graph.nodes[this.graph.nodes.length - 1]?.id
        if(!anchorId)
        {
            return false
        }

        this.addNode(point, { connectTo: anchorId })
        return true
    }

    startNewRail(point = null)
    {
        if(point)
        {
            this.lastInsertedNodeId = this.addNode(point)
            return
        }

        this.lastInsertedNodeId = null
    }

    clearRails()
    {
        this.setRails({ nodes: [], edges: [] })
    }

    getNodePosition(nodeId)
    {
        if(typeof nodeId !== 'string' || nodeId.trim() === '')
        {
            return null
        }

        const position = this.nodesById.get(nodeId)
        return position ? position.clone() : null
    }

    toSerializableRails({ decimals = 3 } = {})
    {
        const factor = Math.pow(10, Math.max(0, Math.floor(decimals)))
        const nodes = this.graph.nodes.map((node) => ({
            id: node.id,
            x: Math.round(node.x * factor) / factor,
            y: Math.round(node.y * factor) / factor,
            z: Math.round(node.z * factor) / factor
        }))

        return {
            nodes,
            edges: this.graph.edges.map((edge) => ({ a: edge.a, b: edge.b }))
        }
    }

    logRailsToConsole()
    {
        const content = JSON.stringify(this.toSerializableRails(), null, 4)
        console.log('BLOOM_RAIL_GRAPH =', content)
        return content
    }

    setHelpersVisible(visible)
    {
        this.settings.showHelpers = Boolean(visible)
        this.helperGroup.visible = this.settings.showHelpers
    }

    rebuildHelpers()
    {
        for(const line of this.helperLines)
        {
            this.helperGroup.remove(line)
            line.geometry?.dispose?.()
            line.material?.dispose?.()
        }
        for(const point of this.helperPoints)
        {
            this.helperGroup.remove(point)
            point.geometry?.dispose?.()
            point.material?.dispose?.()
        }

        this.helperLines = []
        this.helperPoints = []

        for(const segment of this.edgeSegments)
        {
            const lineGeometry = new THREE.BufferGeometry().setFromPoints([segment.start, segment.end])
            const lineMaterial = new THREE.LineBasicMaterial({ color: '#2ec4ff' })
            const line = new THREE.Line(lineGeometry, lineMaterial)
            this.helperGroup.add(line)
            this.helperLines.push(line)
        }

        for(const node of this.graph.nodes)
        {
            const pointMesh = new THREE.Mesh(
                new THREE.SphereGeometry(this.settings.helperPointRadius, 10, 10),
                new THREE.MeshBasicMaterial({ color: '#8be9ff' })
            )
            pointMesh.position.set(node.x, node.y, node.z)
            this.helperGroup.add(pointMesh)
            this.helperPoints.push(pointMesh)
        }
    }

    destroy()
    {
        for(const line of this.helperLines)
        {
            line.geometry?.dispose?.()
            line.material?.dispose?.()
        }

        for(const point of this.helperPoints)
        {
            point.geometry?.dispose?.()
            point.material?.dispose?.()
        }

        this.helperLines = []
        this.helperPoints = []

        if(this.scene)
        {
            this.scene.remove(this.helperGroup)
        }

        this.graph = { nodes: [], edges: [] }
        this.nodesById.clear()
        this.adjacency.clear()
        this.edgeSegments = []
        this.lastInsertedNodeId = null
    }
}
