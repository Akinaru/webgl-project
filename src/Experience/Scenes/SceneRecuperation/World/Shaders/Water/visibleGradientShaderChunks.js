import vertexSource from './visibleGradient.vertex.glsl?raw'
import fragmentSource from './visibleGradient.fragment.glsl?raw'
import { parseShaderSections } from '../../../../Map/World/Shaders/Common/parseShaderSections.js'

const vertexSections = parseShaderSections(vertexSource)
const fragmentSections = parseShaderSections(fragmentSource)

export const recuperationWaterVisibleGradientShaderChunks = {
    vertexHeader: vertexSections.header,
    vertexProject: vertexSections.project,
    fragmentHeader: fragmentSections.header,
    fragmentDiffuse: fragmentSections.diffuse
}
