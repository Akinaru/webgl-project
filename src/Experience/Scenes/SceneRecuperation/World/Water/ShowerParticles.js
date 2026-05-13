import * as THREE from 'three'
import Experience from '../../../../Experience.js'
import * as ShowerParticlesConstants from './ShowerParticles.constants.js'

export default class ShowerParticles
{
    constructor({ recuperationModel = null, debugParentFolder = null } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug
        this.recuperationModel = recuperationModel
        this.debugParentFolder = debugParentFolder
        this.shower = this.recuperationModel?.getFirstObjectForNameTokens?.(ShowerParticlesConstants.SHOWER_NAME_TOKENS, { exact: true }) ?? null
        this.impactMeshes = this.recuperationModel?.getMeshesForNameTokens?.(ShowerParticlesConstants.IMPACT_TARGET_NAME_TOKENS, { exact: true }) ?? []

        this.isActive = false
        this.remainingDuration = 0
        this.origin = new THREE.Vector3()
        this.baseSpread = new THREE.Vector3(0.35, 0, 0.35)
        this.spread = new THREE.Vector3(0.35, 0, 0.35)
        this.floorY = -2.5
        this.burstHeight = 0
        this.settings = {
            showBurstPlane: false,
            burstHeightOffset: ShowerParticlesConstants.BURST_HEIGHT_OFFSET,
            rainRadiusScale: ShowerParticlesConstants.RAIN_RADIUS_SCALE,
            burstCurveEdgeLift: ShowerParticlesConstants.BURST_CURVE_PROFILE[0] ?? 0,
            burstCurveMidLift: ShowerParticlesConstants.BURST_CURVE_PROFILE[1] ?? 0,
            burstCurveCenterLift: ShowerParticlesConstants.BURST_CURVE_PROFILE[2] ?? 0
        }
        this.debugState = {
            burstCurveProfile: ''
        }

        this.tmpMatrix = new THREE.Matrix4()
        this.tmpPosition = new THREE.Vector3()
        this.tmpScale = new THREE.Vector3(1, 1, 1)
        this.tmpQuaternion = new THREE.Quaternion()
        this.tmpDirection = new THREE.Vector3()

        this.setBoundsFromShower()
        this.setDropMesh()
        this.setSplashMesh()
        this.setBurstPlane()
        this.setDebug()
        this.resetDrops()
        this.resetSplashes()
    }

    setBoundsFromShower()
    {
        if(!this.shower)
        {
            return
        }

        const bounds = new THREE.Box3().setFromObject(this.shower)
        const center = bounds.getCenter(new THREE.Vector3())
        const size = bounds.getSize(new THREE.Vector3())

        this.origin.set(center.x, bounds.min.y, center.z)
        this.baseSpread.set(
            Math.max(0.22, size.x * 0.42),
            0,
            Math.max(0.22, size.z * 0.42)
        )
        this.updateRadiusScale()
        this.floorY = bounds.min.y - 3.6
        this.syncBurstHeight()
    }

    updateRadiusScale()
    {
        const scale = Math.max(0.2, Number(this.settings.rainRadiusScale) || 1)
        this.spread.set(
            this.baseSpread.x * scale,
            0,
            this.baseSpread.z * scale
        )
        this.updateBurstPlaneTransform()
    }

    syncBurstHeight()
    {
        const targetBounds = this.resolveImpactTargetBounds()
        if(targetBounds)
        {
            this.burstHeight = targetBounds.max.y + this.settings.burstHeightOffset
        }
        else
        {
            this.burstHeight = this.origin.y - 1.4
        }

        this.updateBurstPlaneTransform()
    }

    resolveImpactTargetBounds()
    {
        if(!Array.isArray(this.impactMeshes) || this.impactMeshes.length === 0)
        {
            return null
        }

        const aggregateBounds = new THREE.Box3()
        const meshBounds = new THREE.Box3()
        let hasBounds = false

        for(const mesh of this.impactMeshes)
        {
            if(!(mesh instanceof THREE.Mesh))
            {
                continue
            }

            meshBounds.setFromObject(mesh)
            if(meshBounds.isEmpty())
            {
                continue
            }

            if(!hasBounds)
            {
                aggregateBounds.copy(meshBounds)
                hasBounds = true
                continue
            }

            aggregateBounds.union(meshBounds)
        }

        return hasBounds ? aggregateBounds.clone() : null
    }

