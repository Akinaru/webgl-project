import * as THREE from 'three'

export const EPSILON = 1e-6

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
