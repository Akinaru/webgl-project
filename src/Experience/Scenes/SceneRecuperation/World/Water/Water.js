import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import { applyStandardMaterialPatch } from '../../../Map/World/Shaders/Common/applyStandardMaterialPatch.js'
import { applyMatteWaterMaterial, stripSpecularReflectionsFromShader } from '../../../Map/World/Shaders/Common/disableSpecularReflections.js'
import { recuperationWaterVisibleGradientShaderChunks } from '../Shaders/Water/visibleGradientShaderChunks.js'
import * as C from './Water.constants.js'

export default class SceneRecuperationWater
{
    constructor({ recuperationModel = null, debugParentFolder = null, sharedWaterColors = null } = {})
    {
        this.experience = new Experience()
        this.debug = this.experience.debug
        this.resources = this.experience.resources
        this.recuperationModel = recuperationModel
        this.debugParentFolder = debugParentFolder
        this.sharedWaterColors = sharedWaterColors
        this.waterDistributionTexture = this.resources.items.recuperationWaterDistributionTexture ?? null
        this.runtimeMaterials = []

        this.colorDeep  = new THREE.Color(C.WATER_COLOR_DEEP)
        this.colorMid   = new THREE.Color(C.WATER_COLOR_MID)
        this.colorLight = new THREE.Color(C.WATER_COLOR_LIGHT)
        this.opacity         = C.WATER_OPACITY
        this.scale           = C.WATER_SCALE
        this.speed           = C.WATER_SPEED
        this.thresholdMid    = C.WATER_THRESHOLD_MID
        this.thresholdLight  = C.WATER_THRESHOLD_LIGHT
        this.localTime = 0

        this.waterMeshes    = this.collectWaterMeshes()
        this.flatTintMeshes = this.collectFlatTintMeshes()

        this.applySharedWaterColors()
        this.applyTexture()
        this.setDebug()
    }

    applySharedWaterColors()
    {
        if(this.sharedWaterColors)
        {
            this.colorDeep.set( this.sharedWaterColors.baseColor        ?? C.WATER_COLOR_DEEP)
            this.colorMid.set(  this.sharedWaterColors.deepFoamColor    ?? C.WATER_COLOR_MID)
            this.colorLight.set(this.sharedWaterColors.surfaceFoamColor ?? C.WATER_COLOR_LIGHT)
        }

        this.syncMaterialUniforms()
    }

