import * as THREE from 'three'
import Experience from '../../../Experience.js'
import SpatialBoxOctree from '../../../Utils/SpatialBoxOctree.js'
import * as InputBindingsConstants from '../../../Inputs/InputBindings.constants.js'
import * as PlayerConstants from '../Player.constants.js'

/**
 * Construit la position de spawn à partir des options d entrée.
 */
export function createSpawnPosition(spawnPosition)
{
    const defaultY = this.groundHeight + this.settings.height

    if(spawnPosition instanceof THREE.Vector3)
    {
        return spawnPosition.clone()
    }

    if(spawnPosition && typeof spawnPosition === 'object')
    {
        return new THREE.Vector3(
            spawnPosition.x ?? 0,
            spawnPosition.y ?? defaultY,
            spawnPosition.z ?? 6
        )
    }

    return new THREE.Vector3(0, defaultY, 6)
}


/**
 * Initialise la caméra selon la position et les angles du joueur.
 */
export function setCamera()
{
    this.camera.rotation.order = 'YXZ'
    this.camera.position.copy(this.position)
    this.camera.rotation.set(this.pitch, this.yaw, 0)
    this.cameraSmoothPosition.copy(this.position)
    this.cameraSmoothYaw = this.yaw
    this.cameraSmoothPitch = this.pitch
    this.cameraSmoothRoll = 0
}


/**
 * Branche les événements de pointer lock et de mouvement souris.
 */
export function setPointerLock()
{
    this.onCanvasClick = (event) =>
    {
        if(event?.target !== this.canvas)
        {
            return
        }

        if(this.experience?.isNanobotInspecting)
        {
            return
        }

        if(this.experience?.isChampignonInteracting)
        {
            return
        }

        if(!this.inputs?.isPointerLocked?.(this.canvas))
        {
            this.inputs?.requestPointerLock?.(this.canvas)
        }
    }

    this.onPointerLockChange = ({ element } = {}) =>
    {
        this.isPointerLocked = element === this.canvas
        document.body.classList.toggle('is-pointer-locked', this.isPointerLocked)
    }

    this.onMouseMove = (event) =>
    {
        if(!this.isPointerLocked || !this.isLookEnabled)
        {
            return
        }

        this.yaw -= event.movementX * this.settings.lookSensitivity
        this.pitch -= event.movementY * this.settings.lookSensitivity
        this.pitch = THREE.MathUtils.clamp(this.pitch, this.settings.minPitch, this.settings.maxPitch)
    }

    this.inputs?.on?.('click.player', this.onCanvasClick)
    this.inputs?.on?.('pointerlockchange.player', this.onPointerLockChange)
    this.inputs?.on?.('mousemove.player', this.onMouseMove)
    this.isPointerLocked = this.inputs?.isPointerLocked?.(this.canvas) || false
    document.body.classList.toggle('is-pointer-locked', this.isPointerLocked)
}


/**
 * Active ou désactive la rotation caméra par la souris.
 */
export function setLookEnabled(isEnabled = true)
{
    this.isLookEnabled = Boolean(isEnabled)
}

/**
 * Met à jour les contraintes/runtime collision du joueur sans recréer l'instance.
 */
