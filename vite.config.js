import fs from 'node:fs/promises'
import path from 'node:path'
import { defineConfig } from 'vite'

const RAILS_FILE_RELATIVE_PATH = 'src/Experience/Scenes/Map/World/bloomRails.json'

function sanitizeRails(input)
{
    if(!Array.isArray(input))
    {
        return []
    }

    const rails = input
        .map((rail) =>
        {
            if(!Array.isArray(rail))
            {
                return []
            }

            return rail
                .map((point) =>
                {
                    if(!point || typeof point !== 'object')
                    {
                        return null
                    }

                    const x = Number(point.x)
                    const y = Number(point.y)
                    const z = Number(point.z)

                    if(!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z))
                    {
                        return null
                    }

                    return {
                        x: Math.round(x * 1000) / 1000,
                        y: Math.round(y * 1000) / 1000,
                        z: Math.round(z * 1000) / 1000
                    }
                })
                .filter(Boolean)
        })
        .filter((rail) => rail.length > 0)

    return rails
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
                        const rails = sanitizeRails(parsed?.rails)

                        const nextContent = JSON.stringify(rails, null, 4) + '\n'
                        await fs.writeFile(railsFilePath, nextContent, 'utf-8')

                        response.statusCode = 200
                        response.setHeader('Content-Type', 'application/json; charset=utf-8')
                        response.end(JSON.stringify({ ok: true, railsCount: rails.length }))
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
