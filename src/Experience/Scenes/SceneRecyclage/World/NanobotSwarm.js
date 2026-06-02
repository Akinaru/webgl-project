import * as THREE from 'three'
import Experience from '../../../Experience.js'
import * as NanobotSwarmConstants from './NanobotSwarm.constants.js'

export default class NanobotSwarm
{
    constructor({
        sourceObject = null,
        getFocusPosition = null,
        debugParentFolder = null
    } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug
        this.sourceObject = sourceObject instanceof THREE.Object3D ? sourceObject : null
        this.getFocusPosition = typeof getFocusPosition === 'function' ? getFocusPosition : null
        this.debugParentFolder = debugParentFolder

        this.instanceMeshes = []
        this.runtimeMaterials = []
        this.localMatrices = []
        this.instanceStates = []
        this.group = new THREE.Group()
        this.group.name = '__nanobotSwarm'
        this.group.visible = false
        this.group.matrixAutoUpdate = false
        this.group.updateMatrix()

        this.dummy = new THREE.Object3D()
        this.rotationEuler = new THREE.Euler(0, 0, 0, 'YXZ')
        this.rotationQuaternion = new THREE.Quaternion()
        this.instanceScaleVector = new THREE.Vector3()
        this.composedMatrix = new THREE.Matrix4()
        this.finalMatrix = new THREE.Matrix4()
        this.focusPosition = new THREE.Vector3()

        this.settings = {
            count: NanobotSwarmConstants.NANOBOT_SWARM_COUNT,
            emissiveIntensity: NanobotSwarmConstants.NANOBOT_SWARM_EMISSIVE_INTENSITY
        }

        this.build()

        if(this.debug?.isDebugEnabled && this.debugParentFolder)
        {
            this.setDebug()
        }
    }

    build()
    {
        if(!this.sourceObject)
        {
            return
        }

        const sourceMeshes = []
        this.sourceObject.updateMatrixWorld(true)
        const inverseRootMatrix = this.sourceObject.matrixWorld.clone().invert()

        this.sourceObject.traverse((child) =>
        {
            if(!(child instanceof THREE.Mesh) || !child.geometry)
            {
                return
            }

            sourceMeshes.push(child)

            const localMatrix = inverseRootMatrix.clone().multiply(child.matrixWorld)
            this.localMatrices.push(localMatrix)
        })

        if(sourceMeshes.length === 0)
        {
            return
        }

        this.createInstanceStates()

        sourceMeshes.forEach((mesh, index) =>
        {
            const material = this.createRuntimeMaterial(mesh.material)
            const instancedMesh = new THREE.InstancedMesh(mesh.geometry, material, this.settings.count)
            instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
            instancedMesh.frustumCulled = false
            instancedMesh.castShadow = false
            instancedMesh.receiveShadow = false
            instancedMesh.renderOrder = 3
            this.instanceMeshes.push(instancedMesh)
            this.runtimeMaterials.push(material)
            this.group.add(instancedMesh)
            this.updateInstancesForMesh(index)
        })

        this.scene.add(this.group)
    }

    createInstanceStates()
    {
        this.instanceStates = []

        for(let index = 0; index < this.settings.count; index++)
        {
            this.instanceStates.push({
                angle: Math.random() * Math.PI * 2,
                radius: THREE.MathUtils.randFloat(
                    NanobotSwarmConstants.NANOBOT_SWARM_RADIUS_MIN,
                    NanobotSwarmConstants.NANOBOT_SWARM_RADIUS_MAX
                ),
                height: THREE.MathUtils.randFloat(
                    NanobotSwarmConstants.NANOBOT_SWARM_HEIGHT_MIN,
                    NanobotSwarmConstants.NANOBOT_SWARM_HEIGHT_MAX
                ),
                scale: THREE.MathUtils.randFloat(
                    NanobotSwarmConstants.NANOBOT_SWARM_SCALE_MIN,
                    NanobotSwarmConstants.NANOBOT_SWARM_SCALE_MAX
                ),
                orbitSpeed: THREE.MathUtils.randFloat(
                    NanobotSwarmConstants.NANOBOT_SWARM_ORBIT_SPEED_MIN,
                    NanobotSwarmConstants.NANOBOT_SWARM_ORBIT_SPEED_MAX
                ),
                bobAmplitude: THREE.MathUtils.randFloat(
                    NanobotSwarmConstants.NANOBOT_SWARM_BOB_AMPLITUDE_MIN,
                    NanobotSwarmConstants.NANOBOT_SWARM_BOB_AMPLITUDE_MAX
                ),
                bobSpeed: THREE.MathUtils.randFloat(
                    NanobotSwarmConstants.NANOBOT_SWARM_BOB_SPEED_MIN,
                    NanobotSwarmConstants.NANOBOT_SWARM_BOB_SPEED_MAX
                ),
                bobPhase: Math.random() * Math.PI * 2,
                rollPhase: Math.random() * Math.PI * 2
            })
        }
    }

