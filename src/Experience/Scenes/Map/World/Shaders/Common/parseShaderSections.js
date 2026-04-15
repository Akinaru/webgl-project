// Parse un fichier GLSL sectionne avec des tags: // @header, // @project, // @diffuse.
export function parseShaderSections(source)
{
    const sections = {}
    const lines = String(source || '').split('\n')
    let currentKey = null
    let currentLines = []

    const flushSection = () =>
    {
        if(!currentKey)
        {
            return
        }

        sections[currentKey] = currentLines.join('\n').trim()
    }

    for(const line of lines)
    {
        const marker = line.trim().match(/^\/\/\s*@([a-z0-9_-]+)\s*$/i)
        if(!marker)
        {
            if(currentKey)
            {
                currentLines.push(line)
            }
            continue
        }

        flushSection()
        currentKey = marker[1].toLowerCase()
        currentLines = []
    }

    flushSection()
    return sections
}
