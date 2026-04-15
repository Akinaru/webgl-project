import terrainWaterlineVertexHeader from './terrainWaterline.vertex.header.glsl?raw'
import terrainWaterlineVertexProject from './terrainWaterline.vertex.project.glsl?raw'
import terrainWaterlineFragmentHeader from './terrainWaterline.fragment.header.glsl?raw'
import terrainWaterlineFragmentDiffuse from './terrainWaterline.fragment.diffuse.glsl?raw'
import planWaterMaskVertexHeader from './planWaterMask.vertex.header.glsl?raw'
import planWaterMaskVertexProject from './planWaterMask.vertex.project.glsl?raw'
import planWaterMaskFragmentHeader from './planWaterMask.fragment.header.glsl?raw'
import planWaterMaskFragmentDiffuse from './planWaterMask.fragment.diffuse.glsl?raw'

// Registre central des chunks GLSL utilises pour patcher les materials de la map.
export const terrainWaterlineShaderChunks = {
    vertexHeader: terrainWaterlineVertexHeader,
    vertexProject: terrainWaterlineVertexProject,
    fragmentHeader: terrainWaterlineFragmentHeader,
    fragmentDiffuse: terrainWaterlineFragmentDiffuse
}

export const planWaterMaskShaderChunks = {
    vertexHeader: planWaterMaskVertexHeader,
    vertexProject: planWaterMaskVertexProject,
    fragmentHeader: planWaterMaskFragmentHeader,
    fragmentDiffuse: planWaterMaskFragmentDiffuse
}
