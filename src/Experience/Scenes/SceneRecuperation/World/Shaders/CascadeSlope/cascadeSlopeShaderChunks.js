import vertexSource from './cascadeSlope.vertex.glsl?raw'
import fragmentSource from './cascadeSlope.fragment.glsl?raw'
import { parseShaderSections } from '../../../../Map/World/Shaders/Common/parseShaderSections.js'

const vertexSections = parseShaderSections(vertexSource)
const fragmentSections = parseShaderSections(fragmentSource)

export const cascadeSlopeShaderChunks = {
    vertexHeader: vertexSections.header,
    vertexProject: vertexSections.project,
    fragmentHeader: fragmentSections.header,
    fragmentDiffuse: fragmentSections.diffuse
}
