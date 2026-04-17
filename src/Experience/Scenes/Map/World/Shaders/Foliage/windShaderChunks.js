import vertexSource from './wind.vertex.glsl?raw'
import { parseShaderSections } from '../Common/parseShaderSections.js'

const vertexSections = parseShaderSections(vertexSource)

export const foliageWindShaderChunks = {
    vertexHeader: vertexSections.header,
    vertexBegin: vertexSections.begin
}
