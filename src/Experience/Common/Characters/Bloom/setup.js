import * as THREE from 'three'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import Experience from '../../../Experience.js'
import BloomRailSystem from '../../Rails/BloomRailSystem.js'
import * as BloomConstants from '../Bloom.constants.js'

/**
 * Construit le modèle 3D de Bloom, applique les matériaux et l ajoute à la scène.
 */
export function setModel()
{
    this.model = SkeletonUtils.clone(this.resource.scene)
    this.model.name = '__bloomRoot'
    this.setupAnimation()

    const bounds = new THREE.Box3().setFromObject(this.model)
    const size = bounds.getSize(new THREE.Vector3())
    const targetHeight = 1.7
    this.baseScale = size.y > 0 ? targetHeight / size.y : 1
    this.unscaledBaseY = -bounds.min.y

    this.applyVisualScale()
    this.baseYaw = this.model.rotation.y + this.tuning.facingOffsetRadians
    this.model.position.y = this.baseY

    this.model.traverse((child) =>
    {
        if(!child?.isMesh)
        {
            return
        }

        child.castShadow = true
        child.receiveShadow = true
    })

    this.model.traverse((child) =>
    {
        if(!child?.isMesh)
        {
            return
        }

        if(!this.isBloomTargetMesh(child))
        {
            return
        }

        this.applyBloomColorTexture(child)
    })

    this.scene.add(this.model)
}


/**
 * Initialise le mixer et la lecture des clips d animation.
 */
export function setupAnimation()
{
    const sourceClips = Array.isArray(this.resource?.animations) ? this.resource.animations : []
    if(!this.model || sourceClips.length === 0)
    {
        return
    }

    this.animation.mixer = new THREE.AnimationMixer(this.model)
    this.animation.clips = sourceClips
    this.animation.activeClipName = sourceClips[0].name || '0'
    this.playAnimationClip(this.animation.activeClipName)
}


/**
 * Résout un clip par nom ou index.
 */
export function resolveAnimationClip(clipKey)
{
    if(this.animation.clips.length === 0)
    {
        return null
    }

    const asIndex = Number.parseInt(String(clipKey), 10)
    if(Number.isInteger(asIndex) && asIndex >= 0 && asIndex < this.animation.clips.length)
    {
        return this.animation.clips[asIndex]
    }

    return this.animation.clips.find((clip) => clip?.name === clipKey) || this.animation.clips[0]
}


/**
 * Lance un clip d animation et gère la transition.
 */
