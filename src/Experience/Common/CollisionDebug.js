import * as THREE from 'three'
import Experience from '../Experience.js'

export default class CollisionDebug
{
    constructor({
        player,
        getCollisionBoxes = null,
        folderLabel = '🧱 Collision Debug',
        groupName = '__collisionDebug'
    } = {})
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.debug = this.experience.debug
        this.player = player
        this.getCollisionBoxes = typeof getCollisionBoxes === 'function'
            ? getCollisionBoxes
            : null
        this.folderLabel = folderLabel
        this.groupName = groupName

        this.enabled = Boolean(this.debug?.isDebugEnabled && this.player && this.getCollisionBoxes)
        if(!this.enabled)
        {
            return
        }

        this.state = {
            showCollisionBoxes: false,
            showRays: false,
            showPlayerCollider: false,
            showHit: false
        }

        this.group = new THREE.Group()
        this.group.name = this.groupName
        this.scene.add(this.group)

        this.setCollisionBoxes()
        this.setPlayerVisuals()
        this.setRayVisuals()
        this.setDebugUI()
    }

    setCollisionBoxes()
    {
        this.boxHelpers = []
        this.syncCollisionBoxes()
    }

    syncCollisionBoxes()
    {
        const collisionBoxes = this.getCollisionBoxes?.() ?? []
        const maxHelpers = 500
        const helperCount = Math.min(collisionBoxes.length, maxHelpers)

        while(this.boxHelpers.length > helperCount)
        {
            const helper = this.boxHelpers.pop()
            this.group.remove(helper)
            helper?.geometry?.dispose?.()
            helper?.material?.dispose?.()
        }

        while(this.boxHelpers.length < helperCount)
        {
            const box = collisionBoxes[this.boxHelpers.length] ?? new THREE.Box3()
            const helper = new THREE.Box3Helper(box, new THREE.Color('#00c8ff'))
            this.boxHelpers.push(helper)
            this.group.add(helper)
        }

        for(let index = 0; index < helperCount; index++)
        {
            this.boxHelpers[index].box = collisionBoxes[index]
        }
    }

    setPlayerVisuals()
    {
        const radius = this.player.settings.radius
        const height = this.player.settings.height

        this.colliderMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, height, 16, 1, true),
            new THREE.MeshBasicMaterial({
                color: '#00ff99',
                wireframe: true,
                transparent: true,
                opacity: 0.75
            })
        )
        this.group.add(this.colliderMesh)

        this.cameraMarker = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 12, 12),
            new THREE.MeshBasicMaterial({ color: '#ffff00' })
        )
        this.group.add(this.cameraMarker)

        this.hitMarker = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 12, 12),
            new THREE.MeshBasicMaterial({ color: '#ff3355' })
        )
        this.hitMarker.visible = false
        this.group.add(this.hitMarker)

        this.hitNormalHelper = new THREE.ArrowHelper(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(),
            0.6,
            0xff3355
        )
        this.hitNormalHelper.visible = false
        this.group.add(this.hitNormalHelper)
    }

    setRayVisuals()
    {
        this.rayLines = []

        for(let index = 0; index < 3; index++)
        {
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(),
                new THREE.Vector3()
            ])
            const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#ff8a00' }))
            this.rayLines.push(line)
            this.group.add(line)
        }
    }

    setDebugUI()
    {
        this.folder = this.debug.addFolder(this.folderLabel, { expanded: false })
        this.debug.addBinding(this.folder, this.state, 'showCollisionBoxes', { label: 'boxes' })
        this.debug.addBinding(this.folder, this.state, 'showRays', { label: 'rays' })
        this.debug.addBinding(this.folder, this.state, 'showPlayerCollider', { label: 'player' })
        this.debug.addBinding(this.folder, this.state, 'showHit', { label: 'hit' })
    }

    update()
    {
        if(!this.enabled)
        {
            return
        }

        const playerPosition = this.player.position
        const colliderCenterY = playerPosition.y - (this.player.settings.height * 0.5)
        this.colliderMesh.position.set(playerPosition.x, colliderCenterY, playerPosition.z)
        this.cameraMarker.position.copy(playerPosition)

        this.colliderMesh.visible = this.state.showPlayerCollider
        this.cameraMarker.visible = this.state.showPlayerCollider

        this.syncCollisionBoxes()
        for(const helper of this.boxHelpers)
        {
            helper.visible = this.state.showCollisionBoxes
        }

        const collisionDebugState = this.player.getCollisionDebugState?.()
        const rays = collisionDebugState?.rays ?? []
        const hasHit = Boolean(collisionDebugState?.hit)

        for(let index = 0; index < this.rayLines.length; index++)
        {
            const line = this.rayLines[index]
            const ray = rays[index]
            const shouldShowRay = Boolean(ray && this.state.showRays)
            line.visible = shouldShowRay
            if(!shouldShowRay)
            {
                continue
            }

            line.geometry.setFromPoints([ray.origin, ray.end])
            line.material.color.set(hasHit ? '#ff3355' : '#ff8a00')
        }

        const showHit = Boolean(this.state.showHit && hasHit && collisionDebugState?.hitPoint)
        this.hitMarker.visible = showHit
        this.hitNormalHelper.visible = showHit

        if(showHit)
        {
            this.hitMarker.position.copy(collisionDebugState.hitPoint)
            this.hitNormalHelper.position.copy(collisionDebugState.hitPoint)
            this.hitNormalHelper.setDirection(collisionDebugState.hitNormal.clone().normalize())
        }
    }

    destroy()
    {
        if(!this.enabled)
        {
            return
        }

        this.folder?.dispose?.()
        this.scene.remove(this.group)

        for(const line of this.rayLines ?? [])
        {
            line.geometry?.dispose?.()
            line.material?.dispose?.()
        }

        this.colliderMesh?.geometry?.dispose?.()
        this.colliderMesh?.material?.dispose?.()
        this.cameraMarker?.geometry?.dispose?.()
        this.cameraMarker?.material?.dispose?.()
        this.hitMarker?.geometry?.dispose?.()
        this.hitMarker?.material?.dispose?.()
    }
}
