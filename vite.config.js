import fs from 'node:fs/promises'
import path from 'node:path'
import { defineConfig } from 'vite'

const RAILS_FILE_RELATIVE_PATH = 'src/Experience/Scenes/Map/World/bloomRails.json'

function createGraphFromLegacyLines(lines = [])
{
    const nodes = []
    const edges = []
    const nodeByKey = new Map()

    const getOrCreateNodeId = (point) =>
    {
        const key = `${point.x.toFixed(3)}:${point.y.toFixed(3)}:${point.z.toFixed(3)}`
        if(nodeByKey.has(key))
        {
            return nodeByKey.get(key)
        }

        const id = `n${nodes.length + 1}`
        nodeByKey.set(key, id)
        nodes.push({
            id,
            x: point.x,
            y: point.y,
            z: point.z
        })
        return id
    }

    for(const rail of Array.isArray(lines) ? lines : [])
    {
        if(!Array.isArray(rail) || rail.length < 2)
        {
            continue
        }

        for(let index = 0; index < rail.length - 1; index++)
        {
            const start = rail[index]
            const end = rail[index + 1]
            if(!start || !end || typeof start !== 'object' || typeof end !== 'object')
            {
                continue
            }

            const startPoint = {
                x: Number(start.x),
                y: Number(start.y),
                z: Number(start.z)
            }
            const endPoint = {
                x: Number(end.x),
                y: Number(end.y),
                z: Number(end.z)
            }

            if(!Number.isFinite(startPoint.x) || !Number.isFinite(startPoint.y) || !Number.isFinite(startPoint.z))
            {
                continue
            }

            if(!Number.isFinite(endPoint.x) || !Number.isFinite(endPoint.y) || !Number.isFinite(endPoint.z))
            {
                continue
            }

            const a = getOrCreateNodeId(startPoint)
            const b = getOrCreateNodeId(endPoint)
            if(a !== b)
            {
                edges.push({ a, b })
            }
        }
    }

    return { nodes, edges }
}

function sanitizeRailsGraph(input)
{
    if(Array.isArray(input))
    {
        return sanitizeRailsGraph(createGraphFromLegacyLines(input))
    }

    if(!input || typeof input !== 'object')
    {
        return { nodes: [], edges: [] }
    }

    const rawNodes = Array.isArray(input.nodes) ? input.nodes : []
    const rawEdges = Array.isArray(input.edges) ? input.edges : []

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
            x: Math.round(x * 1000) / 1000,
            y: Math.round(y * 1000) / 1000,
            z: Math.round(z * 1000) / 1000
        })
    }

    const edges = []
    const seenEdges = new Set()

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

        const edgeKey = a < b ? `${a}:${b}` : `${b}:${a}`
        if(seenEdges.has(edgeKey))
        {
            continue
        }

        seenEdges.add(edgeKey)
        edges.push({ a, b })
    }

    return { nodes, edges }
}

function railsToLegacyLines(graph)
{
    const nodesById = new Map((graph.nodes ?? []).map((node) => [node.id, node]))
    const adjacency = new Map()

    for(const node of graph.nodes ?? [])
    {
        adjacency.set(node.id, [])
    }

    for(const edge of graph.edges ?? [])
    {
        if(!adjacency.has(edge.a) || !adjacency.has(edge.b))
        {
            continue
        }
        adjacency.get(edge.a).push(edge.b)
        adjacency.get(edge.b).push(edge.a)
    }

    const visitedEdge = new Set()
    const lines = []

    const markVisited = (a, b) =>
    {
        const key = a < b ? `${a}:${b}` : `${b}:${a}`
        visitedEdge.add(key)
    }

    const isVisited = (a, b) =>
    {
        const key = a < b ? `${a}:${b}` : `${b}:${a}`
        return visitedEdge.has(key)
    }

    for(const node of graph.nodes ?? [])
    {
        const neighbors = adjacency.get(node.id) ?? []
        for(const neighborId of neighbors)
        {
            if(isVisited(node.id, neighborId))
            {
                continue
            }

            const line = []
            let currentId = node.id
            let prevId = null

            while(true)
            {
                const currentNode = nodesById.get(currentId)
                if(!currentNode)
                {
                    break
                }

                line.push({ x: currentNode.x, y: currentNode.y, z: currentNode.z })
                const nextCandidates = (adjacency.get(currentId) ?? [])
                    .filter((nextId) => nextId !== prevId && !isVisited(currentId, nextId))

                if(nextCandidates.length !== 1)
                {
                    if(nextCandidates.length > 1)
                    {
                        markVisited(currentId, nextCandidates[0])
                    }
                    break
                }

                const nextId = nextCandidates[0]
                markVisited(currentId, nextId)
                prevId = currentId
                currentId = nextId
            }

            if(line.length > 1)
            {
                lines.push(line)
            }
        }
    }

    if(lines.length > 0)
    {
        return lines
    }

    return (graph.nodes ?? []).map((node) => [{ x: node.x, y: node.y, z: node.z }])
}

function readRequestBody(request)
{
    return new Promise((resolve, reject) =>
    {
        let data = ''

        request.on('data', (chunk) =>
        {
            data += chunk
            if(data.length > 2_000_000)
            {
                reject(new Error('Payload trop volumineux'))
                request.destroy()
            }
        })

        request.on('end', () => resolve(data))
        request.on('error', reject)
    })
}

function railsEditorPlugin()
{
    return {
        name: 'rails-editor-file-sync',
        configureServer(server)
        {
            const railsFilePath = path.resolve(server.config.root, RAILS_FILE_RELATIVE_PATH)

            server.middlewares.use(async (request, response, next) =>
            {
                if(request.url === '/__rails/read' && request.method === 'GET')
                {
                    try
                    {
                        const content = await fs.readFile(railsFilePath, 'utf-8')
                        response.statusCode = 200
                        response.setHeader('Content-Type', 'application/json; charset=utf-8')
                        response.end(content)
                    }
                    catch(error)
                    {
                        response.statusCode = 500
                        response.setHeader('Content-Type', 'application/json; charset=utf-8')
                        response.end(JSON.stringify({ error: 'read_failed', message: String(error?.message || error) }))
                    }

                    return
                }

                if(request.url === '/__rails/save' && request.method === 'POST')
                {
                    try
                    {
                        const rawBody = await readRequestBody(request)
                        const parsed = JSON.parse(rawBody || '{}')
                        const railsGraph = sanitizeRailsGraph(parsed?.rails)

                        const nextContent = JSON.stringify(railsGraph, null, 4) + '\n'
                        await fs.writeFile(railsFilePath, nextContent, 'utf-8')

                        response.statusCode = 200
                        response.setHeader('Content-Type', 'application/json; charset=utf-8')
                        response.end(JSON.stringify({
                            ok: true,
                            nodesCount: railsGraph.nodes.length,
                            edgesCount: railsGraph.edges.length,
                            railsCount: railsToLegacyLines(railsGraph).length
                        }))
                    }
                    catch(error)
                    {
                        response.statusCode = 400
                        response.setHeader('Content-Type', 'application/json; charset=utf-8')
                        response.end(JSON.stringify({ error: 'save_failed', message: String(error?.message || error) }))
                    }

                    return
                }

                next()
            })
        }
    }
}

export default defineConfig({
    plugins: [railsEditorPlugin()]
})