export function playAnimationClip(clipKey)
{
    if(!this.animation.mixer || this.animation.clips.length === 0)
    {
        return
    }

    const targetClip = this.resolveAnimationClip(clipKey)
    if(!targetClip)
    {
        return
    }

    if(this.animation.action)
    {
        this.animation.action.stop()
        this.animation.action = null
    }

    const action = this.animation.mixer.clipAction(targetClip)
    this.animation.mirrorArmsFromAnimation = this.shouldMirrorArmsFromAnimation(targetClip)
    action.enabled = true
    action.clampWhenFinished = !this.animation.loop
    action.setLoop(this.animation.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    action.timeScale = this.animation.speed

    if(this.animation.play)
    {
        action.play()
        action.paused = false
    }
    else
    {
        action.play()
        action.paused = true
    }

    this.animation.action = action
    this.animation.activeClipName = targetClip.name || String(this.animation.clips.indexOf(targetClip))
}


/**
 * Détermine si la recopie d animation inter-bras doit rester active.
 * Si le clip pilote déjà plusieurs tracks de bras, on n écrase pas ces rotations.
 */
export function shouldMirrorArmsFromAnimation(clip)
{
    const tracks = Array.isArray(clip?.tracks) ? clip.tracks : []
    let armRotationTrackCount = 0

    for(const track of tracks)
    {
        const trackName = String(track?.name || '').toLowerCase()
        const isArmRotationTrack = trackName.includes(BloomConstants.ARM_MESH_NAME_TOKEN)
            && trackName.endsWith('.quaternion')
        if(isArmRotationTrack)
        {
            armRotationTrackCount += 1
        }
    }

    return armRotationTrackCount <= 1
}


/**
 * Synchronise lecture/pause/vitesse/loop de l animation active.
 */
export function refreshAnimationPlaybackState()
{
    const action = this.animation.action
    if(!action)
    {
        return
    }

    const normalizedSpeed = Math.max(0, this.animation.speed)
    action.timeScale = normalizedSpeed
    action.clampWhenFinished = !this.animation.loop
    action.setLoop(this.animation.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)

    if(this.animation.play)
    {
        const clipDuration = action.getClip()?.duration
        if(Number.isFinite(clipDuration) && clipDuration > 0 && action.time >= (clipDuration - 1e-4))
        {
            action.reset()
        }

        action.enabled = true
        action.paused = false
        action.play()
        return
    }

    action.paused = true
}


/**
 * Indique si l animation pilote actuellement le corps.
 */
export function isAnimationDrivingModel()
{
    return Boolean(this.animation.action && this.animation.clips.length > 0)
}


/**
 * Place Bloom sur un noeud de rail si un point valide existe.
 */
export function spawnOnRailNodeIfAvailable()
{
    if(!this.model || !this.rails?.hasRails?.())
    {
        return
    }

    const firstNodeId = this.rails.graph?.nodes?.[0]?.id
    if(typeof firstNodeId !== 'string' || firstNodeId.trim() === '')
    {
        return
    }

    const spawnPosition = this.rails.getNodePosition(firstNodeId)
    if(!(spawnPosition instanceof THREE.Vector3))
    {
        return
    }

    const groundY = this.resolveGroundYAt(
        spawnPosition.x,
        spawnPosition.z,
        spawnPosition.y
    )

    this.model.position.x = spawnPosition.x
    this.model.position.z = spawnPosition.z
    this.model.position.y = groundY + this.motion.heightOffset + this.baseY
}


/**
 * Détermine si un mesh doit recevoir le shader matériau de Bloom.
 */
export function isBloomTargetMesh(mesh)
{
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const hasMat2Material = materials.some((material) =>
    {
        const name = String(material?.name || '').toLowerCase()
        return name === 'mat.2' || name.includes('mat.2')
    })
    const meshName = String(mesh.name || '').toLowerCase()
    const isArmTarget = meshName === 'bras' || meshName === 'bras 1'
    const isTargetMesh = meshName === 'bloom-face' || meshName.includes('bloom-face')
    return isTargetMesh || hasMat2Material || isArmTarget
}


/**
 * Applique les textures couleur/transmission de Bloom sur un mesh cible.
 */
export function applyBloomColorTexture(mesh)
{
    if(!this.bloomColorTexture && !this.bloomTransmissionTexture)
    {
        return
    }

    this.ensureMeshUvAttribute(mesh)
    this.ensureMeshNormals(mesh)
    const hasUv = Boolean(mesh?.geometry?.getAttribute?.('uv'))

    if(this.bloomColorTexture)
    {
        this.bloomColorTexture.flipY = false
        this.bloomColorTexture.colorSpace = THREE.SRGBColorSpace
        this.bloomColorTexture.needsUpdate = true
    }

    if(this.bloomColorTexture2)
    {
        this.bloomColorTexture2.flipY = false
        this.bloomColorTexture2.colorSpace = THREE.SRGBColorSpace
        this.bloomColorTexture2.needsUpdate = true
    }

    if(this.bloomTransmissionTexture)
    {
        this.bloomTransmissionTexture.flipY = false
        if('NoColorSpace' in THREE)
        {
            this.bloomTransmissionTexture.colorSpace = THREE.NoColorSpace
        }
        this.bloomTransmissionTexture.needsUpdate = true
    }

    if(this.bloomTransmissionTexture2)
    {
        this.bloomTransmissionTexture2.flipY = false
        if('NoColorSpace' in THREE)
        {
            this.bloomTransmissionTexture2.colorSpace = THREE.NoColorSpace
        }
        this.bloomTransmissionTexture2.needsUpdate = true
    }

    if(this.bloomReflectionEnvTexture)
    {
        this.bloomReflectionEnvTexture.mapping = THREE.EquirectangularReflectionMapping
        if('NoColorSpace' in THREE)
        {
            this.bloomReflectionEnvTexture.colorSpace = THREE.NoColorSpace
        }
        this.bloomReflectionEnvTexture.needsUpdate = true
    }

    const transmissionTexture = this.getTransmissionTextureForMesh(mesh)
    const colorTexture = this.getColorTextureForMesh(mesh)

    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const nextMaterials = []

    for(const sourceMaterial of sourceMaterials)
    {
        if(!sourceMaterial)
        {
            nextMaterials.push(sourceMaterial)
            continue
        }

        const material = sourceMaterial instanceof THREE.MeshPhysicalMaterial
            ? sourceMaterial
            : new THREE.MeshPhysicalMaterial({
                name: sourceMaterial.name,
                color: sourceMaterial.color?.clone?.() ?? new THREE.Color('#ffffff'),
                roughness: typeof sourceMaterial.roughness === 'number' ? sourceMaterial.roughness : this.tuning.roughness,
                metalness: typeof sourceMaterial.metalness === 'number' ? sourceMaterial.metalness : this.tuning.metalness
            })

        // Preserve skinning/morph flags from GLTF materials so bone animation keeps deforming the mesh.
        material.skinning = Boolean(mesh?.isSkinnedMesh || sourceMaterial?.skinning)
        material.morphTargets = Boolean(sourceMaterial?.morphTargets)
        material.morphNormals = Boolean(sourceMaterial?.morphNormals)

        if(colorTexture)
        {
            material.map = colorTexture
        }

        material.color?.set?.('#ffffff')
        material.emissive?.set?.('#000000')
        if(typeof material.emissiveIntensity === 'number')
        {
            material.emissiveIntensity = 1
        }

        if(transmissionTexture && hasUv)
        {
            material.transmission = this.tuning.transmission
            material.transmissionMap = transmissionTexture
            material.thickness = this.tuning.thickness
            material.ior = this.tuning.ior
            material.alphaMap = null
            material.alphaTest = 0
            material.transparent = true
            material.opacity = this.tuning.opacity
            material.side = THREE.DoubleSide
        }
        else
        {
            material.transmission = 0
            material.transmissionMap = null
            material.alphaMap = null
            material.alphaTest = 0
            material.transparent = false
            material.opacity = 1
            material.side = THREE.FrontSide
        }

        if(transmissionTexture && hasUv)
        {
            material.specularIntensityMap = transmissionTexture
            material.specularIntensity = this.tuning.specularIntensity
        }
        else
        {
            material.specularIntensityMap = null
        }

        material.roughness = this.tuning.roughness
        material.metalness = this.tuning.metalness
        if(this.bloomReflectionEnvTexture)
        {
            material.envMap = this.bloomReflectionEnvTexture
            material.envMapIntensity = this.tuning.envMapIntensity
        }
        this.applyBloomReflectionMaskToMaterial(material, transmissionTexture, hasUv)

        material.needsUpdate = true
        nextMaterials.push(material)
    }

    mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0]
}


