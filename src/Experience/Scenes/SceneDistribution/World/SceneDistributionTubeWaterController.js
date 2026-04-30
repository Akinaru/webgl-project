import * as THREE from 'three'
import {
    DEFAULT_RADIANS_PER_TUBE_FILL,
    FILL_PROGRESS_EPSILON,
    EMPTY_TUBE_OPACITY,
    FILLED_TUBE_OPACITY,
    EMPTY_TUBE_COLOR,
    FILLED_TUBE_COLOR,
    FILLED_TUBE_EMISSIVE,
    FILLED_TUBE_EMISSIVE_INTENSITY,
    FILL_EDGE_SOFTNESS,
    TUBE_GROUPS_BY_VALVE_TOKEN
} from './SceneDistributionTubeWaterController.constants.js'

const FILL_COORD_ATTRIBUTE = 'aDistributionFillCoord'
const FILL_UNIFORM = 'uDistributionFillProgress'
const FILL_EDGE_UNIFORM = 'uDistributionFillEdge'

export default class SceneDistributionTubeWaterController
{
    constructor({
        tubeWaterMeshes = [],
        getRightTurnAmountForValve = null,
        debug = null,
        debugParentFolder = null
    } = {})
    {
        this.tubeWaterMeshes = Array.isArray(tubeWaterMeshes) ? tubeWaterMeshes : []
        this.getRightTurnAmountForValve = typeof getRightTurnAmountForValve === 'function'
            ? getRightTurnAmountForValve
            : null
        this.debug = debug
        this.debugParentFolder = debugParentFolder
        this.settings = {
            radiansPerTubeFill: DEFAULT_RADIANS_PER_TUBE_FILL,
            fillEdgeSoftness: FILL_EDGE_SOFTNESS
        }

        this.emptyColor = new THREE.Color(EMPTY_TUBE_COLOR)
        this.filledColor = new THREE.Color(FILLED_TUBE_COLOR)
        this.filledEmissive = new THREE.Color(FILLED_TUBE_EMISSIVE)
        this.mixColor = new THREE.Color()
        this.mixEmissive = new THREE.Color()
        this.fillProgressByMeshUuid = new Map()
        this.tubeEntries = []
        this.tubeEntriesByValveToken = new Map()

        this.buildTubeEntries()
        this.applyFillState()
        this.setDebug()
    }

    buildTubeEntries()
    {
        const groupByName = new Map()
        for(const [valveToken, tubeNames] of Object.entries(TUBE_GROUPS_BY_VALVE_TOKEN))
        {
            for(const tubeName of tubeNames)
            {
                groupByName.set(String(tubeName).toLowerCase(), valveToken)
            }
        }

        for(const mesh of this.tubeWaterMeshes)
        {
            if(!(mesh instanceof THREE.Mesh))
            {
                continue
            }

            const meshName = String(mesh.name || '').toLowerCase()
            const valveToken = groupByName.get(meshName) ?? null

            this.ensureFillCoordAttribute(mesh)
            this.prepareTubeMaterials(mesh)
            this.tubeEntries.push({
                mesh,
                valveToken
            })
            this.fillProgressByMeshUuid.set(mesh.uuid, 0)
        }

        this.buildTubeGroups()
    }

    buildTubeGroups()
    {
        this.tubeEntriesByValveToken.clear()

        for(const entry of this.tubeEntries)
        {
            if(!entry.valveToken)
            {
                continue
            }

            const list = this.tubeEntriesByValveToken.get(entry.valveToken) ?? []
            list.push(entry)
            this.tubeEntriesByValveToken.set(entry.valveToken, list)
        }

        for(const entries of this.tubeEntriesByValveToken.values())
        {
            entries.sort((a, b) => this.getTubeIndex(a.mesh) - this.getTubeIndex(b.mesh))
        }
    }

    getTubeIndex(mesh)
    {
        const meshName = String(mesh?.name || '').toLowerCase()
        const match = meshName.match(/tube-water_(\d+)/)
        if(!match)
        {
            return Number.MAX_SAFE_INTEGER
        }

        const parsed = Number.parseInt(match[1], 10)
        return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
    }

