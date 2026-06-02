import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import { applyStandardMaterialPatch } from '../../../Map/World/Shaders/Common/applyStandardMaterialPatch.js'
import { wallShaderChunks } from '../../../SceneRecuperation/World/Shaders/Walls/wallShaderChunks.js'

const isRoom1MeshName = (name) => name.startsWith('room1')
const isWallMeshName = (name) => isRoom1MeshName(name)

const DEFAULTS = {
    wallScale:        0.45,
    noiseScale:       0.08,
    noiseCoverage:    0.65,
    noiseTransition:  0.36,   // largeur du fondu entre zone dalle / zone nue
    slabMin:          0.38,   // multiplicateur couleur sur les joints
    slabMax:          1.20,   // multiplicateur couleur sur les faces de dalle
    color: new THREE.Color(1, 1, 1),
    visibleSide:      'front',
    room1VisibleSide: 'back'
}

export default class SceneDistributionWalls
{
    constructor({ distributionModel = null, debugParentFolder = null } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.resources = this.experience.resources
        this.distributionModel = distributionModel
        this.materials = []
        this.uniformRefs = []

        this.wallColor = DEFAULTS.color.clone()
        this.visibleSide = DEFAULTS.visibleSide
        this.room1VisibleSide = DEFAULTS.room1VisibleSide

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
        const model = this.distributionModel?.model
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
            this.patchMesh(child, { isRoom1: isRoom1MeshName(name) })
            count++
        })

        console.log(`[Walls] ${count} mesh(es) patchés (Distribution)`)
    }

    patchMesh(mesh, { isRoom1 = false } = {})
    {
        if(isRoom1)
        {
            mesh.userData.forceBidirectionalCollision = true
        }

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
            side:      this.resolveMaterialSide(isRoom1 ? this.room1VisibleSide : this.visibleSide)
        })
        mat.color.copy(this.wallColor)
        mat.userData.isDistributionRoom1Wall = isRoom1
        mat.customProgramCacheKey = () => `wall-slab-distrib-${mat.uuid}`
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

    resolveMaterialSide(sideToken)
    {
        if(sideToken === 'front')
        {
            return THREE.FrontSide
        }

        if(sideToken === 'double')
        {
            return THREE.DoubleSide
        }

        return THREE.BackSide
    }

    setDebug(parentFolder)
    {
        if(!this.debug?.isDebugEnabled || !parentFolder) return

        this.debugFolder = this.debug.addFolder('Murs', { parent: parentFolder, expanded: true })

        // --- Teinte ---
        const colorBinding = this.debug.addColorBinding(this.debugFolder, this, 'wallColor', { label: 'Teinte' })
        colorBinding?.on?.('change', (e) => { for(const mat of this.materials) mat.color.set(e.value) })
        this.debug.addBinding(this.debugFolder, this, 'visibleSide', {
            label: 'Face visible',
            options: {
                Interieur: 'front',
                Exterieur: 'back',
                Double: 'double'
            }
        })?.on?.('change', (e) =>
        {
            const side = this.resolveMaterialSide(e.value)
            for(const mat of this.materials)
            {
                if(mat.userData.isDistributionRoom1Wall)
                {
                    continue
                }
                mat.side = side
                mat.needsUpdate = true
            }
        })
        this.debug.addBinding(this.debugFolder, this, 'room1VisibleSide', {
            label: 'Face visible room1',
            options: {
                Interieur: 'back',
                Exterieur: 'front',
                Double: 'double'
            }
        })?.on?.('change', (e) =>
        {
            const side = this.resolveMaterialSide(e.value)
            for(const mat of this.materials)
            {
                if(!mat.userData.isDistributionRoom1Wall)
                {
                    continue
                }
                mat.side = side
                mat.needsUpdate = true
            }
        })

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