/**
 * Utilise la texture de transmission comme masque de visibilité des réflexions envMap.
 */
export function applyBloomReflectionMaskToMaterial(material, reflectionMaskTexture, hasUv)
{
    if(!(material instanceof THREE.MeshPhysicalMaterial))
    {
        return
    }

    const canApplyReflectionMask = Boolean(reflectionMaskTexture && hasUv)
    if(!canApplyReflectionMask)
    {
        material.onBeforeCompile = () => {}
        material.customProgramCacheKey = () => 'default'
        return
    }

    material.onBeforeCompile = (shader) =>
    {
        shader.uniforms[BloomConstants.BLOOM_REFLECTION_MASK_UNIFORM_NAME] = { value: reflectionMaskTexture }
        shader.uniforms[BloomConstants.BLOOM_REFLECTION_MASK_FACTOR_UNIFORM_NAME] = { value: 1.0 }

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
uniform sampler2D ${BloomConstants.BLOOM_REFLECTION_MASK_UNIFORM_NAME};
uniform float ${BloomConstants.BLOOM_REFLECTION_MASK_FACTOR_UNIFORM_NAME};`
        )

        shader.fragmentShader = shader.fragmentShader.replace(
            BloomConstants.BLOOM_REFLECTION_MASK_SHADER_ANCHOR,
            `${BloomConstants.BLOOM_REFLECTION_MASK_SHADER_ANCHOR}
#ifdef USE_TRANSMISSIONMAP
    float bloomReflectionMask = texture2D(${BloomConstants.BLOOM_REFLECTION_MASK_UNIFORM_NAME}, vTransmissionMapUv).r;
    reflectedLight.indirectSpecular *= mix(1.0, bloomReflectionMask, ${BloomConstants.BLOOM_REFLECTION_MASK_FACTOR_UNIFORM_NAME});
#endif`
        )
    }

    material.customProgramCacheKey = () => BloomConstants.BLOOM_REFLECTION_MASK_SHADER_KEY
}


