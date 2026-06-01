import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import { applyStandardMaterialPatch } from '../../../../Scenes/Map/World/Shaders/Common/applyStandardMaterialPatch.js'
import { wallShaderChunks } from '../../../../Scenes/SceneRecuperation/World/Shaders/Walls/wallShaderChunks.js'

const isWallMeshName = (name) => name === 'cube' || name.startsWith('cube.')

const DEFAULTS = {
    wallScale: 0.45,
    noiseScale: 0.08,
    noiseCoverage: 0.65,
    noiseTransition: 0.36,
    slabMin: 0.38,
    slabMax: 1.20,
    color: new THREE.Color(1, 1, 1)
}

export default class SceneRecyclageWalls
{
    constructor({ recyclageModel = null, debugParentFolder = null } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.resources = this.experience.resources
        this.recyclageModel = recyclageModel
        this.materials = []
        this.uniformRefs = []

        this.wallColor = DEFAULTS.color.clone()

        this.slabsTexture = this.resources.items.recuperationWallSlabsTexture ?? null
        if(this.slabsTexture)
        {
            this.slabsTexture.wrapS = THREE.RepeatWrapping
            this.slabsTexture.wrapT = THREE.RepeatWrapping
        }

        this.applyToWalls()
        this.setDebug(debugParentFolder)
    }

    applyToWalls()
    {
        const model = this.recyclageModel?.model
        if(!model)
        {
            console.warn('[SceneRecyclageWalls] model non disponible')
            return
        }

        let count = 0
        model.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh))
            {
                return
            }

            const name = String(child.name || '').trim().toLowerCase()
            if(!isWallMeshName(name))
            {
                return
            }

            this.ensureWallGeometryNormals(child)
            this.patchMesh(child)
            count++
        })

        console.log(`[SceneRecyclageWalls] ${count} mesh(es) patchés`)
    }

    patchMesh(mesh)
    {
        const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
        const materialSide = this.resolveMaterialSide(sourceMaterial)
        const uniforms = {
            uWallSlabs: { value: this.slabsTexture },
            uWallScale: { value: DEFAULTS.wallScale },
            uWallNoiseScale: { value: DEFAULTS.noiseScale },
            uWallNoiseCoverage: { value: DEFAULTS.noiseCoverage },
            uWallNoiseTransition: { value: DEFAULTS.noiseTransition },
            uWallSlabMin: { value: DEFAULTS.slabMin },
            uWallSlabMax: { value: DEFAULTS.slabMax }
        }
        this.uniformRefs.push(uniforms)

        const material = new THREE.MeshStandardMaterial({
            roughness: sourceMaterial?.roughness ?? 1,
            metalness: sourceMaterial?.metalness ?? 0,
            side: materialSide
        })
        material.color.copy(this.wallColor)
        material.shadowSide = materialSide
        material.customProgramCacheKey = () => `wall-slab-recyclage-${material.uuid}`
        material.onBeforeCompile = (shader) =>
        {
            Object.assign(shader.uniforms, uniforms)
            applyStandardMaterialPatch(shader, wallShaderChunks)
        }

        this.materials.push(material)
        mesh.material = material
    }

    resolveMaterialSide(sourceMaterial)
    {
        const normalizedSide = sourceMaterial?.side
        if(normalizedSide === THREE.BackSide || normalizedSide === THREE.FrontSide || normalizedSide === THREE.DoubleSide)
        {
            if(normalizedSide === THREE.DoubleSide)
            {
                return THREE.BackSide
            }

            return normalizedSide
        }

        return THREE.BackSide
    }

    ensureWallGeometryNormals(mesh)
    {
        if(!mesh?.geometry || mesh.geometry.getAttribute('normal'))
        {
            return
        }

        mesh.geometry.computeVertexNormals()
        mesh.geometry.normalizeNormals()
        mesh.geometry.attributes.normal.needsUpdate = true
    }

    setDebug(parentFolder)
    {
        if(!this.debug?.isDebugEnabled || !parentFolder)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('Murs nanobots', { parent: parentFolder, expanded: false })
        const colorBinding = this.debug.addColorBinding(this.debugFolder, this, 'wallColor', { label: 'Teinte' })
        colorBinding?.on?.('change', (event) =>
        {
            for(const material of this.materials)
            {
                material.color.set(event.value)
            }
        })
    }

    destroy()
    {
        for(const material of this.materials)
        {
            material.dispose()
        }

        this.materials = []
        this.uniformRefs = []
        this.debugFolder?.dispose?.()
        this.debugFolder = null
    }
}