    setDropMesh()
    {
        this.dropGeometry = new THREE.SphereGeometry(ShowerParticlesConstants.DROP_RADIUS, 8, 8)
        this.dropMaterial = new THREE.MeshBasicMaterial({
            color: '#5ea7c7',
            transparent: true,
            opacity: 0.82,
            depthWrite: false
        })
        this.dropMesh = new THREE.InstancedMesh(
            this.dropGeometry,
            this.dropMaterial,
            ShowerParticlesConstants.DROP_COUNT
        )
        this.dropMesh.visible = false
        this.dropMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.scene.add(this.dropMesh)

        this.drops = Array.from({ length: ShowerParticlesConstants.DROP_COUNT }, () => ({
            position: new THREE.Vector3(),
            previousPosition: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            scale: new THREE.Vector3(1, 1, 1),
            active: true,
            respawnDelay: 0
        }))
    }

    setSplashMesh()
    {
        this.splashGeometry = new THREE.SphereGeometry(0.012, 7, 7)
        this.splashMaterial = new THREE.MeshBasicMaterial({
            color: '#eefcff',
            transparent: true,
            opacity: 0.88,
            depthWrite: false
        })
        this.splashMesh = new THREE.InstancedMesh(
            this.splashGeometry,
            this.splashMaterial,
            ShowerParticlesConstants.SPLASH_PARTICLE_COUNT
        )
        this.splashMesh.visible = false
        this.splashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.scene.add(this.splashMesh)

        this.splashes = Array.from({ length: ShowerParticlesConstants.SPLASH_PARTICLE_COUNT }, () => ({
            position: new THREE.Vector3(0, -9999, 0),
            velocity: new THREE.Vector3(),
            scale: new THREE.Vector3(0, 0, 0),
            age: 0,
            life: 0,
            active: false
        }))
        this.nextSplashIndex = 0
    }

    setBurstPlane()
    {
        this.burstPlaneGeometry = new THREE.PlaneGeometry(
            1,
            1,
            ShowerParticlesConstants.BURST_PLANE_SEGMENTS,
            ShowerParticlesConstants.BURST_PLANE_SEGMENTS
        )
        this.burstPlaneMaterial = new THREE.MeshBasicMaterial({
            color: '#79d6ff',
            transparent: true,
            opacity: 0.32,
            depthWrite: false,
            side: THREE.DoubleSide,
            wireframe: true
        })
        this.burstPlane = new THREE.Mesh(this.burstPlaneGeometry, this.burstPlaneMaterial)
        this.burstPlane.rotation.x = -Math.PI * 0.5
        this.burstPlane.visible = false
        this.burstPlane.renderOrder = 11
        this.scene.add(this.burstPlane)
        this.updateBurstPlaneTransform()
        this.updateBurstPlaneGeometry()
    }

    updateBurstPlaneTransform()
    {
        if(!this.burstPlane)
        {
            return
        }

        this.burstPlane.position.set(this.origin.x, this.burstHeight, this.origin.z)
        this.burstPlane.scale.set(this.spread.x * 2, this.spread.z * 2, 1)
        this.burstPlane.visible = this.settings.showBurstPlane === true
    }

    updateBurstPlaneGeometry()
    {
        if(!this.burstPlaneGeometry)
        {
            return
        }

        const positionAttribute = this.burstPlaneGeometry.attributes.position
        const positions = positionAttribute.array

        for(let index = 0; index < positionAttribute.count; index++)
        {
            const offset = index * 3
            const localX = positions[offset]
            const localY = positions[offset + 1]
            positions[offset + 2] = this.getBurstCurveOffset(localX, localY)
        }

        positionAttribute.needsUpdate = true
        this.burstPlaneGeometry.computeVertexNormals()
        this.updateBurstCurveProfile()
    }

    updateBurstCurveProfile()
    {
        this.debugState.burstCurveProfile = this.getActiveBurstCurveProfile()
            .map((value) => value.toFixed(2))
            .join(' | ')
    }

    getActiveBurstCurveProfile()
    {
        return [
            Math.max(0, Number(this.settings.burstCurveEdgeLift) || 0),
            Math.max(0, Number(this.settings.burstCurveMidLift) || 0),
            Math.max(0, Number(this.settings.burstCurveCenterLift) || 0),
            Math.max(0, Number(this.settings.burstCurveMidLift) || 0),
            Math.max(0, Number(this.settings.burstCurveEdgeLift) || 0)
        ]
    }