/**
 * Choisit la texture de transmission à utiliser pour un mesh.
 */
export function getTransmissionTextureForMesh(mesh)
{
    const meshName = String(mesh?.name || '').trim().toLowerCase()
    if(meshName.includes(BloomConstants.ARM_MESH_NAME_TOKEN) && this.bloomTransmissionTexture2)
    {
        return this.bloomTransmissionTexture2
    }

    return this.bloomTransmissionTexture
}


/**
 * Choisit la texture couleur à utiliser pour un mesh.
 */
export function getColorTextureForMesh(mesh)
{
    const meshName = String(mesh?.name || '').trim().toLowerCase()
    if(meshName.includes(BloomConstants.ARM_MESH_NAME_TOKEN) && this.bloomColorTexture2)
    {
        return this.bloomColorTexture2
    }

    if(meshName === 'bloom' && this.bloomColorTexture)
    {
        return this.bloomColorTexture
    }

    return null
}


/**
 * Garantit la présence d UV sur un mesh avant sampling texture.
 */
export function ensureMeshUvAttribute(mesh, forceRegenerate = false)
{
    const geometry = mesh?.geometry
    if(!(geometry instanceof THREE.BufferGeometry))
    {
        return false
    }

    if(geometry.getAttribute('uv'))
    {
        if(forceRegenerate && geometry.userData?.bloomGeneratedUv)
        {
            // recompute with latest tuning.uvZoom
        }
        else
        {
            return true
        }
    }

    const position = geometry.getAttribute('position')
    if(!position)
    {
        return false
    }

    geometry.computeBoundingBox()
    const bounds = geometry.boundingBox
    if(!bounds)
    {
        return false
    }

    const size = new THREE.Vector3()
    bounds.getSize(size)
    const minAxis = Math.min(size.x, size.y, size.z)
    const useXY = minAxis === size.z && size.x >= 1e-5 && size.y >= 1e-5
    const useXZ = minAxis === size.y && size.x >= 1e-5 && size.z >= 1e-5
    const useYZ = minAxis === size.x && size.y >= 1e-5 && size.z >= 1e-5

    const uvArray = new Float32Array(position.count * 2)
    for(let index = 0; index < position.count; index++)
    {
        const x = position.getX(index)
        const y = position.getY(index)
        const z = position.getZ(index)

        let u = 0
        let v = 0

        if(useXY)
        {
            u = (x - bounds.min.x) / Math.max(size.x, 1e-5)
            v = (y - bounds.min.y) / Math.max(size.y, 1e-5)
        }
        else if(useXZ)
        {
            u = (x - bounds.min.x) / Math.max(size.x, 1e-5)
            v = (z - bounds.min.z) / Math.max(size.z, 1e-5)
        }
        else if(useYZ)
        {
            u = (y - bounds.min.y) / Math.max(size.y, 1e-5)
            v = (z - bounds.min.z) / Math.max(size.z, 1e-5)
        }

        const zoom = Math.max(0.05, this.tuning.uvZoom)
        const zoomedU = ((u - 0.5) / zoom) + 0.5
        const zoomedV = ((v - 0.5) / zoom) + 0.5
        uvArray[index * 2] = THREE.MathUtils.clamp(zoomedU, 0, 1)
        uvArray[(index * 2) + 1] = 1 - THREE.MathUtils.clamp(zoomedV, 0, 1)
    }

    geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2))
    geometry.userData.bloomGeneratedUv = true
    return false
}


