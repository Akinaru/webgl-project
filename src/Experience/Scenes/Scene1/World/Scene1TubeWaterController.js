import * as THREE from 'three'
import Experience from '../../../Experience.js'

const QUARTER_TURN = Math.PI * 0.5
const FULL_TURN = Math.PI * 2

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
            target.rotation.y = this.normalizeAngle(target.rotation.y + (randomQuarterTurns * QUARTER_TURN))

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
        rotationTarget.rotation.y = this.normalizeAngle(rotationTarget.rotation.y + (QUARTER_TURN * direction))
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
