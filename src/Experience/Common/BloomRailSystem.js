import * as THREE from 'three'

function toVector3(point)
{
    if(point instanceof THREE.Vector3)
    {
        return point.clone()
    }

    if(Array.isArray(point))
    {
        return new THREE.Vector3(
            Number(point[0] ?? 0),
            Number(point[1] ?? 0),
            Number(point[2] ?? 0)
        )
    }

    if(point && typeof point === 'object')
    {
        return new THREE.Vector3(
            Number(point.x ?? 0),
            Number(point.y ?? 0),
            Number(point.z ?? 0)
        )
    }

    return null
}

function sanitizeRails(rawRails = [])
{
    const normalized = []

    const railsInput = Array.isArray(rawRails)
        ? rawRails
        : []

    const hasNestedRails = railsInput.some((entry) => Array.isArray(entry))

    if(hasNestedRails)
    {
        for(const rail of railsInput)
        {
            if(!Array.isArray(rail))
            {
                continue
            }

            const points = rail
                .map((point) => toVector3(point))
                .filter((point) => point instanceof THREE.Vector3)

            if(points.length >= 1)
            {
                normalized.push(points)
            }
        }

        return normalized
    }

    const singleRail = railsInput
        .map((point) => toVector3(point))
        .filter((point) => point instanceof THREE.Vector3)

    if(singleRail.length >= 1)
    {
        normalized.push(singleRail)
    }

    return normalized
}

export default class BloomRailSystem
{
    constructor({
        scene = null,
        rails = [],
        speed = 4,
        railSwitchDistance = 0.7,
        endpointSwitchDistance = 1.4,
        helperPointRadius = 0.08,
        showHelpers = false
    } = {})
    {
        this.scene = scene

        this.settings = {
            speed,
            railSwitchDistance,
            endpointSwitchDistance,
            helperPointRadius,
            showHelpers
        }

        this.activeRailIndex = -1
        this.rails = []
        this.railData = []

        this.closestPoint = new THREE.Vector3()
        this.closestSegment = new THREE.Vector3()

        this.helperGroup = new THREE.Group()
        this.helperGroup.name = '__bloomRailsDebug'
        this.helperLines = []
        this.helperPoints = []

        if(this.scene)
        {
            this.scene.add(this.helperGroup)
        }

        this.setRails(rails)
        this.setHelpersVisible(this.settings.showHelpers)
    }

    setRails(rawRails = [])
    {
        this.rails = sanitizeRails(rawRails)
        this.buildRailData()

        if(this.rails.length === 0)
        {
            this.activeRailIndex = -1
        }
        else
        {
            this.activeRailIndex = THREE.MathUtils.clamp(this.activeRailIndex, 0, this.rails.length - 1)
            if(this.activeRailIndex < 0)
            {
                this.activeRailIndex = 0
            }

            if(this.railData[this.activeRailIndex]?.segments?.length === 0)
            {
                const firstNavigableRail = this.railData.findIndex((rail) => rail.segments.length > 0)
                this.activeRailIndex = firstNavigableRail >= 0 ? firstNavigableRail : 0
            }
        }

        this.rebuildHelpers()
    }

    hasRails()
    {
        return this.railData.some((rail) => rail.segments.length > 0)
    }

    buildRailData()
    {
        this.railData = this.rails.map((railPoints) =>
        {
            const segments = []
            let cursorDistance = 0

            for(let index = 0; index < railPoints.length - 1; index++)
            {
                const start = railPoints[index]
                const end = railPoints[index + 1]
                const segmentLength = start.distanceTo(end)

                if(segmentLength <= 1e-5)
                {
                    continue
                }

                const segment = {
                    startIndex: index,
                    endIndex: index + 1,
                    start,
                    end,
                    length: segmentLength,
                    startDistance: cursorDistance,
                    endDistance: cursorDistance + segmentLength
                }

                segments.push(segment)
                cursorDistance += segmentLength
            }

            return {
                points: railPoints,
                segments,
                totalLength: cursorDistance
            }
        })
    }

