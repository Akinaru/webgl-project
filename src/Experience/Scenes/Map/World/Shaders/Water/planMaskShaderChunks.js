import vertexSource from './planMask.vertex.glsl?raw'
import fragmentSource from './planMask.fragment.glsl?raw'
import { parseShaderSections } from '../Common/parseShaderSections.js'

const vertexSections = parseShaderSections(vertexSource)
const fragmentSections = parseShaderSections(fragmentSource)

// Chunks GLSL du shader "plan mask" pour afficher l eau sur le plan.
export const planWaterMaskShaderChunks = {
    vertexHeader: vertexSections.header,
    vertexProject: vertexSections.project,
    fragmentHeader: fragmentSections.header,
    fragmentDiffuse: fragmentSections.diffuse
}
