import vertexSource from './waterline.vertex.glsl?raw'
import fragmentSource from './waterline.fragment.glsl?raw'
import { parseShaderSections } from '../Common/parseShaderSections.js'

const vertexSections = parseShaderSections(vertexSource)
const fragmentSections = parseShaderSections(fragmentSource)

// Chunks GLSL du shader "waterline" appliques au relief.
export const terrainWaterlineShaderChunks = {
    vertexHeader: vertexSections.header,
    vertexProject: vertexSections.project,
    fragmentHeader: fragmentSections.header,
    fragmentDiffuse: fragmentSections.diffuse
}
