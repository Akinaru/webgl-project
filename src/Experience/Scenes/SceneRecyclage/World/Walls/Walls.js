import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import { applyStandardMaterialPatch } from '../../../../Scenes/Map/World/Shaders/Common/applyStandardMaterialPatch.js'
import { wallShaderChunks } from '../../../../Scenes/SceneRecuperation/World/Shaders/Walls/wallShaderChunks.js'

const BORNE_NAME = 'borne'
const BASE_DOME_NAME = 'base_dome'
const PORTE_EXT_NAME = 'porte_ext'
const POLYGONE_NAME = 'polygone'
const BOOLEEN_NAME = 'booleen'
const EPAISSEUR_NAME = 'epaisseur'
const isWallMeshName = (name) => name === 'cube' || name.startsWith('cube.')

const normalizeName = (value) =>
{
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

const DEFAULTS = {
    wallScale: 0.955,
    noiseScale: 0.370,
    noiseCoverage: 0.728,
    noiseTransition: 0.36,
    slabMin: 0.38,
    slabMax: 1.20,
    noiseDriftSpeed: 0.248,
    color: new THREE.Color('#d3d5eb'),
    roughness: 0,
    metalness: 0
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

            const name = normalizeName(child.name)
            if(!this.shouldPatchWallMesh(child, name))
            {
                return
            }

            this.ensureWallGeometryNormals(child)
            this.patchMesh(child)
            count++
        })

        console.log(`[SceneRecyclageWalls] ${count} mesh(es) patchés`)
    }

    hasAncestorNamed(object, targetName)
    {
        let current = object
        while(current)
        {
            const name = normalizeName(current.name)
            if(name === targetName)
            {
                return true
            }
            current = current.parent
        }

        return false
    }

    shouldPatchWallMesh(mesh, normalizedName)
    {
        if(isWallMeshName(normalizedName))
        {
            return !this.hasAncestorNamed(mesh, BORNE_NAME)
        }

        if(normalizedName === BASE_DOME_NAME || normalizedName === PORTE_EXT_NAME)
        {
            return true
        }

        if(normalizedName !== POLYGONE_NAME)
        {
            return false
        }

        if(this.hasAncestorNamed(mesh, BOOLEEN_NAME) && this.hasAncestorNamed(mesh, EPAISSEUR_NAME))
        {
            return true
        }

        return false
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
            uWallSlabMax: { value: DEFAULTS.slabMax },
            uWallTime: { value: 0 },
            uWallNoiseDriftSpeed: { value: DEFAULTS.noiseDriftSpeed }
        }
        this.uniformRefs.push(uniforms)

        const material = new THREE.MeshStandardMaterial({
            roughness: DEFAULTS.roughness,
            metalness: DEFAULTS.metalness,
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
            return normalizedSide
        }

        return THREE.DoubleSide
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

    update()
    {
        const elapsedSeconds = (this.experience.time?.elapsed ?? 0) * 0.001
        for(const uniforms of this.uniformRefs)
        {
            uniforms.uWallTime.value = elapsedSeconds
        }
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

        this.addUniformBinding('Densité dalles', 'uWallScale', DEFAULTS.wallScale, 0.01, 3.0, 0.005)
        this.addUniformBinding('Fréq. bruit', 'uWallNoiseScale', DEFAULTS.noiseScale, 0.001, 2.0, 0.001)
        this.addUniformBinding('Couverture', 'uWallNoiseCoverage', DEFAULTS.noiseCoverage, 0.0, 1.0, 0.001)
        this.addUniformBinding('Transition', 'uWallNoiseTransition', DEFAULTS.noiseTransition, 0.001, 2.0, 0.001)
        this.addUniformBinding('Vitesse bruit', 'uWallNoiseDriftSpeed', DEFAULTS.noiseDriftSpeed, 0.0, 0.3, 0.001)
        this.addUniformBinding('Joints (min)', 'uWallSlabMin', DEFAULTS.slabMin, 0.0, 2.0, 0.01)
        this.addUniformBinding('Faces dalle (max)', 'uWallSlabMax', DEFAULTS.slabMax, 0.0, 3.0, 0.01)
    }

    addUniformBinding(label, uniformKey, defaultValue, min, max, step)
    {
        const state = { value: defaultValue }
        this.debug.addBinding(this.debugFolder, state, 'value', { label, min, max, step })
            ?.on?.('change', (event) =>
            {
                for(const uniforms of this.uniformRefs)
                {
                    uniforms[uniformKey].value = event.value
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