    ensureFillCoordAttribute(mesh)
    {
        const geometry = mesh?.geometry
        if(!(geometry instanceof THREE.BufferGeometry))
        {
            return
        }

        if(geometry.getAttribute(FILL_COORD_ATTRIBUTE))
        {
            return
        }

        const position = geometry.getAttribute('position')
        if(!position)
        {
            return
        }

        geometry.computeBoundingBox()
        const bounds = geometry.boundingBox
        if(!bounds)
        {
            return
        }

        const size = bounds.getSize(new THREE.Vector3())
        const axis = this.resolveFillAxis(size)
        const min = bounds.min[axis]
        const range = Math.max(1e-5, size[axis])
        const values = new Float32Array(position.count)

        for(let index = 0; index < position.count; index++)
        {
            const coord = position.getComponent(index, axis === 'x' ? 0 : axis === 'y' ? 1 : 2)
            values[index] = THREE.MathUtils.clamp((coord - min) / range, 0, 1)
        }

        geometry.setAttribute(FILL_COORD_ATTRIBUTE, new THREE.BufferAttribute(values, 1))
    }

    resolveFillAxis(size)
    {
        const axisValues = [
            { axis: 'x', value: size.x },
            { axis: 'y', value: size.y },
            { axis: 'z', value: size.z }
        ]
        axisValues.sort((a, b) => b.value - a.value)
        return axisValues[0].axis
    }