export function setRuntimeEnvironment({
    boundaryRadius = this.boundaryRadius,
    boundaryBox = this.boundaryBox,
    collisionBoxes = this.collisionBoxes,
    collisionMeshes = this.collisionMeshes,
    groundMeshes = this.groundMeshes,
    useBoxCollisionResolution = this.useBoxCollisionResolution,
    useMeshCollisionRaycast = this.useMeshCollisionRaycast
} = {})
{
    this.boundaryRadius = Number.isFinite(boundaryRadius) ? boundaryRadius : this.boundaryRadius
    this.boundaryBox = this.normalizeBoundaryBox(boundaryBox)
    this.collisionBoxes = Array.isArray(collisionBoxes) ? collisionBoxes : []
    this.collisionMeshes = Array.isArray(collisionMeshes) ? collisionMeshes : []
    this.groundMeshes = Array.isArray(groundMeshes) && groundMeshes.length > 0
        ? groundMeshes
        : this.collisionMeshes
    this.ceilingMeshes = this.collisionMeshes.length > 0
        ? this.collisionMeshes
        : this.groundMeshes
    this.useBoxCollisionResolution = Boolean(useBoxCollisionResolution)
    this.useMeshCollisionRaycast = Boolean(useMeshCollisionRaycast)
    this.currentGroundObject = null
    this.collisionOctreePayloads = []
    this.collisionOctreeVersion = {
        length: -1,
        first: null,
        mid: null,
        last: null
    }
}

/**
 * Téléporte le joueur en synchronisant aussi la caméra lissée.
 */
export function teleportTo({
    position = null,
    yaw = this.yaw,
    pitch = this.pitch
} = {})
{
    if(position instanceof THREE.Vector3)
    {
        this.position.copy(position)
    }
    else if(position && typeof position === 'object')
    {
        this.position.set(
            position.x ?? this.position.x,
            position.y ?? this.position.y,
            position.z ?? this.position.z
        )
    }

    this.previousPosition.copy(this.position)
    this.velocity.set(0, 0, 0)
    this.yaw = Number.isFinite(yaw) ? yaw : this.yaw
    this.pitch = Number.isFinite(pitch) ? pitch : this.pitch
    this.camera.position.copy(this.position)
    this.camera.rotation.set(this.pitch, this.yaw, 0)
    this.cameraSmoothPosition.copy(this.position)
    this.cameraSmoothYaw = this.yaw
    this.cameraSmoothPitch = this.pitch
    this.cameraSmoothRoll = 0
}


/**
 * Expose les réglages debug du joueur.
 */