/**
 * Rafraîchit tous les matériaux des meshes cibles après tuning.
 */
export function refreshBloomTargetMaterials({ forceRegenerateUv = false } = {})
{
    if(!this.model)
    {
        return
    }

    this.model.traverse((child) =>
    {
        if(!child?.isMesh || !this.isBloomTargetMesh(child))
        {
            return
        }

        if(forceRegenerateUv)
        {
            this.ensureMeshUvAttribute(child, true)
        }
        this.applyBloomColorTexture(child)
    })
}


/**
 * Met à jour l intensité de réflexion sur les matériaux Bloom.
 */
export function refreshBloomEnvMapIntensity()
{
    if(!this.model)
    {
        return
    }

    this.model.traverse((child) =>
    {
        if(!child?.isMesh || !this.isBloomTargetMesh(child))
        {
            return
        }

        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for(const material of materials)
        {
            if(!(material instanceof THREE.MeshPhysicalMaterial))
            {
                continue
            }

            material.envMapIntensity = this.tuning.envMapIntensity
            material.needsUpdate = true
        }
    })
}


/**
 * Applique les paramètres PBR/transmission de Bloom sur les matériaux.
 */
export function refreshBloomMaterialTuning()
{
    if(!this.model)
    {
        return
    }

    this.model.traverse((child) =>
    {
        if(!child?.isMesh || !this.isBloomTargetMesh(child))
        {
            return
        }

        const hasUv = Boolean(child.geometry?.getAttribute?.('uv'))
        const hasTransmissionTexture = Boolean(this.getTransmissionTextureForMesh(child)) && hasUv
        const materials = Array.isArray(child.material) ? child.material : [child.material]

        for(const material of materials)
        {
            if(!(material instanceof THREE.MeshPhysicalMaterial))
            {
                continue
            }

            material.roughness = this.tuning.roughness
            material.metalness = this.tuning.metalness
            material.envMapIntensity = this.tuning.envMapIntensity
            material.specularIntensity = this.tuning.specularIntensity

            if(hasTransmissionTexture)
            {
                material.transmission = this.tuning.transmission
                material.thickness = this.tuning.thickness
                material.ior = this.tuning.ior
                material.opacity = this.tuning.opacity
            }

            material.needsUpdate = true
        }
    })
}


/**
 * Recalcule les normales si nécessaire pour un rendu stable.
 */
export function ensureMeshNormals(mesh)
{
    const geometry = mesh?.geometry
    if(!(geometry instanceof THREE.BufferGeometry))
    {
        return
    }

    if(!geometry.getAttribute('normal'))
    {
        geometry.computeVertexNormals()
    }
}


/**
 * Repère les os/noeuds des bras pour l animation procédurale.
 */
export function setArmRig()
{
    const symmetryCandidates = []

    this.model.traverse((child) =>
    {
        const nodeName = child.name?.toLowerCase() || ''
        const isArmGroup = nodeName.includes('bras')
        const isHand = nodeName.includes('main')

        if(!isArmGroup && !isHand)
        {
            return
        }

        const isRightSide = child.position.x >= 0

        this.armNodes.push({
            node: child,
            baseQuaternion: child.quaternion.clone(),
            axis: isArmGroup ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0),
            amplitude: isArmGroup ? 0.2 : 0.7,
            direction: isArmGroup ? 1 : (isRightSide ? 1 : -1),
            phaseOffset: isArmGroup ? 0 : (isRightSide ? 0 : Math.PI),
            frequencyMultiplier: isArmGroup ? 1 : 1.1
        })

        symmetryCandidates.push({
            node: child,
            type: isArmGroup ? 'arm' : 'hand',
            side: isRightSide ? 'right' : 'left',
            baseQuaternion: child.quaternion.clone()
        })
    })

    this.armAnimationPairs = this.buildArmAnimationPairs(symmetryCandidates)
}


