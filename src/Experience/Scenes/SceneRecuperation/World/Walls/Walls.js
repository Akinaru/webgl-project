import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import { applyStandardMaterialPatch } from '../../../Map/World/Shaders/Common/applyStandardMaterialPatch.js'
import { wallShaderChunks } from '../Shaders/Walls/wallShaderChunks.js'

const isWallMeshName = (name) => name.startsWith('room1') || name.startsWith('room2')

const DEFAULTS = {
    wallScale:        0.45,
    noiseScale:       0.08,
    noiseCoverage:    0.65,
    noiseTransition:  0.36,   // largeur du fondu entre zone dalle / zone nue
    slabMin:          0.38,   // multiplicateur couleur sur les joints
    slabMax:          1.20,   // multiplicateur couleur sur les faces de dalle
    color: new THREE.Color(1, 1, 1)
}

export default class SceneRecuperationWalls
{
    constructor({ recuperationModel = null, debugParentFolder = null } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.resources = this.experience.resources
        this.recuperationModel = recuperationModel
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
        const model = this.recuperationModel?.model
        if(!model)
        {
            console.warn('[Walls] model non disponible')
            return
        }

        let count = 0
        model.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh)) return
            const name = String(child.name || '').trim().toLowerCase()
            if(!isWallMeshName(name)) return

            this.ensureWallGeometryNormals(child)
            this.patchMesh(child)
            count++
        })

        console.log(`[Walls] ${count} mesh(es) patchés`)
    }

    patchMesh(mesh)
    {
        const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
        const slabsTexture = this.slabsTexture

        const uniforms = {
            uWallSlabs:         { value: slabsTexture },
            uWallScale:         { value: DEFAULTS.wallScale },
            uWallNoiseScale:    { value: DEFAULTS.noiseScale },
            uWallNoiseCoverage: { value: DEFAULTS.noiseCoverage },
            uWallNoiseTransition:{ value: DEFAULTS.noiseTransition },
            uWallSlabMin:       { value: DEFAULTS.slabMin },
            uWallSlabMax:       { value: DEFAULTS.slabMax }
        }
        this.uniformRefs.push(uniforms)

        const mat = new THREE.MeshStandardMaterial({
            roughness: src?.roughness ?? 1.0,
            metalness: src?.metalness ?? 0.0,
            side:      src?.side      ?? THREE.DoubleSide
        })
        mat.color.copy(this.wallColor)
        mat.customProgramCacheKey = () => `wall-slab-${mat.uuid}`
        mat.onBeforeCompile = (shader) =>
        {
            Object.assign(shader.uniforms, uniforms)
            applyStandardMaterialPatch(shader, wallShaderChunks)
        }

        this.materials.push(mat)
        mesh.material = mat
    }

    ensureWallGeometryNormals(mesh)
    {
        if(!mesh?.geometry || mesh.geometry.getAttribute('normal')) return
        mesh.geometry.computeVertexNormals()
        mesh.geometry.normalizeNormals()
        mesh.geometry.attributes.normal.needsUpdate = true
    }

    setDebug(parentFolder)
    {
        if(!this.debug?.isDebugEnabled || !parentFolder) return

        this.debugFolder = this.debug.addFolder('Murs', { parent: parentFolder, expanded: true })

        // --- Teinte ---
        const colorBinding = this.debug.addColorBinding(this.debugFolder, this, 'wallColor', { label: 'Teinte' })
        colorBinding?.on?.('change', (e) => { for(const mat of this.materials) mat.color.set(e.value) })

        // --- Texture ---
        this.addUniformBinding('Densité dalles',     'uWallScale',          DEFAULTS.wallScale,       0.01,  3.0,  0.005)

        // --- Bruit ---
        this.addUniformBinding('Fréq. bruit',        'uWallNoiseScale',     DEFAULTS.noiseScale,      0.001, 2.0,  0.001)
        this.addUniformBinding('Couverture',         'uWallNoiseCoverage',  DEFAULTS.noiseCoverage,   0.0,   1.0,  0.001)
        this.addUniformBinding('Transition',         'uWallNoiseTransition',DEFAULTS.noiseTransition, 0.001, 2.0,  0.001)

        // --- Contraste dalles ---
        this.addUniformBinding('Joints (min)',       'uWallSlabMin',        DEFAULTS.slabMin,         0.0,   2.0,  0.01)
        this.addUniformBinding('Faces dalle (max)',  'uWallSlabMax',        DEFAULTS.slabMax,         0.0,   3.0,  0.01)
    }

    addUniformBinding(label, uniformKey, defaultValue, min, max, step)
    {
        const state = { v: defaultValue }
        this.debug.addBinding(this.debugFolder, state, 'v', { label, min, max, step })
            ?.on?.('change', (e) =>
            {
                for(const u of this.uniformRefs) u[uniformKey].value = e.value
            })
    }

    destroy()
    {
        for(const mat of this.materials) mat.dispose()
        this.materials = []
        this.uniformRefs = []
        this.debugFolder = null
    }
}