export function setDebug()
{
    if(!this.debug?.isDebugEnabled)
    {
        return
    }

    this.debugFolder = this.debug.addFolder('🕹 Joueur', { expanded: false })
    this.debug.addBinding(this.debugFolder, this.settings, 'height', {
        label: 'Hauteur du joueur',
        min: 0.7,
        max: 2.2,
        step: 0.01
    })
    this.debug.addBinding(this.debugFolder, this.settings, 'radius', {
        label: 'Rayon du joueur',
        min: 0.1,
        max: 0.6,
        step: 0.005
    })
    this.debug.addBinding(this.debugFolder, this.settings, 'stepHeight', {
        label: 'Hauteur de marche',
        min: 0.05,
        max: 1.2,
        step: 0.01
    })
    this.debug.addBinding(this.debugFolder, this.settings, 'speedMultiplier', {
        label: 'Vitesse de deplacement',
        min: 0.2,
        max: 4,
        step: 0.01
    })

    this.debug.addBinding(this.debugFolder, this.settings, 'headBobAmplitude', {
        label: 'Amplitude du balancement',
        min: 0,
        max: 0.08,
        step: 0.001
    })
    this.debug.addBinding(this.debugFolder, this.settings, 'headBobFrequency', {
        label: 'Frequence du balancement',
        min: 0.4,
        max: 4,
        step: 0.01
    })
    this.debug.addBinding(this.debugFolder, this.settings, 'headBobSmoothing', {
        label: 'Lissage du balancement',
        min: 1,
        max: 30,
        step: 0.1
    })
    this.debug.addBinding(this.debugFolder, this.settings, 'headBobRollAmplitude', {
        label: 'Roulis du balancement',
        min: 0,
        max: 0.03,
        step: 0.0005
    })

    this.debug.addBinding(this.debugFolder, this, 'useBoxCollisionResolution', {
        label: 'Collisions boites',
        export: false
    })
    this.debug.addBinding(this.debugFolder, this, 'useMeshCollisionRaycast', {
        label: 'Collisions mesh',
        export: false
    })

    this.debug.addBinding(this.debugFolder, this.settings, 'cameraSmoothEnabled', {
        label: 'Lissage camera actif'
    })
    this.debug.addBinding(this.debugFolder, this.settings, 'cameraPositionSmooth', {
        label: 'Lissage position camera',
        min: 1,
        max: 60,
        step: 0.1
    })
    this.debug.addBinding(this.debugFolder, this.settings, 'cameraRotationSmooth', {
        label: 'Lissage rotation camera',
        min: 1,
        max: 80,
        step: 0.1
    })

    this.debugPositionFolder = this.debug.addFolder('Position', {
        parent: this.debugFolder,
        expanded: false
    })

    this.debugPositionState = {
        playerX: 0,
        playerY: 0,
        playerZ: 0,
        playerYaw: 0,
        playerPitch: 0,
        cameraX: 0,
        cameraY: 0,
        cameraZ: 0,
        cameraYaw: 0,
        cameraPitch: 0,
        cameraRoll: 0
    }

    const positionFields = [
        ['playerX', 'player x'],
        ['playerY', 'player y'],
        ['playerZ', 'player z'],
        ['playerYaw', 'player yaw'],
        ['playerPitch', 'player pitch'],
        ['cameraX', 'camera x'],
        ['cameraY', 'camera y'],
        ['cameraZ', 'camera z'],
        ['cameraYaw', 'camera yaw'],
        ['cameraPitch', 'camera pitch'],
        ['cameraRoll', 'camera roll']
    ]

    for(const [key, label] of positionFields)
    {
        this.debug.addManualBinding(this.debugPositionFolder, this.debugPositionState, key, {
            label,
            readonly: true,
            format: (value) => Number(value || 0).toFixed(3)
        }, 'auto')
    }

    this.syncDebugPositionState = () =>
    {
        if(!this.debugPositionState)
        {
            return
        }

        this.debugPositionState.playerX = this.position?.x ?? 0
        this.debugPositionState.playerY = this.position?.y ?? 0
        this.debugPositionState.playerZ = this.position?.z ?? 0
        this.debugPositionState.playerYaw = THREE.MathUtils.radToDeg(this.yaw ?? 0)
        this.debugPositionState.playerPitch = THREE.MathUtils.radToDeg(this.pitch ?? 0)
        this.debugPositionState.cameraX = this.camera?.position?.x ?? 0
        this.debugPositionState.cameraY = this.camera?.position?.y ?? 0
        this.debugPositionState.cameraZ = this.camera?.position?.z ?? 0
        this.debugPositionState.cameraYaw = THREE.MathUtils.radToDeg(this.camera?.rotation?.y ?? 0)
        this.debugPositionState.cameraPitch = THREE.MathUtils.radToDeg(this.camera?.rotation?.x ?? 0)
        this.debugPositionState.cameraRoll = THREE.MathUtils.radToDeg(this.camera?.rotation?.z ?? 0)
    }

    this.syncDebugPositionState()
    this.removeDebugPositionAutoRefresh = this.debug.addAutoRefresh(this.syncDebugPositionState)
}


/**
 * Normalise une boundary box optionnelle en instance THREE.Box3.
 */
export function normalizeBoundaryBox(boundaryBox)
{
    if(!boundaryBox || typeof boundaryBox !== 'object')
    {
        return null
    }

    const minX = Number(boundaryBox.minX)
    const maxX = Number(boundaryBox.maxX)
    const minZ = Number(boundaryBox.minZ)
    const maxZ = Number(boundaryBox.maxZ)

    if(
        !Number.isFinite(minX) ||
        !Number.isFinite(maxX) ||
        !Number.isFinite(minZ) ||
        !Number.isFinite(maxZ) ||
        minX >= maxX ||
        minZ >= maxZ
    )
    {
        return null
    }

    return { minX, maxX, minZ, maxZ }
}