    getBurstCurveOffset(localX, localY)
    {
        const radialDistance = Math.min(1, Math.sqrt((localX * localX * 4) + (localY * localY * 4)))
        return this.sampleBurstCurveProfile(radialDistance)
    }

    sampleBurstCurveProfile(radialDistance)
    {
        const profile = this.getActiveBurstCurveProfile()
        const clampedDistance = THREE.MathUtils.clamp(radialDistance, 0, 1)
        const centerToEdgeProfile = [
            profile[2] ?? 0,
            profile[1] ?? 0,
            profile[0] ?? 0
        ]
        const scaledIndex = clampedDistance * (centerToEdgeProfile.length - 1)
        const lowerIndex = Math.floor(scaledIndex)
        const upperIndex = Math.min(centerToEdgeProfile.length - 1, lowerIndex + 1)
        const mixRatio = scaledIndex - lowerIndex
        const lowerValue = centerToEdgeProfile[lowerIndex] ?? 0
        const upperValue = centerToEdgeProfile[upperIndex] ?? lowerValue
        return THREE.MathUtils.lerp(lowerValue, upperValue, mixRatio)
    }

    getBurstHeightAt(worldX, worldZ)
    {
        const normalizedX = this.spread.x > 0 ? (worldX - this.origin.x) / this.spread.x : 0
        const normalizedZ = this.spread.z > 0 ? (worldZ - this.origin.z) / this.spread.z : 0
        const localX = THREE.MathUtils.clamp(normalizedX * 0.5, -0.5, 0.5)
        const localY = THREE.MathUtils.clamp(normalizedZ * 0.5, -0.5, 0.5)
        return this.burstHeight + this.getBurstCurveOffset(localX, localY)
    }