    moveAnchorTowards(anchor, targetPosition, deltaSeconds)
    {
        if(!(anchor instanceof THREE.Vector3) || !(targetPosition instanceof THREE.Vector3) || !this.hasRails())
        {
            return false
        }

        this.ensureActiveRail(anchor, targetPosition)
        if(this.activeRailIndex < 0)
        {
            return false
        }

        let currentProjection = this.getClosestProjectionOnRail(this.activeRailIndex, anchor)
        if(!currentProjection)
        {
            return false
        }

        const switched = this.trySwitchRail(anchor, targetPosition, currentProjection)
        if(switched)
        {
            currentProjection = this.getClosestProjectionOnRail(this.activeRailIndex, anchor)
            if(!currentProjection)
            {
                return false
            }
        }

        const goalProjection = this.getClosestProjectionOnRail(this.activeRailIndex, targetPosition)
        if(!goalProjection)
        {
            return false
        }

        const before = anchor.clone()
        anchor.copy(currentProjection.point)

        const maxStep = Math.max(0, this.settings.speed) * Math.max(0, deltaSeconds)
        if(maxStep <= 1e-8)
        {
            return anchor.distanceToSquared(before) > 1e-8
        }

        const distanceToGoal = goalProjection.distanceAlong - currentProjection.distanceAlong
        if(Math.abs(distanceToGoal) <= 1e-5)
        {
            return anchor.distanceToSquared(before) > 1e-8
        }

        const step = Math.sign(distanceToGoal) * Math.min(Math.abs(distanceToGoal), maxStep)
        const nextDistance = currentProjection.distanceAlong + step
        const nextPoint = this.getPointAtDistance(this.activeRailIndex, nextDistance)

        if(nextPoint)
        {
            anchor.copy(nextPoint)
        }

        return anchor.distanceToSquared(before) > 1e-8
    }

    ensureActiveRail(anchor, targetPosition)
    {
        if(this.rails.length === 0)
        {
            this.activeRailIndex = -1
            return
        }

        const hasActiveRail = this.activeRailIndex >= 0
            && this.activeRailIndex < this.rails.length
            && this.railData[this.activeRailIndex]?.segments?.length > 0

        if(hasActiveRail)
        {
            return
        }

        const anchorProjection = this.getClosestProjection(anchor)
        if(anchorProjection)
        {
            this.activeRailIndex = anchorProjection.railIndex
            this.updateHelperColors()
            return
        }

        const targetProjection = this.getClosestProjection(targetPosition)
        if(targetProjection)
        {
            this.activeRailIndex = targetProjection.railIndex
            this.updateHelperColors()
            return
        }

        this.activeRailIndex = 0
        this.updateHelperColors()
    }

    trySwitchRail(anchor, targetPosition, currentProjection)
    {
        const targetAny = this.getClosestProjection(targetPosition)
        if(!targetAny || targetAny.railIndex === this.activeRailIndex)
        {
            return false
        }

        const currentRail = this.railData[this.activeRailIndex]
        if(!currentRail)
        {
            return false
        }

        const distanceToRailStart = currentProjection.distanceAlong
        const distanceToRailEnd = Math.max(0, currentRail.totalLength - currentProjection.distanceAlong)
        const nearEndpoint = distanceToRailStart <= this.settings.endpointSwitchDistance
            || distanceToRailEnd <= this.settings.endpointSwitchDistance

        if(!nearEndpoint)
        {
            return false
        }

        const anchorToTargetRail = this.getClosestProjectionOnRail(targetAny.railIndex, anchor)
        if(!anchorToTargetRail || anchorToTargetRail.distance > this.settings.railSwitchDistance)
        {
            return false
        }

        this.activeRailIndex = targetAny.railIndex
        this.updateHelperColors()
        return true
    }

    getClosestProjection(position, { railIndex = null } = {})
    {
        if(!(position instanceof THREE.Vector3))
        {
            return null
        }

        if(Number.isInteger(railIndex) && railIndex >= 0)
        {
            return this.getClosestProjectionOnRail(railIndex, position)
        }

        let best = null

        for(let index = 0; index < this.railData.length; index++)
        {
            const projection = this.getClosestProjectionOnRail(index, position)
            if(!projection)
            {
                continue
            }

            if(!best || projection.distance < best.distance)
            {
                best = projection
            }
        }

        return best
    }

    getClosestProjectionOnRail(railIndex, position)
    {
        const rail = this.railData[railIndex]
        if(!rail || rail.segments.length === 0)
        {
            return null
        }

        let bestDistanceSq = Infinity
        let bestProjection = null

        for(let segmentIndex = 0; segmentIndex < rail.segments.length; segmentIndex++)
        {
            const segment = rail.segments[segmentIndex]
            const projection = this.projectPointOnSegmentXZ(position, segment.start, segment.end)

            if(!projection)
            {
                continue
            }

            const distanceSq = projection.point.distanceToSquared(position)
            if(distanceSq >= bestDistanceSq)
            {
                continue
            }

            bestDistanceSq = distanceSq
            bestProjection = {
                railIndex,
                segmentIndex,
                t: projection.t,
                point: projection.point,
                distanceAlong: segment.startDistance + (segment.length * projection.t),
                distance: Math.sqrt(distanceSq)
            }
        }

        return bestProjection
    }

