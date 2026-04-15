const PROJECT_VERTEX_INCLUDE = '#include <project_vertex>'
const DIFFUSE_COLOR_ASSIGNMENT = 'vec4 diffuseColor = vec4( diffuse, opacity );'

// Applique des chunks GLSL externes sur un shader standard Three.js (vertex + fragment).
function prependShader(source, header)
{
    const trimmedHeader = String(header || '').trim()
    if(trimmedHeader.length === 0)
    {
        return source
    }

    return `${trimmedHeader}\n${source}`
}

function replaceOrAppend(source, search, replacement)
{
    if(source.includes(search))
    {
        return source.replace(search, replacement)
    }

    return `${source}\n${replacement}`
}

export function applyStandardMaterialPatch(shader, chunks)
{
    shader.vertexShader = prependShader(shader.vertexShader, chunks.vertexHeader)
    shader.vertexShader = replaceOrAppend(
        shader.vertexShader,
        PROJECT_VERTEX_INCLUDE,
        String(chunks.vertexProject || '').trim()
    )

    shader.fragmentShader = prependShader(shader.fragmentShader, chunks.fragmentHeader)
    shader.fragmentShader = replaceOrAppend(
        shader.fragmentShader,
        DIFFUSE_COLOR_ASSIGNMENT,
        String(chunks.fragmentDiffuse || '').trim()
    )
}
