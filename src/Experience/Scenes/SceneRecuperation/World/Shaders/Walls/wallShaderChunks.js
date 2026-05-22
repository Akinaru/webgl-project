import vertexSource from './wall.vertex.glsl?raw'
import fragmentSource from './wall.fragment.glsl?raw'
import { parseShaderSections } from '../../../../Map/World/Shaders/Common/parseShaderSections.js'

const vertexSections = parseShaderSections(vertexSource)
const fragmentSections = parseShaderSections(fragmentSource)

export const wallShaderChunks = {
    vertexHeader: vertexSections.header,
    vertexProject: vertexSections.project,
    fragmentHeader: fragmentSections.header,
    fragmentDiffuse: fragmentSections.diffuse
}