    prepareTubeMaterials(mesh)
    {
        const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const nextMaterials = sourceMaterials.map((sourceMaterial) =>
        {
            const material = sourceMaterial?.clone?.() ?? sourceMaterial
            if(!material)
            {
                return material
            }

            material.transparent = true
            material.depthWrite = false
            material.userData = material.userData || {}
            material.userData.distributionTubeFillUniform = null
            material.userData.distributionTubeFillEdgeUniform = null
            material.onBeforeCompile = (shader) =>
            {
                shader.uniforms[FILL_UNIFORM] = { value: 0 }
                shader.uniforms[FILL_EDGE_UNIFORM] = { value: this.settings.fillEdgeSoftness }
                material.userData.distributionTubeFillUniform = shader.uniforms[FILL_UNIFORM]
                material.userData.distributionTubeFillEdgeUniform = shader.uniforms[FILL_EDGE_UNIFORM]

                shader.vertexShader = shader.vertexShader
                    .replace(
                        '#include <common>',
                        '#include <common>\nattribute float aDistributionFillCoord;\nvarying float vDistributionFillCoord;'
                    )
                    .replace(
                        '#include <uv_vertex>',
                        '#include <uv_vertex>\nvDistributionFillCoord = aDistributionFillCoord;'
                    )

                shader.fragmentShader = shader.fragmentShader
                    .replace(
                        '#include <common>',
                        '#include <common>\nuniform float uDistributionFillProgress;\nuniform float uDistributionFillEdge;\nvarying float vDistributionFillCoord;'
                    )
                    .replace(
                        'vec4 diffuseColor = vec4( diffuse, opacity );',
                        [
                            'vec4 diffuseColor = vec4( diffuse, opacity );',
                            'float reversedCoord = 1.0 - vDistributionFillCoord;',
                            'float fillMask = 1.0 - smoothstep(uDistributionFillProgress - uDistributionFillEdge, uDistributionFillProgress, reversedCoord);',
                            'diffuseColor.a *= fillMask;',
                            'if(diffuseColor.a <= 0.001) discard;'
                        ].join('\n')
                    )
            }
            material.customProgramCacheKey = () => 'distribution-tube-fill-v1'
            material.needsUpdate = true
            return material
        })

        mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0]
    }

    update()
    {
        if(!this.getRightTurnAmountForValve)
        {
            return
        }

        let hasChanged = false
        for(const [valveToken, entries] of this.tubeEntriesByValveToken.entries())
        {
            if(!Array.isArray(entries) || entries.length === 0)
            {
                continue
            }

            const rightTurnAmount = Math.max(0, Number(this.getRightTurnAmountForValve(valveToken)) || 0)
            const progressPerRadian = 1 / Math.max(0.001, this.settings.radiansPerTubeFill)
            const totalProgress = THREE.MathUtils.clamp(
                rightTurnAmount * progressPerRadian,
                0,
                entries.length
            )

            for(let index = 0; index < entries.length; index++)
            {
                const entry = entries[index]
                const nextProgress = THREE.MathUtils.clamp(totalProgress - index, 0, 1)
                const previousProgress = this.fillProgressByMeshUuid.get(entry.mesh.uuid) ?? 0

                if(Math.abs(nextProgress - previousProgress) <= FILL_PROGRESS_EPSILON)
                {
                    continue
                }

                this.fillProgressByMeshUuid.set(entry.mesh.uuid, nextProgress)
                hasChanged = true
            }
        }

        if(hasChanged)
        {
            this.applyFillState()
        }
    }

    applyFillState()
    {
        for(const entry of this.tubeEntries)
        {
            const progress = this.fillProgressByMeshUuid.get(entry.mesh.uuid) ?? 0
            const nextOpacity = THREE.MathUtils.lerp(EMPTY_TUBE_OPACITY, FILLED_TUBE_OPACITY, progress)
            const nextEmissiveIntensity = FILLED_TUBE_EMISSIVE_INTENSITY * progress

            const materials = Array.isArray(entry.mesh.material) ? entry.mesh.material : [entry.mesh.material]
            for(const material of materials)
            {
                if(!material)
                {
                    continue
                }

                if(material.color)
                {
                    this.mixColor.copy(this.emptyColor).lerp(this.filledColor, progress)
                    material.color.copy(this.mixColor)
                }

                if(material.emissive)
                {
                    this.mixEmissive.copy(this.emptyColor).lerp(this.filledEmissive, progress)
                    material.emissive.copy(this.mixEmissive)
                    material.emissiveIntensity = nextEmissiveIntensity
                }

                if(typeof material.opacity === 'number')
                {
                    material.opacity = nextOpacity
                }

                const fillUniform = material.userData?.distributionTubeFillUniform
                if(fillUniform)
                {
                    fillUniform.value = progress
                }
                const fillEdgeUniform = material.userData?.distributionTubeFillEdgeUniform
                if(fillEdgeUniform)
                {
                    fillEdgeUniform.value = this.settings.fillEdgeSoftness
                }

                material.needsUpdate = true
            }
        }
    }

    destroy()
    {
        this.tubeWaterMeshes = []
        this.tubeEntries = []
        this.tubeEntriesByValveToken.clear()
        this.getRightTurnAmountForValve = null
        this.fillProgressByMeshUuid.clear()
        this.debugFolder?.dispose?.()
        this.debugFolder = null
    }

    canRotateValveDirection(valveToken, direction = 1)
    {
        const entries = this.tubeEntriesByValveToken.get(String(valveToken || '').toLowerCase())
        if(!Array.isArray(entries) || entries.length === 0)
        {
            return true
        }

        let isFullyEmpty = true
        let isFullyFull = true
        for(const entry of entries)
        {
            const progress = this.fillProgressByMeshUuid.get(entry.mesh.uuid) ?? 0
            if(progress > FILL_PROGRESS_EPSILON)
            {
                isFullyEmpty = false
            }
            if(progress < (1 - FILL_PROGRESS_EPSILON))
            {
                isFullyFull = false
            }
        }

        if(direction < 0 && isFullyEmpty)
        {
            return false
        }

        if(direction > 0 && isFullyFull)
        {
            return false
        }

        return true
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled || !this.debugParentFolder)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('Remplissage tuyaux', {
            parent: this.debugParentFolder,
            expanded: false
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'radiansPerTubeFill', {
            label: 'Rotation pour remplir 1 tuyau',
            min: Math.PI * 0.25,
            max: Math.PI * 6,
            step: 0.01
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'fillEdgeSoftness', {
            label: 'Douceur front de remplissage',
            min: 0.001,
            max: 0.2,
            step: 0.001
        })
    }
}
