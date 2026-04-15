import * as THREE from 'three'
import Experience from '../../../Experience.js'

const QUARTER_TURN = Math.PI * 0.5
const FULL_TURN = Math.PI * 2
const ROTATION_AXIS = 'z'

export default class Scene1TubeWaterController
{
    constructor({ scene1Model } = {})
    {
        this.experience = new Experience()
        this.inputs = this.experience.inputs
        this.camera = this.experience.camera?.instance
        this.scene1Model = scene1Model
        this.tubeMeshes = this.scene1Model?.getTubeWaterMeshes?.() ?? []
        this.rotationTargets = this.scene1Model?.getTubeWaterRotationTargets?.() ?? []

        this.raycaster = new THREE.Raycaster()
        this.centerNdc = new THREE.Vector2(0, 0)
        this.turnDirectionByMeshUuid = new Map()
        this.hoveredTubeMesh = null
        this.bounds = new THREE.Box3()
        this.beforeCenterWorld = new THREE.Vector3()
        this.afterCenterWorld = new THREE.Vector3()
        this.beforeCenterLocal = new THREE.Vector3()
        this.afterCenterLocal = new THREE.Vector3()

        this.randomizeInitialRotations()
        this.setEvents()
    }

    randomizeInitialRotations()
    {
        for(const target of this.rotationTargets)
        {
            if(!target)
            {
                continue
            }

            const randomQuarterTurns = Math.floor(Math.random() * 4)
            if(randomQuarterTurns > 0)
            {
                this.rotateTargetAroundCenter(target, randomQuarterTurns * QUARTER_TURN)
            }

            const turnDirection = Math.random() >= 0.5 ? 1 : -1
            this.turnDirectionByMeshUuid.set(target.uuid, turnDirection)
        }
    }

    setEvents()
    {
        this.onMouseDown = (event) =>
        {
            if(event?.button !== 0)
            {
                return
            }

            const tubeMesh = this.hoveredTubeMesh || this.getTubeMeshAtCenter()
            if(!tubeMesh)
            {
                return
            }

            this.rotateTubeByQuarterTurn(tubeMesh)
        }

        this.inputs?.on?.('mousedown.scene1TubeWater', this.onMouseDown)
    }

    getTubeMeshAtCenter()
    {
        if(!this.camera || this.tubeMeshes.length === 0)
        {
            return null
        }

        this.raycaster.setFromCamera(this.centerNdc, this.camera)
        const hits = this.raycaster.intersectObjects(this.tubeMeshes, false)
        return hits[0]?.object ?? null
    }

    update()
    {
        this.hoveredTubeMesh = this.getTubeMeshAtCenter()
    }

    isHoveringTube()
    {
        return Boolean(this.hoveredTubeMesh)
    }

    rotateTubeByQuarterTurn(mesh)
    {
        const rotationTarget = this.scene1Model?.getTubeWaterRotationTargetFromObject?.(mesh) ?? mesh
        if(!rotationTarget)
        {
            return
        }

        const direction = this.turnDirectionByMeshUuid.get(rotationTarget.uuid) ?? 1
        this.rotateTargetAroundCenter(rotationTarget, QUARTER_TURN * direction)
    }

    rotateTargetAroundCenter(target, angle)
    {
        this.getWorldCenter(target, this.beforeCenterWorld)

        target.rotation[ROTATION_AXIS] = this.normalizeAngle(target.rotation[ROTATION_AXIS] + angle)
        target.updateMatrixWorld(true)

        this.getWorldCenter(target, this.afterCenterWorld)

        if(target.parent)
        {
            target.parent.updateMatrixWorld(true)
            this.beforeCenterLocal.copy(this.beforeCenterWorld)
            this.afterCenterLocal.copy(this.afterCenterWorld)
            target.parent.worldToLocal(this.beforeCenterLocal)
            target.parent.worldToLocal(this.afterCenterLocal)
            target.position.add(this.beforeCenterLocal.sub(this.afterCenterLocal))
        }
        else
        {
            target.position.add(this.beforeCenterWorld.sub(this.afterCenterWorld))
        }

        target.updateMatrixWorld(true)
    }

    getWorldCenter(target, out)
    {
        target.updateMatrixWorld(true)
        this.bounds.setFromObject(target)
        if(this.bounds.isEmpty())
        {
            return out.setFromMatrixPosition(target.matrixWorld)
        }

        return this.bounds.getCenter(out)
    }

    normalizeAngle(value)
    {
        return THREE.MathUtils.euclideanModulo(value, FULL_TURN)
    }

    destroy()
    {
        this.inputs?.off?.('mousedown.scene1TubeWater')
        this.hoveredTubeMesh = null
        this.turnDirectionByMeshUuid.clear()
    }
}