    setDebug()
    {
        if(!this.debug?.isDebugEnabled || !this.debugParentFolder)
        {
            return
        }

        this.debugFolder = this.debug.addFolder('Douche', {
            parent: this.debugParentFolder,
            expanded: false
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'showBurstPlane', {
            label: 'Afficher plan eclat'
        }).on('change', () =>
        {
            this.updateBurstPlaneTransform()
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'burstHeightOffset', {
            label: 'Offset hauteur eclat',
            min: -1,
            max: 2,
            step: 0.01
        }).on('change', () =>
        {
            this.syncBurstHeight()
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'rainRadiusScale', {
            label: 'Rayon pluie',
            min: 0.4,
            max: 2.5,
            step: 0.01
        }).on('change', () =>
        {
            this.updateRadiusScale()
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'burstCurveEdgeLift', {
            label: 'Lift bord',
            min: 0,
            max: 0.8,
            step: 0.01
        }).on('change', () =>
        {
            this.updateBurstPlaneGeometry()
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'burstCurveMidLift', {
            label: 'Lift milieu',
            min: 0,
            max: 0.8,
            step: 0.01
        }).on('change', () =>
        {
            this.updateBurstPlaneGeometry()
        })

        this.debug.addBinding(this.debugFolder, this.settings, 'burstCurveCenterLift', {
            label: 'Lift centre',
            min: 0,
            max: 0.8,
            step: 0.01
        }).on('change', () =>
        {
            this.updateBurstPlaneGeometry()
        })

        this.debug.addManualBinding(this.debugFolder, this.debugState, 'burstCurveProfile', {
            label: 'Profil courbe',
            readonly: true
        }, 'auto')
    }

    resetDrop(drop, randomizeY = true)
    {
        const originX = this.origin.x + (Math.random() - 0.5) * this.spread.x * 2
        const originY = this.origin.y - (randomizeY ? Math.random() * 1.3 : 0)
        const originZ = this.origin.z + (Math.random() - 0.5) * this.spread.z * 2

        drop.position.set(originX, originY, originZ)
        drop.previousPosition.copy(drop.position)
        drop.velocity.set(
            (Math.random() - 0.5) * ShowerParticlesConstants.HORIZONTAL_DRIFT,
            -THREE.MathUtils.lerp(ShowerParticlesConstants.FALL_SPEED_MIN, ShowerParticlesConstants.FALL_SPEED_MAX, Math.random()),
            (Math.random() - 0.5) * ShowerParticlesConstants.HORIZONTAL_DRIFT
        )

        const scaleXZ = THREE.MathUtils.lerp(
            ShowerParticlesConstants.DROP_SCALE_XZ_MIN,
            ShowerParticlesConstants.DROP_SCALE_XZ_MAX,
            Math.random()
        )
        drop.scale.set(
            scaleXZ,
            THREE.MathUtils.lerp(ShowerParticlesConstants.DROP_SCALE_Y_MIN, ShowerParticlesConstants.DROP_SCALE_Y_MAX, Math.random()),
            scaleXZ
        )
        drop.active = true
        drop.respawnDelay = 0
    }

    resetDrops()
    {
        for(const drop of this.drops)
        {
            this.resetDrop(drop, true)
        }

        this.syncDropMesh()
    }

    resetSplashes()
    {
        for(const splash of this.splashes)
        {
            splash.position.set(0, -9999, 0)
            splash.velocity.set(0, 0, 0)
            splash.scale.set(0, 0, 0)
            splash.age = 0
            splash.life = 0
            splash.active = false
        }

        this.syncSplashMesh()
    }

    start(durationSeconds = 5.5)
    {
        this.isActive = true
        this.remainingDuration = durationSeconds
        this.dropMesh.visible = true
        this.splashMesh.visible = true
        this.resetDrops()
        this.resetSplashes()
    }

    stop()
    {
        this.isActive = false
        this.remainingDuration = 0
        if(this.dropMesh)
        {
            this.dropMesh.visible = false
        }
        if(this.splashMesh)
        {
            this.splashMesh.visible = false
        }
    }

    update(deltaMs = this.experience.time.delta)
    {
        if(!this.isActive)
        {
            return
        }

        const deltaSeconds = Math.max(0.001, Math.min(0.05, (deltaMs || 16.67) * 0.001))
        this.remainingDuration = Math.max(0, this.remainingDuration - deltaSeconds)
        if(this.remainingDuration <= 0)
        {
            this.stop()
            return
        }

        this.updateDrops(deltaSeconds)
        this.updateSplashes(deltaSeconds)
        this.syncDropMesh()
        this.syncSplashMesh()
    }

    updateDrops(deltaSeconds)
    {
        for(const drop of this.drops)
        {
            if(!drop.active)
            {
                drop.respawnDelay = Math.max(0, drop.respawnDelay - deltaSeconds)
                if(drop.respawnDelay <= 0)
                {
                    this.resetDrop(drop, true)
                }
                continue
            }

            drop.previousPosition.copy(drop.position)
            drop.velocity.y -= ShowerParticlesConstants.GRAVITY * deltaSeconds
            drop.position.addScaledVector(drop.velocity, deltaSeconds)

            const previousBurstHeight = this.getBurstHeightAt(drop.previousPosition.x, drop.previousPosition.z)
            const currentBurstHeight = this.getBurstHeightAt(drop.position.x, drop.position.z)
            const didCrossBurstHeight = drop.previousPosition.y >= previousBurstHeight && drop.position.y <= currentBurstHeight
            if(didCrossBurstHeight)
            {
                const interpolation = (drop.previousPosition.y - previousBurstHeight) / Math.max(0.0001, drop.previousPosition.y - drop.position.y)
                this.tmpPosition.copy(drop.previousPosition).lerp(drop.position, THREE.MathUtils.clamp(interpolation, 0, 1))
                this.tmpPosition.y = this.getBurstHeightAt(this.tmpPosition.x, this.tmpPosition.z)
                this.emitImpactSplash({
                    point: this.tmpPosition
                })
                this.deactivateDrop(drop)
                continue
            }

            if(drop.position.y <= currentBurstHeight)
            {
                this.tmpPosition.copy(drop.position)
                this.tmpPosition.y = currentBurstHeight
                this.emitImpactSplash({
                    point: this.tmpPosition
                })
                this.deactivateDrop(drop)
                continue
            }

            if(drop.position.y <= this.floorY)
            {
                this.deactivateDrop(drop)
            }
        }
    }

    deactivateDrop(drop)
    {
        drop.active = false
        drop.respawnDelay = THREE.MathUtils.lerp(
            ShowerParticlesConstants.DROP_RESPAWN_DELAY_MIN,
            ShowerParticlesConstants.DROP_RESPAWN_DELAY_MAX,
            Math.random()
        )
        drop.position.set(0, -9999, 0)
        drop.previousPosition.copy(drop.position)
        drop.velocity.set(0, 0, 0)
        drop.scale.set(0, 0, 0)
    }

    emitImpactSplash({ point })
    {
        const splashCount = THREE.MathUtils.randInt(
            ShowerParticlesConstants.SPLASH_MIN_PER_IMPACT,
            ShowerParticlesConstants.SPLASH_MAX_PER_IMPACT
        )

        for(let index = 0; index < splashCount; index++)
        {
            const splash = this.splashes[this.nextSplashIndex]
            this.nextSplashIndex = (this.nextSplashIndex + 1) % this.splashes.length

            splash.active = true
            splash.age = 0
            splash.life = THREE.MathUtils.lerp(
                ShowerParticlesConstants.SPLASH_LIFE_MIN,
                ShowerParticlesConstants.SPLASH_LIFE_MAX,
                Math.random()
            )
            splash.position.copy(point)
            splash.position.y += 0.008

            this.tmpDirection.set(0, 1, 0)
            this.tmpDirection.x += (Math.random() - 0.5) * 1.25
            this.tmpDirection.y += ShowerParticlesConstants.SPLASH_UPWARD_BOOST * Math.random()
            this.tmpDirection.z += (Math.random() - 0.5) * 1.25
            this.tmpDirection.normalize()
            this.tmpDirection.multiplyScalar(
                THREE.MathUtils.lerp(
                    ShowerParticlesConstants.SPLASH_SPEED_MIN,
                    ShowerParticlesConstants.SPLASH_SPEED_MAX,
                    Math.random()
                )
            )

            splash.velocity.copy(this.tmpDirection)
            const scale = THREE.MathUtils.lerp(0.7, 1.65, Math.random())
            splash.scale.setScalar(scale)
        }
    }

    updateSplashes(deltaSeconds)
    {
        for(const splash of this.splashes)
        {
            if(!splash.active)
            {
                continue
            }

            splash.age += deltaSeconds
            if(splash.age >= splash.life)
            {
                splash.active = false
                splash.position.set(0, -9999, 0)
                splash.scale.set(0, 0, 0)
                continue
            }

            splash.velocity.y -= ShowerParticlesConstants.SPLASH_GRAVITY * deltaSeconds
            splash.velocity.multiplyScalar(0.985)
            splash.position.addScaledVector(splash.velocity, deltaSeconds)

            const lifeRatio = 1 - (splash.age / splash.life)
            splash.scale.setScalar(Math.max(0, lifeRatio * 1.1))
        }
    }

    syncDropMesh()
    {
        if(!this.dropMesh)
        {
            return
        }

        for(let index = 0; index < this.drops.length; index++)
        {
            const drop = this.drops[index]
            this.tmpPosition.copy(drop.position)
            this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, drop.scale)
            this.dropMesh.setMatrixAt(index, this.tmpMatrix)
        }

        this.dropMesh.instanceMatrix.needsUpdate = true
    }

    syncSplashMesh()
    {
        if(!this.splashMesh)
        {
            return
        }

        for(let index = 0; index < this.splashes.length; index++)
        {
            const splash = this.splashes[index]
            this.tmpPosition.copy(splash.position)
            this.tmpMatrix.compose(this.tmpPosition, this.tmpQuaternion, splash.scale)
            this.splashMesh.setMatrixAt(index, this.tmpMatrix)
        }

        this.splashMesh.instanceMatrix.needsUpdate = true
    }

    destroy()
    {
        if(this.dropMesh)
        {
            this.scene.remove(this.dropMesh)
            this.dropMesh.geometry.dispose()
            this.dropMesh.material.dispose()
        }

        if(this.splashMesh)
        {
            this.scene.remove(this.splashMesh)
            this.splashMesh.geometry.dispose()
            this.splashMesh.material.dispose()
        }

        if(this.burstPlane)
        {
            this.scene.remove(this.burstPlane)
            this.burstPlane.geometry.dispose()
            this.burstPlane.material.dispose()
        }

        this.debugFolder?.dispose?.()

        this.dropMesh = null
        this.splashMesh = null
        this.burstPlane = null
        this.dropGeometry = null
        this.splashGeometry = null
        this.burstPlaneGeometry = null
        this.dropMaterial = null
        this.splashMaterial = null
        this.burstPlaneMaterial = null
        this.shower = null
        this.drops = null
        this.splashes = null
        this.impactMeshes = null
        this.recuperationModel = null
    }
}