/**
 * Construit les couples de bras pour reproduire l animation sur le second bras.
 */
export function buildArmAnimationPairs(candidates)
{
    const pairs = []
    const leftByType = new Map()
    const rightByType = new Map()

    for(const candidate of candidates)
    {
        if(candidate.side === 'left' && !leftByType.has(candidate.type))
        {
            leftByType.set(candidate.type, candidate)
        }

        if(candidate.side === 'right' && !rightByType.has(candidate.type))
        {
            rightByType.set(candidate.type, candidate)
        }
    }

    for(const type of ['arm', 'hand'])
    {
        const left = leftByType.get(type)
        const right = rightByType.get(type)
        if(!left || !right)
        {
            continue
        }

        pairs.push({
            leftNode: left.node,
            rightNode: right.node,
            leftBaseQuaternion: left.baseQuaternion,
            rightBaseQuaternion: right.baseQuaternion
        })
    }

    return pairs
}


/**
 * Crée une représentation de secours si le modèle Bloom est indisponible.
 */
export function setFallback()
{
    this.fallback = new THREE.Mesh(
        new THREE.TorusKnotGeometry(0.45, 0.16, 150, 24),
        new THREE.MeshStandardMaterial({
            color: '#f0f2ff',
            roughness: 0.2,
            metalness: 0.4
        })
    )

    this.fallback.name = '__bloomRoot'
    this.fallback.position.y = 0.2
    this.fallback.castShadow = true
    this.scene.add(this.fallback)
    this.applyVisualScale()
}


/**
 * Applique l échelle visuelle globale du personnage.
 */
export function applyVisualScale()
{
    const multiplier = Math.max(0.15, this.scaleState.visualScale)

    if(this.model)
    {
        const scale = this.baseScale * multiplier
        this.model.scale.setScalar(scale)
        this.baseY = this.unscaledBaseY * scale
        return
    }

    if(this.fallback)
    {
        this.fallback.scale.setScalar(multiplier)
    }
}


/**
 * Met à jour le contexte de scène (target, rails, ground meshes).
 */
export function setSceneContext({ scene = null, groundMeshes = null, rails = null, target = null } = {})
{
    if(scene && scene !== this.scene)
    {
        if(this.model)
        {
            this.scene.remove(this.model)
        }
        if(this.fallback)
        {
            this.scene.remove(this.fallback)
        }

        this.scene = scene

        if(this.model)
        {
            this.scene.add(this.model)
        }
        if(this.fallback)
        {
            this.scene.add(this.fallback)
        }

        this.rails?.setScene?.(this.scene)
    }

    if(Array.isArray(groundMeshes))
    {
        this.follow.groundMeshes = groundMeshes
    }

    if(rails)
    {
        this.rails?.setRails?.(rails)
    }

    if(target)
    {
        this.follow.target = target
        this.follow.enabled = true
    }

    if(this.rails?.hasRails?.())
    {
        this.spawnOnRailNodeIfAvailable()
        if(this.model)
        {
            this.railAnchorPosition.copy(this.model.position)
            this.railAnchorPosition.y -= this.baseY
            this.previousAnchorPosition.copy(this.railAnchorPosition)
        }
        return
    }

    if(target?.position instanceof THREE.Vector3)
    {
        this.railAnchorPosition.copy(target.position)
        this.railAnchorPosition.x += 1.5
        this.railAnchorPosition.z += 1.5

        const groundY = this.resolveGroundYAt(
            this.railAnchorPosition.x,
            this.railAnchorPosition.z,
            this.railAnchorPosition.y
        )
        this.railAnchorPosition.y = groundY + this.motion.heightOffset

        if(this.model)
        {
            this.model.position.copy(this.railAnchorPosition)
            this.model.position.y += this.baseY
        }
        this.previousAnchorPosition.copy(this.railAnchorPosition)
    }
}