    createRuntimeMaterial(sourceMaterial)
    {
        const runtimeMaterial = sourceMaterial?.clone?.() ?? new THREE.MeshStandardMaterial({ color: '#9be8ff' })
        const emissiveColor = new THREE.Color(NanobotSwarmConstants.NANOBOT_SWARM_EMISSIVE_COLOR)

        if(runtimeMaterial.color?.lerp)
        {
            runtimeMaterial.color.lerp(emissiveColor, NanobotSwarmConstants.NANOBOT_SWARM_COLOR_LIFT)
        }

        if(runtimeMaterial.emissive?.copy)
        {
            runtimeMaterial.emissive.copy(emissiveColor)
            runtimeMaterial.emissiveIntensity = this.settings.emissiveIntensity
        }

        runtimeMaterial.toneMapped = true
        runtimeMaterial.needsUpdate = true
        return runtimeMaterial
    }

    setVisible(isVisible = true)
    {
        this.group.visible = isVisible === true
    }

    update(deltaMs = 16.67)
    {
        if(this.group.visible !== true || this.instanceMeshes.length === 0)
        {
            return
        }

        const focus = this.getFocusPosition?.()
        if(!focus)
        {
            return
        }

        this.focusPosition.copy(focus)
        const deltaSeconds = Math.max(0, deltaMs * 0.001)
        const elapsedSeconds = (this.experience.time?.elapsed ?? 0) * 0.001

        for(let index = 0; index < this.instanceStates.length; index++)
        {
            const state = this.instanceStates[index]
            state.angle += state.orbitSpeed * deltaSeconds

            const x = this.focusPosition.x + Math.cos(state.angle) * state.radius
            const y = this.focusPosition.y + state.height + Math.sin((elapsedSeconds * state.bobSpeed) + state.bobPhase) * state.bobAmplitude
            const z = this.focusPosition.z + Math.sin(state.angle) * state.radius

            this.rotationEuler.set(
                Math.sin((elapsedSeconds * state.bobSpeed * 0.8) + state.rollPhase) * 0.18,
                -state.angle + Math.PI * 0.5,
                Math.sin((elapsedSeconds * state.bobSpeed * 0.6) + state.rollPhase) * 0.22
            )
            this.rotationQuaternion.setFromEuler(this.rotationEuler)
            this.instanceScaleVector.setScalar(state.scale)
            this.composedMatrix.compose(
                new THREE.Vector3(x, y, z),
                this.rotationQuaternion,
                this.instanceScaleVector
            )

            for(let meshIndex = 0; meshIndex < this.instanceMeshes.length; meshIndex++)
            {
                const localMatrix = this.localMatrices[meshIndex]
                this.finalMatrix.multiplyMatrices(this.composedMatrix, localMatrix)
                this.instanceMeshes[meshIndex].setMatrixAt(index, this.finalMatrix)
            }
        }

        for(const instancedMesh of this.instanceMeshes)
        {
            instancedMesh.instanceMatrix.needsUpdate = true
        }
    }

    updateInstancesForMesh(meshIndex)
    {
        const instancedMesh = this.instanceMeshes[meshIndex]
        if(!instancedMesh)
        {
            return
        }

        const localMatrix = this.localMatrices[meshIndex]
        for(let index = 0; index < this.settings.count; index++)
        {
            this.finalMatrix.copy(localMatrix)
            instancedMesh.setMatrixAt(index, this.finalMatrix)
        }
        instancedMesh.instanceMatrix.needsUpdate = true
    }

    setDebug()
    {
        this.debugFolder = this.debug.addFolder('Essaim nanobots', {
            parent: this.debugParentFolder,
            expanded: false
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'emissiveIntensity', {
            label: 'Intensite emissive',
            min: 0,
            max: 4,
            step: 0.01
        })?.on?.('change', () =>
        {
            for(const material of this.runtimeMaterials)
            {
                if(material?.emissive)
                {
                    material.emissiveIntensity = this.settings.emissiveIntensity
                    material.needsUpdate = true
                }
            }
        })
    }

    destroy()
    {
        this.debugFolder?.dispose?.()
        this.debugFolder = null

        if(this.group)
        {
            this.scene.remove(this.group)
        }

        for(const material of this.runtimeMaterials)
        {
            material?.dispose?.()
        }

        this.instanceMeshes = []
        this.runtimeMaterials = []
        this.localMatrices = []
        this.instanceStates = []
        this.group = null
        this.sourceObject = null
    }
}
