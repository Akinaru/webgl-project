import vertexSource from './cascadeTube.vertex.glsl?raw'
import fragmentSource from './cascadeTube.fragment.glsl?raw'
import { parseShaderSections } from '../../../../Map/World/Shaders/Common/parseShaderSections.js'

const vertexSections = parseShaderSections(vertexSource)
const fragmentSections = parseShaderSections(fragmentSource)

export const cascadeTubeShaderChunks = {
    vertexHeader: vertexSections.header,
    vertexProject: vertexSections.project,
    fragmentHeader: fragmentSections.header,
    fragmentDiffuse: fragmentSections.diffuse
}