/**
 * Expose les contrôles debug de Bloom (mouvement, rails, matériaux).
 */
export function setDebug()
{
    if(!this.debug?.isDebugEnabled)
    {
        return
    }

    this.debugFolder = this.debug.addFolder('💧 Bloom', { expanded: false })

    this.debug.addBinding(this.debugFolder, this.scaleState, 'visualScale', {
        label: 'size',
        min: 0.15,
        max: 2.5,
        step: 0.01
    }).on('change', () =>
    {
        this.applyVisualScale()
    })

    this.debug.addBinding(this.debugFolder, this.tuning, 'facingOffsetRadians', {
        label: 'Decalage d orientation',
        min: -Math.PI,
        max: Math.PI,
        step: 0.01
    }).on('change', ({ value }) =>
    {
        this.tuning.facingOffsetRadians = value
        if(this.model)
        {
            this.baseYaw = this.model.rotation.y + value
        }
    })

    this.debug.addBinding(this.debugFolder, this.tuning, 'lookTurnSpeed', {
        label: 'Vitesse de rotation',
        min: 0.1,
        max: 30,
        step: 0.1
    })

    this.debug.addBinding(this.debugFolder, this.tuning, 'uvZoom', {
        label: 'Zoom de texture',
        min: 0.2,
        max: 3,
        step: 0.01
    }).on('change', ({ value }) =>
    {
        this.tuning.uvZoom = value
        this.refreshBloomTargetMaterials({ forceRegenerateUv: true })
    })

    this.materialFolder = this.debug.addFolder('Materiau de Bloom', {
        parent: this.debugFolder,
        expanded: false
    })

    this.debug.addBinding(this.materialFolder, this.tuning, 'envMapIntensity', {
        label: 'Intensite de reflexion',
        min: 0,
        max: 5,
        step: 0.01
    }).on('change', ({ value }) =>
    {
        this.tuning.envMapIntensity = value
        this.refreshBloomMaterialTuning()
    })

    this.debug.addBinding(this.materialFolder, this.tuning, 'roughness', {
        label: 'Rugosite',
        min: 0,
        max: 1,
        step: 0.01
    }).on('change', ({ value }) =>
    {
        this.tuning.roughness = value
        this.refreshBloomMaterialTuning()
    })

    this.debug.addBinding(this.materialFolder, this.tuning, 'metalness', {
        label: 'Metal',
        min: 0,
        max: 1,
        step: 0.01
    }).on('change', ({ value }) =>
    {
        this.tuning.metalness = value
        this.refreshBloomMaterialTuning()
    })

    this.debug.addBinding(this.materialFolder, this.tuning, 'transmission', {
        label: 'Transmission',
        min: 0,
        max: 1,
        step: 0.01
    }).on('change', ({ value }) =>
    {
        this.tuning.transmission = value
        this.refreshBloomMaterialTuning()
    })

    this.debug.addBinding(this.materialFolder, this.tuning, 'thickness', {
        label: 'Epaisseur',
        min: 0,
        max: 2,
        step: 0.01
    }).on('change', ({ value }) =>
    {
        this.tuning.thickness = value
        this.refreshBloomMaterialTuning()
    })

    this.debug.addBinding(this.materialFolder, this.tuning, 'ior', {
        label: 'Indice de refraction',
        min: 1,
        max: 2.5,
        step: 0.01
    }).on('change', ({ value }) =>
    {
        this.tuning.ior = value
        this.refreshBloomMaterialTuning()
    })

    this.debug.addBinding(this.materialFolder, this.tuning, 'specularIntensity', {
        label: 'Intensite speculaire',
        min: 0,
        max: 2,
        step: 0.01
    }).on('change', ({ value }) =>
    {
        this.tuning.specularIntensity = value
        this.refreshBloomMaterialTuning()
    })

    this.debug.addBinding(this.materialFolder, this.tuning, 'opacity', {
        label: 'Opacite',
        min: 0,
        max: 1,
        step: 0.01
    }).on('change', ({ value }) =>
    {
        this.tuning.opacity = value
        this.refreshBloomMaterialTuning()
    })

    if(this.animation.clips.length > 0)
    {
        this.animationFolder = this.debug.addFolder('Animation Bloom', {
            parent: this.debugFolder,
            expanded: false
        })

        const clipOptions = {}
        for(let index = 0; index < this.animation.clips.length; index++)
        {
            const clip = this.animation.clips[index]
            const clipName = clip?.name || `Clip ${index + 1}`
            clipOptions[clipName] = String(index)
        }

        const hasActiveValue = Object.values(clipOptions).includes(this.animation.activeClipName)
        if(!hasActiveValue)
        {
            this.animation.activeClipName = Object.values(clipOptions)[0]
        }

        this.debug.addBinding(this.animationFolder, this.animation, 'activeClipName', {
            label: 'Clip',
            options: clipOptions
        }).on('change', ({ value }) =>
        {
            this.animation.activeClipName = value
            this.playAnimationClip(value)
        })

        this.debug.addBinding(this.animationFolder, this.animation, 'play', {
            label: 'Lecture'
        }).on('change', ({ value }) =>
        {
            this.animation.play = value
            this.refreshAnimationPlaybackState()
        })

        this.debug.addBinding(this.animationFolder, this.animation, 'speed', {
            label: 'Vitesse animation',
            min: 0,
            max: 3,
            step: 0.01
        }).on('change', ({ value }) =>
        {
            this.animation.speed = value
            this.refreshAnimationPlaybackState()
        })

        this.debug.addBinding(this.animationFolder, this.animation, 'loop', {
            label: 'Boucle'
        }).on('change', ({ value }) =>
        {
            this.animation.loop = value
            this.refreshAnimationPlaybackState()
        })
    }

    this.debug.addBinding(this.debugFolder, this.motion, 'radius', {
        label: 'Rayon de flottement',
        min: 0,
        max: 20,
        step: 0.05
    })

    this.debug.addBinding(this.debugFolder, this.motion, 'bobAmplitude', {
        label: 'Amplitude de flottement',
        min: 0,
        max: 0.5,
        step: 0.005
    })

    this.debug.addBinding(this.debugFolder, this.motion, 'walkFrequency', {
        label: 'Frequence de marche',
        min: 0,
        max: 8,
        step: 0.01
    })

    this.debug.addBinding(this.debugFolder, this.motion, 'walkFrequencySpeedInfluence', {
        label: 'Influence de la vitesse sur la marche',
        min: 0,
        max: 3,
        step: 0.01
    })

    this.railsFolder = this.debug.addFolder('Rails de Bloom', {
        parent: this.debugFolder,
        expanded: false
    })

    this.debug.addBinding(this.railsFolder, this.rails.settings, 'speed', {
        label: 'Vitesse sur rail',
        min: 0.1,
        max: 20,
        step: 0.1
    })

    this.debug.addBinding(this.railsFolder, this.rails.settings, 'railSwitchDistance', {
        label: 'Distance de changement de rail',
        min: 0.1,
        max: 4,
        step: 0.05
    })

    this.debug.addBinding(this.railsFolder, this.rails.settings, 'endpointSwitchDistance', {
        label: 'Distance de changement en fin de rail',
        min: 0.1,
        max: 6,
        step: 0.05
    })

    this.debug.addBinding(this.railsFolder, this.rails.settings, 'showHelpers', {
        label: 'Afficher les rails'
    }).on('change', ({ value }) =>
    {
        this.rails.setHelpersVisible(value)
    })

    this.debug.addBinding(this.railsFolder, this.railEditor, 'addPointAtPlayer', {
        label: 'Ajouter un point a la position du joueur'
    })

    this.debug.addBinding(this.railsFolder, this.railEditor, 'startNewLineAtPlayer', {
        label: 'Demarrer une nouvelle ligne au joueur'
    })

    this.debug.addBinding(this.railsFolder, this.railEditor, 'clearLines', {
        label: 'Effacer les rails'
    })

    this.debug.addBinding(this.railsFolder, this.railEditor, 'exportLinesToConsole', {
        label: 'Exporter en JSON'
    })
}