    getPointAtDistance(railIndex, distanceAlong)
    {
        const rail = this.railData[railIndex]
        if(!rail || rail.segments.length === 0)
        {
            return null
        }

        if(distanceAlong <= 0)
        {
            return rail.points[0].clone()
        }

        if(distanceAlong >= rail.totalLength)
        {
            return rail.points[rail.points.length - 1].clone()
        }

        for(const segment of rail.segments)
        {
            if(distanceAlong < segment.startDistance || distanceAlong > segment.endDistance)
            {
                continue
            }

            const localDistance = distanceAlong - segment.startDistance
            const t = THREE.MathUtils.clamp(localDistance / segment.length, 0, 1)
            return this.closestSegment.copy(segment.start).lerp(segment.end, t).clone()
        }

        return rail.points[rail.points.length - 1].clone()
    }

    projectPointOnSegmentXZ(position, start, end)
    {
        const abX = end.x - start.x
        const abZ = end.z - start.z
        const abLenSq = (abX * abX) + (abZ * abZ)

        if(abLenSq <= 1e-8)
        {
            return null
        }

        const apX = position.x - start.x
        const apZ = position.z - start.z
        const t = THREE.MathUtils.clamp(((apX * abX) + (apZ * abZ)) / abLenSq, 0, 1)

        this.closestPoint
            .copy(start)
            .lerp(end, t)

        return {
            t,
            point: this.closestPoint.clone()
        }
    }

    appendPoint(point)
    {
        const vector = toVector3(point)
        if(!(vector instanceof THREE.Vector3))
        {
            return false
        }

        if(this.rails.length === 0)
        {
            this.rails.push([vector])
        }
        else
        {
            const lastRail = this.rails[this.rails.length - 1]
            lastRail.push(vector)
        }

        this.setRails(this.rails)
        return true
    }

    startNewRail(point = null)
    {
        const vector = point ? toVector3(point) : null
        this.rails.push(vector ? [vector] : [])
        this.setRails(this.rails)
    }

    clearRails()
    {
        this.setRails([])
    }

    toSerializableRails({ decimals = 3 } = {})
    {
        const factor = Math.pow(10, Math.max(0, Math.floor(decimals)))

        return this.rails.map((rail) => rail.map((point) => ({
            x: Math.round(point.x * factor) / factor,
            y: Math.round(point.y * factor) / factor,
            z: Math.round(point.z * factor) / factor
        })))
    }

    logRailsToConsole()
    {
        const payload = this.toSerializableRails()
        const content = JSON.stringify(payload, null, 4)
        console.log('BLOOM_RAILS =', content)
        return content
    }

    setHelpersVisible(visible)
    {
        this.settings.showHelpers = Boolean(visible)
        this.helperGroup.visible = this.settings.showHelpers
    }

    rebuildHelpers()
    {
        for(const line of this.helperLines)
        {
            if(!line)
            {
                continue
            }

            this.helperGroup.remove(line)
            line.geometry?.dispose?.()
            line.material?.dispose?.()
        }
        for(const point of this.helperPoints)
        {
            this.helperGroup.remove(point)
            point.geometry?.dispose?.()
            point.material?.dispose?.()
        }

        this.helperLines = []
        this.helperPoints = []

        for(let railIndex = 0; railIndex < this.rails.length; railIndex++)
        {
            const rail = this.rails[railIndex]
            this.helperLines[railIndex] = null

            if(rail.length >= 2)
            {
                const lineGeometry = new THREE.BufferGeometry().setFromPoints(rail)
                const lineMaterial = new THREE.LineBasicMaterial({ color: '#2ec4ff' })
                const line = new THREE.Line(lineGeometry, lineMaterial)
                this.helperGroup.add(line)
                this.helperLines[railIndex] = line
            }

            for(const point of rail)
            {
                const pointMesh = new THREE.Mesh(
                    new THREE.SphereGeometry(this.settings.helperPointRadius, 10, 10),
                    new THREE.MeshBasicMaterial({ color: '#8be9ff' })
                )
                pointMesh.position.copy(point)
                this.helperGroup.add(pointMesh)
                this.helperPoints.push(pointMesh)
            }
        }

        this.updateHelperColors()
    }

    updateHelperColors()
    {
        for(let railIndex = 0; railIndex < this.helperLines.length; railIndex++)
        {
            const line = this.helperLines[railIndex]
            if(!line)
            {
                continue
            }
            const isActive = railIndex === this.activeRailIndex
            line.material.color.set(isActive ? '#3cff88' : '#2ec4ff')
        }
    }

    destroy()
    {
        for(const line of this.helperLines)
        {
            if(!line)
            {
                continue
            }

            line.geometry?.dispose?.()
            line.material?.dispose?.()
        }

        for(const point of this.helperPoints)
        {
            point.geometry?.dispose?.()
            point.material?.dispose?.()
        }

        this.helperLines = []
        this.helperPoints = []

        if(this.scene)
        {
            this.scene.remove(this.helperGroup)
        }

        this.rails = []
        this.railData = []
        this.activeRailIndex = -1
    }
}