    collectWaterMeshes()
    {
        const root = this.recuperationModel?.model
        if(!root) return []

        const meshes = []
        root.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh)) return
            if(!this.recuperationModel?.hasExactNameInHierarchy?.(child, C.WATER_PLAN_MESH_NAMES)) return
            meshes.push(child)
        })
        return meshes
    }

    collectFlatTintMeshes()
    {
        const root = this.recuperationModel?.model
        if(!root) return []

        const meshes = []
        root.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh)) return
            if(!this.recuperationModel?.hasExactNameInHierarchy?.(child, C.WATER_BASE_TINT_MESH_NAMES)) return
            meshes.push(child)
        })
        return meshes
    }

    applyTexture()
    {
        if(!(this.waterDistributionTexture instanceof THREE.Texture)) return

        this.waterDistributionTexture.colorSpace = THREE.NoColorSpace
        this.waterDistributionTexture.flipY = false
        this.waterDistributionTexture.wrapS = THREE.ClampToEdgeWrapping
        this.waterDistributionTexture.wrapT = THREE.ClampToEdgeWrapping
        this.waterDistributionTexture.minFilter = THREE.LinearMipmapLinearFilter
        this.waterDistributionTexture.magFilter = THREE.LinearFilter
        this.waterDistributionTexture.generateMipmaps = true
        const maxAniso = this.experience.renderer?.instance?.capabilities?.getMaxAnisotropy?.() ?? 1
        this.waterDistributionTexture.anisotropy = Math.max(1, Math.min(8, maxAniso))
        this.waterDistributionTexture.needsUpdate = true

        for(const mesh of this.waterMeshes)
        {
            if(!(mesh instanceof THREE.Mesh)) continue
            const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const patched = sources.map((mat) => this.createWaterMaterial(mat))
            mesh.material = Array.isArray(mesh.material) ? patched : patched[0]
        }

        this.applyBaseTintToFlatMeshes()
    }

    applyBaseTintToFlatMeshes()
    {
        for(const mesh of this.flatTintMeshes)
        {
            if(!(mesh instanceof THREE.Mesh)) continue
            const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
            const tinted = sources.map((mat) => this.createFlatTintMaterial(mat))
            mesh.material = Array.isArray(mesh.material) ? tinted : tinted[0]
        }
    }

    createWaterMaterial(baseMaterial)
    {
        const material = baseMaterial?.clone?.() ?? baseMaterial
        if(!material) return material

        applyMatteWaterMaterial(material)
        material.alphaMap = this.waterDistributionTexture
        material.transparent = true
        material.alphaTest = 0.5
        material.depthWrite = false
        material.side = THREE.DoubleSide
        material.userData = material.userData || {}
        material.userData.isRecuperationVisibleGradientMaterial = true

        const uniforms = {
            waterMask:      { value: this.waterDistributionTexture },
            colorDeep:      { value: this.colorDeep.clone() },
            colorMid:       { value: this.colorMid.clone() },
            colorLight:     { value: this.colorLight.clone() },
            localTime:      { value: this.localTime },
            opacity:        { value: this.opacity },
            scale:          { value: this.scale },
            speed:          { value: this.speed },
            thresholdMid:   { value: this.thresholdMid },
            thresholdLight: { value: this.thresholdLight }
        }
        material.userData.recuperationVisibleGradientUniforms = uniforms

        material.onBeforeCompile = (shader) =>
        {
            shader.uniforms.uWaterMask          = uniforms.waterMask
            shader.uniforms.uWaterColorDeep     = uniforms.colorDeep
            shader.uniforms.uWaterColorMid      = uniforms.colorMid
            shader.uniforms.uWaterColorLight    = uniforms.colorLight
            shader.uniforms.uWaterTime          = uniforms.localTime
            shader.uniforms.uOpacity            = uniforms.opacity
            shader.uniforms.uWaterScale         = uniforms.scale
            shader.uniforms.uWaterSpeed         = uniforms.speed
            shader.uniforms.uWaterThresholdMid  = uniforms.thresholdMid
            shader.uniforms.uWaterThresholdLight = uniforms.thresholdLight

            applyStandardMaterialPatch(shader, recuperationWaterVisibleGradientShaderChunks)
            stripSpecularReflectionsFromShader(shader)
        }
        material.customProgramCacheKey = () =>
        {
            const base = typeof baseMaterial?.customProgramCacheKey === 'function'
                ? baseMaterial.customProgramCacheKey()
                : ''
            return `${base}__recuperationWaterV4`
        }
        material.needsUpdate = true
        this.runtimeMaterials.push(material)
        return material
    }

    createFlatTintMaterial(baseMaterial)
    {
        const material = baseMaterial?.clone?.() ?? baseMaterial
        if(!material) return material

        applyMatteWaterMaterial(material)
        material.color?.copy?.(this.colorDeep)
        material.emissive?.set?.(0x000000)
        material.needsUpdate = true
        this.runtimeMaterials.push(material)
        return material
    }

    syncMaterialUniforms()
    {
        for(const material of this.runtimeMaterials)
        {
            const u = material?.userData?.recuperationVisibleGradientUniforms
            if(!u) continue

            u.colorDeep.value.copy(this.colorDeep)
            u.colorMid.value.copy(this.colorMid)
            u.colorLight.value.copy(this.colorLight)
            u.opacity.value        = this.opacity
            u.scale.value          = this.scale
            u.speed.value          = this.speed
            u.thresholdMid.value   = this.thresholdMid
            u.thresholdLight.value = this.thresholdLight
            material.color?.copy?.(this.colorDeep)
        }
    }

    update()
    {
        this.localTime = this.experience.time.elapsed * 0.001

        for(const material of this.runtimeMaterials)
        {
            const u = material?.userData?.recuperationVisibleGradientUniforms
            if(!u) continue
            u.localTime.value = this.localTime
        }
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled) return

        this.debugFolder = this.debugParentFolder || this.debug.addFolder('Plan eau', { expanded: false })

        this.debug.addColorBinding(this.debugFolder, this, 'colorDeep',  { label: 'Profond' })
            ?.on?.('change', () => this.syncMaterialUniforms())
        this.debug.addColorBinding(this.debugFolder, this, 'colorMid',   { label: 'Mi-ton' })
            ?.on?.('change', () => this.syncMaterialUniforms())
        this.debug.addColorBinding(this.debugFolder, this, 'colorLight', { label: 'Reflet' })
            ?.on?.('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.debugFolder, this, 'opacity', { label: 'Opacite', min: 0, max: 1, step: 0.01 })
            ?.on?.('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.debugFolder, this, 'scale', { label: 'Echelle', min: 0.05, max: 2.0, step: 0.01 })
            ?.on?.('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.debugFolder, this, 'speed', { label: 'Vitesse derive', min: 0, max: 2.0, step: 0.001 })
            ?.on?.('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.debugFolder, this, 'thresholdMid', { label: 'Seuil mi-ton', min: 0, max: 1, step: 0.01 })
            ?.on?.('change', () => this.syncMaterialUniforms())

        this.debug.addBinding(this.debugFolder, this, 'thresholdLight', { label: 'Seuil reflet', min: 0, max: 1, step: 0.01 })
            ?.on?.('change', () => this.syncMaterialUniforms())
    }

    destroy()
    {
        for(const material of this.runtimeMaterials) material?.dispose?.()
        this.runtimeMaterials = []
        this.waterMeshes    = null
        this.flatTintMeshes = null
        this.recuperationModel = null
    }
}
