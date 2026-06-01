import * as THREE from 'three'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'
import Experience from '../../Experience.js'
import CenterScreenRaycaster from '../../Utils/CenterScreenRaycaster.js'
import * as MateriauConstants from '../SceneRecuperation/World/Interactives/Materiau.constants.js'

const NANOBOT_NAME_TOKEN = 'nanobot'
const ZOOM_DISTANCE_FACTOR = 2.0
const ZOOM_DISTANCE_MIN = 0.6
const CAMERA_ELEVATION_OFFSET = 0.24
const INSPECTION_TARGET_Y_OFFSET = 0.16
const INSPECTION_SCALE_FACTOR = 2
const ANIMATION_DURATION = 0.65
const DRAG_SENSITIVITY = 0.007
const ELEVATION_CLAMP = Math.PI * 0.45
const COMPLETION_DIALOGUE_KEY = 'recyclage_105'
const INDICATOR_LABEL = 'Voir le Nanobot'
const INSPECTION_FOV = 30
const STAIN_MIN_COUNT = 4
const STAIN_MAX_COUNT = 8
const STAIN_MIN_RADIUS = 0.045
const STAIN_MAX_RADIUS = 0.085
const STAIN_SURFACE_PADDING = 0.04
const STAIN_MIN_SPACING = 0.18
const STAIN_RAY_DISTANCE_MULTIPLIER = 2.4
const STAIN_PROJECTOR_DEPTH = 0.12

export default class NanobotInspector
{
    constructor({ world })
    {
        this.experience = new Experience()
        this.world = world
        this.camera = this.experience.camera.instance
        this.inputs = this.experience.inputs

        this.isInspecting = false
        this.isInteractionEnabled = false

        this.nanobotObject = null
        this.nanobotMeshes = []
        this.hoveredMesh = null
        this.cursorElement = null
        this.createdCursorElement = false
        this.ownsCursor = false
        this.centerScreen = new THREE.Vector2(window.innerWidth * 0.5, window.innerHeight * 0.5)

        // Pivot for nanobot rotation
        this.pivotGroup = null
        this.stainGroup = null
        this.nanobotOriginalParent = null
        this.nanobotOriginalLocalPos = new THREE.Vector3()
        this.nanobotOriginalLocalQuat = new THREE.Quaternion()
        this.nanobotOriginalLocalScale = new THREE.Vector3()
        this.pivotAzimuth = 0
        this.pivotElevation = 0
        this.cleanableStains = []
        this.remainingStainCount = 0

        // Fixed inspection camera
        this.inspectionCenter = new THREE.Vector3()
        this.inspectionDistance = 1.5
        this.fixedCameraPos = new THREE.Vector3()
        this.fixedCameraQuat = new THREE.Quaternion()
        this.inspectTargetCenter = new THREE.Vector3()

        // Camera animation
        this.isAnimating = false
        this.isExiting = false
        this.animationProgress = 0
        this.cameraStartPos = new THREE.Vector3()
        this.cameraStartQuat = new THREE.Quaternion()
        this.cameraEndPos = new THREE.Vector3()
        this.cameraEndQuat = new THREE.Quaternion()
        this.cameraStartFov = this.camera.fov
        this.cameraEndFov = this.camera.fov
        this.defaultCameraFov = this.camera.fov

        // Mouse drag
        this.isDragging = false
        this.lastMouseX = 0
        this.lastMouseY = 0

        this.raycaster = new THREE.Raycaster()
        this.surfaceRaycaster = new THREE.Raycaster()
        this.centerNdc = new THREE.Vector2(0, 0)
        this.centerRaycaster = new CenterScreenRaycaster({
            getCamera: () => this.experience.camera?.instance ?? null
        })
        this.indicatorGroup = null
        this.indicatorCurrentVisible = false
        this.indicatorBounds = new THREE.Box3()
        this.indicatorCenter = new THREE.Vector3()
        this.indicatorSize = new THREE.Vector3()
        this.indicatorLinePoints = [
            new THREE.Vector3(),
            new THREE.Vector3()
        ]
        this.mouseNdc = new THREE.Vector2()
        this.stainDirection = new THREE.Vector3()
        this.stainSize = new THREE.Vector3()
        this.stainSurfaceCenter = new THREE.Vector3()
        this.stainSurfaceNormal = new THREE.Vector3()
        this.stainRayOrigin = new THREE.Vector3()
        this.stainRayDirection = new THREE.Vector3()
        this.stainProjectionSize = new THREE.Vector3()
        this.stainTargetPoint = new THREE.Vector3()
        this.stainUpVector = new THREE.Vector3()
        this.stainLookAtMatrix = new THREE.Matrix4()
        this.stainOrientation = new THREE.Euler()
        this.stainNormalMatrix = new THREE.Matrix3()
        this.pivotInverseMatrix = new THREE.Matrix4()

        this.findNanobotObjects()
        this.setSceneIndicator()
        this.ensureCursorElement()
        this.createUI()
        this.setupEvents()
    }

    findNanobotObjects()
    {
        const model = this.world.recyclageModel?.model
        if(!model) return

        model.traverse((child) =>
        {
            if(this.nanobotObject) return
            const name = (child.name || '').toLowerCase()
            if(name.includes(NANOBOT_NAME_TOKEN))
            {
                this.nanobotObject = child
            }
        })

        if(this.nanobotObject)
        {
            this.nanobotObject.traverse((child) =>
            {
                if(child instanceof THREE.Mesh)
                {
                    this.nanobotMeshes.push(child)
                }
            })
        }
    }

    createUI()
    {
        this.overlayEl = document.createElement('div')
        this.overlayEl.className = 'nanobot-inspector'

        this.closeBtnEl = document.createElement('button')
        this.closeBtnEl.className = 'nanobot-inspector__close'
        this.closeBtnEl.textContent = 'Valider et fermer'
        this.closeBtnEl.type = 'button'
        this.overlayEl.appendChild(this.closeBtnEl)

        document.body.appendChild(this.overlayEl)

        this.onCloseClick = () => this.exitInspection()
        this.closeBtnEl.addEventListener('click', this.onCloseClick)
    }

    setSceneIndicator()
    {
        this.indicatorGroup = new THREE.Group()
        this.indicatorGroup.visible = false
        this.indicatorGroup.renderOrder = 20

        this.indicatorLineGeometry = new THREE.BufferGeometry().setFromPoints(this.indicatorLinePoints)
        this.indicatorLine = new THREE.Line(
            this.indicatorLineGeometry,
            new THREE.LineBasicMaterial({
                color: MateriauConstants.INDICATOR_LINE_COLOR,
                transparent: true,
                opacity: 0.9,
                depthWrite: false
            })
        )

        this.indicatorDot = new THREE.Mesh(
            new THREE.SphereGeometry(0.022, 12, 12),
            new THREE.MeshBasicMaterial({
                color: MateriauConstants.INDICATOR_RING_COLOR,
                transparent: true,
                opacity: 0.95,
                depthWrite: false
            })
        )

        this.indicatorLabelTexture = this.createIndicatorLabelTexture(INDICATOR_LABEL)
        this.indicatorLabelSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: this.indicatorLabelTexture,
                transparent: true,
                depthWrite: false
            })
        )
        this.indicatorLabelSprite.scale.set(0.84, 0.18, 1)

        this.indicatorGroup.add(this.indicatorLine)
        this.indicatorGroup.add(this.indicatorDot)
        this.indicatorGroup.add(this.indicatorLabelSprite)
        this.experience.scene.add(this.indicatorGroup)
    }

    createIndicatorLabelTexture(text)
    {
        const canvas = document.createElement('canvas')
        canvas.width = 512
        canvas.height = 128
        const context = canvas.getContext('2d')
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = MateriauConstants.INDICATOR_LABEL_BACKGROUND
        context.strokeStyle = 'rgba(135, 219, 255, 0.62)'
        context.lineWidth = 4
        this.drawRoundedRect(context, 10, 18, 492, 92, 32)
        context.fill()
        context.stroke()
        context.fillStyle = MateriauConstants.INDICATOR_LABEL_TEXT_COLOR
        context.font = '600 40px "Helvetica Neue", Arial, sans-serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(String(text || ''), 256, 66)

        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.needsUpdate = true
        return texture
    }

    drawRoundedRect(context, x, y, width, height, radius)
    {
        context.beginPath()
        context.moveTo(x + radius, y)
        context.lineTo(x + width - radius, y)
        context.quadraticCurveTo(x + width, y, x + width, y + radius)
        context.lineTo(x + width, y + height - radius)
        context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
        context.lineTo(x + radius, y + height)
        context.quadraticCurveTo(x, y + height, x, y + height - radius)
        context.lineTo(x, y + radius)
        context.quadraticCurveTo(x, y, x + radius, y)
        context.closePath()
    }

    ensureCursorElement()
    {
        this.cursorElement = document.querySelector('.dialogue__cursor')
        if(this.cursorElement instanceof HTMLElement)
        {
            return
        }

        const fallbackCursor = document.createElement('span')
        fallbackCursor.className = 'dialogue__cursor'
        document.body.appendChild(fallbackCursor)
        this.cursorElement = fallbackCursor
        this.createdCursorElement = true
    }

    setupEvents()
    {
        this.onSceneInteractDown = () =>
        {
            if(this.isInspecting || this.isAnimating) return
            if(!this.isInteractionEnabled) return
            if(!this.nanobotMeshes.length) return

            const hit = this.centerRaycaster.intersectFirstHit(this.nanobotMeshes, false)
            if(hit?.object)
            {
                this.enterInspection()
            }
        }

        this.onMouseDown = (event) =>
        {
            if(!this.isInspecting || this.isAnimating) return
            if(event.button !== 0) return
            if(event.target !== this.experience.canvas) return

            if(this.tryCleanStain(event))
            {
                return
            }

            this.isDragging = true
            this.lastMouseX = event.clientX
            this.lastMouseY = event.clientY
        }

        this.onMouseMove = (event) =>
        {
            if(!this.isDragging) return

            const deltaX = event.clientX - this.lastMouseX
            const deltaY = event.clientY - this.lastMouseY
            this.lastMouseX = event.clientX
            this.lastMouseY = event.clientY

            if(this.pivotGroup)
            {
                this.pivotAzimuth += deltaX * DRAG_SENSITIVITY
                this.pivotElevation += deltaY * DRAG_SENSITIVITY

                const euler = new THREE.Euler(this.pivotElevation, this.pivotAzimuth, 0, 'YXZ')
                this.pivotGroup.setRotationFromEuler(euler)
            }
        }

        this.onMouseUp = (event) =>
        {
            if(event.button !== 0) return
            this.isDragging = false
        }

        this.onWindowResize = () =>
        {
            this.centerScreen.set(window.innerWidth * 0.5, window.innerHeight * 0.5)
        }

        this.inputs.on('sceneinteractdown.nanobotInspector', this.onSceneInteractDown)
        window.addEventListener('mousedown', this.onMouseDown)
        window.addEventListener('mousemove', this.onMouseMove)
        window.addEventListener('mouseup', this.onMouseUp)
        window.addEventListener('resize', this.onWindowResize)
    }

    setupPivot()
    {
        if(!this.nanobotObject) return false

        const box = new THREE.Box3().setFromObject(this.nanobotObject)
        box.getCenter(this.inspectionCenter)
        this.inspectTargetCenter.copy(this.inspectionCenter)
        this.inspectTargetCenter.y += INSPECTION_TARGET_Y_OFFSET
        const size = box.getSize(new THREE.Vector3())
        const radius = size.length() * 0.5
        this.inspectionDistance = Math.max(radius * ZOOM_DISTANCE_FACTOR, ZOOM_DISTANCE_MIN)

        this.pivotGroup = new THREE.Group()
        this.pivotGroup.position.copy(this.inspectTargetCenter)
        this.experience.scene.add(this.pivotGroup)

        this.nanobotObject.updateMatrixWorld()
        const worldPos = new THREE.Vector3()
        const worldQuat = new THREE.Quaternion()
        const worldScale = new THREE.Vector3()
        this.nanobotObject.matrixWorld.decompose(worldPos, worldQuat, worldScale)

        this.nanobotOriginalLocalPos.copy(this.nanobotObject.position)
        this.nanobotOriginalLocalQuat.copy(this.nanobotObject.quaternion)
        this.nanobotOriginalLocalScale.copy(this.nanobotObject.scale)
        this.nanobotOriginalParent = this.nanobotObject.parent

        this.nanobotOriginalParent.remove(this.nanobotObject)
        this.pivotGroup.add(this.nanobotObject)

        this.nanobotObject.position.copy(worldPos).sub(this.inspectionCenter)
        this.nanobotObject.quaternion.copy(worldQuat)
        this.nanobotObject.scale.copy(worldScale).multiplyScalar(INSPECTION_SCALE_FACTOR)

        this.pivotAzimuth = 0
        this.pivotElevation = 0
        this.createCleaningStains()
        return true
    }

    teardownPivot()
    {
        if(!this.pivotGroup || !this.nanobotObject || !this.nanobotOriginalParent) return

        this.pivotGroup.remove(this.nanobotObject)
        this.nanobotOriginalParent.add(this.nanobotObject)
        this.clearCleaningStains()

        this.nanobotObject.position.copy(this.nanobotOriginalLocalPos)
        this.nanobotObject.quaternion.copy(this.nanobotOriginalLocalQuat)
        this.nanobotObject.scale.copy(this.nanobotOriginalLocalScale)

        this.experience.scene.remove(this.pivotGroup)
        this.pivotGroup = null
        this.stainGroup = null
        this.nanobotOriginalParent = null
    }

    createCleaningStains()
    {
        this.clearCleaningStains()

        if(!this.pivotGroup)
        {
            return
        }

        this.stainGroup = new THREE.Group()
        this.pivotGroup.add(this.stainGroup)
        this.pivotGroup.updateMatrixWorld(true)
        this.nanobotObject.updateMatrixWorld(true)

        this.indicatorBounds.setFromObject(this.nanobotObject)
        if(this.indicatorBounds.isEmpty())
        {
            this.remainingStainCount = 0
            return
        }

        this.indicatorBounds.getSize(this.stainSize)
        this.indicatorBounds.getCenter(this.stainSurfaceCenter)
        const stainCount = THREE.MathUtils.randInt(STAIN_MIN_COUNT, STAIN_MAX_COUNT)
        const createdPositions = []

        for(let index = 0; index < stainCount; index++)
        {
            const stainMesh = this.createStainDecal(createdPositions)
            if(!stainMesh)
            {
                continue
            }

            this.cleanableStains.push(stainMesh)
            createdPositions.push(stainMesh.userData.stainPoint.clone())
        }

        this.remainingStainCount = this.cleanableStains.length
    }

    clearCleaningStains()
    {
        for(const stain of this.cleanableStains)
        {
            stain.parent?.remove?.(stain)
            stain.geometry?.dispose?.()
            stain.material?.map?.dispose?.()
            stain.material?.dispose?.()
        }

        this.cleanableStains = []
        this.remainingStainCount = 0

        if(this.stainGroup)
        {
            this.stainGroup.parent?.remove?.(this.stainGroup)
        }
    }

    createStainDecal(existingPositions = [])
    {
        const radius = THREE.MathUtils.randFloat(STAIN_MIN_RADIUS, STAIN_MAX_RADIUS)
        const projection = this.findStainProjection(existingPositions, radius)
        if(!projection)
        {
            return null
        }

        this.stainProjectionSize.set(radius * 2, radius * 2, STAIN_PROJECTOR_DEPTH)
        this.stainTargetPoint.copy(projection.point).addScaledVector(projection.normal, 0.0015)
        this.stainUpVector.set(0, 1, 0)
        if(Math.abs(projection.normal.dot(this.stainUpVector)) > 0.92)
        {
            this.stainUpVector.set(1, 0, 0)
        }

        this.stainLookAtMatrix.lookAt(
            this.stainTargetPoint,
            this.stainTargetPoint.clone().add(projection.normal),
            this.stainUpVector
        )
        this.stainOrientation.setFromRotationMatrix(this.stainLookAtMatrix)
        this.stainOrientation.z = Math.random() * Math.PI * 2

        const geometry = new DecalGeometry(
            projection.object,
            this.stainTargetPoint,
            this.stainOrientation,
            this.stainProjectionSize
        )
        geometry.applyMatrix4(this.pivotInverseMatrix.copy(this.pivotGroup.matrixWorld).invert())

        const material = new THREE.MeshBasicMaterial({
            map: this.createStainTexture(),
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4
        })

        const stainMesh = new THREE.Mesh(geometry, material)
        stainMesh.userData.isNanobotStain = true
        stainMesh.userData.stainPoint = projection.point.clone()
        stainMesh.renderOrder = 24
        this.stainGroup.add(stainMesh)
        return stainMesh
    }

    createStainTexture()
    {
        const canvas = document.createElement('canvas')
        canvas.width = 128
        canvas.height = 128
        const context = canvas.getContext('2d')
        const centerX = 64
        const centerY = 64

        context.clearRect(0, 0, canvas.width, canvas.height)
        for(let index = 0; index < 9; index++)
        {
            const angle = (index / 9) * Math.PI * 2
            const distance = 10 + Math.random() * 24
            const radius = 14 + Math.random() * 18
            const x = centerX + Math.cos(angle) * distance + THREE.MathUtils.randFloatSpread(10)
            const y = centerY + Math.sin(angle) * distance + THREE.MathUtils.randFloatSpread(10)
            const gradient = context.createRadialGradient(x, y, radius * 0.12, x, y, radius)
            gradient.addColorStop(0, 'rgba(32, 53, 60, 0.94)')
            gradient.addColorStop(0.45, 'rgba(84, 115, 122, 0.82)')
            gradient.addColorStop(1, 'rgba(84, 115, 122, 0)')
            context.fillStyle = gradient
            context.beginPath()
            context.arc(x, y, radius, 0, Math.PI * 2)
            context.fill()
        }

        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.needsUpdate = true
        return texture
    }

    findStainProjection(existingPositions = [], radius = STAIN_MIN_RADIUS)
    {
        const radiusX = Math.max(this.stainSize.x * 0.5 - STAIN_SURFACE_PADDING, radius)
        const radiusY = Math.max(this.stainSize.y * 0.5 - STAIN_SURFACE_PADDING, radius)
        const radiusZ = Math.max(this.stainSize.z * 0.5 - STAIN_SURFACE_PADDING, radius)
        const boundsRadius = Math.max(radiusX, radiusY, radiusZ) * STAIN_RAY_DISTANCE_MULTIPLIER
        const maxAttempts = 24

        for(let attempt = 0; attempt < maxAttempts; attempt++)
        {
            this.stainDirection.set(
                THREE.MathUtils.randFloatSpread(2),
                THREE.MathUtils.randFloatSpread(1.6),
                THREE.MathUtils.randFloatSpread(2)
            )

            if(this.stainDirection.lengthSq() < 1e-6)
            {
                this.stainDirection.set(0.2, 0.4, 1)
            }

            this.stainDirection.normalize()
            this.stainRayOrigin.copy(this.stainSurfaceCenter).addScaledVector(this.stainDirection, boundsRadius)
            this.stainRayDirection.copy(this.stainDirection).multiplyScalar(-1)
            this.surfaceRaycaster.set(this.stainRayOrigin, this.stainRayDirection)
            this.surfaceRaycaster.far = boundsRadius * 2.2

            const hit = this.surfaceRaycaster.intersectObjects(this.nanobotMeshes, false)[0]
            if(!hit?.object || !hit.face)
            {
                continue
            }

            const isTooClose = existingPositions.some((position) => position.distanceTo(hit.point) < STAIN_MIN_SPACING)
            if(isTooClose)
            {
                continue
            }

            this.stainNormalMatrix.getNormalMatrix(hit.object.matrixWorld)
            this.stainSurfaceNormal.copy(hit.face.normal).applyMatrix3(this.stainNormalMatrix).normalize()

            return {
                object: hit.object,
                point: hit.point.clone(),
                normal: this.stainSurfaceNormal.clone()
            }
        }

        return null
    }

    computeFixedCamera()
    {
        const dirToCamera = this.camera.position.clone().sub(this.inspectionCenter)
        const flatDir = new THREE.Vector3(dirToCamera.x, 0, dirToCamera.z)

        if(flatDir.lengthSq() < 1e-6)
        {
            flatDir.set(0, 0, 1)
        }

        flatDir.normalize()

        this.fixedCameraPos
            .copy(this.inspectTargetCenter)
            .addScaledVector(flatDir, this.inspectionDistance)
            .add(new THREE.Vector3(0, CAMERA_ELEVATION_OFFSET, 0))

        const m = new THREE.Matrix4()
        m.lookAt(this.fixedCameraPos, this.inspectTargetCenter, THREE.Object3D.DEFAULT_UP)
        this.fixedCameraQuat.setFromRotationMatrix(m)
    }

    enterInspection()
    {
        if(this.isInspecting || this.isAnimating) return
        const player = this.world?.player
        if(!player || !this.nanobotObject) return

        if(!this.setupPivot()) return
        this.computeFixedCamera()

        this.cameraStartPos.copy(this.camera.position)
        this.cameraStartQuat.setFromEuler(this.camera.rotation)
        this.cameraEndPos.copy(this.fixedCameraPos)
        this.cameraEndQuat.copy(this.fixedCameraQuat)
        this.cameraStartFov = this.camera.fov
        this.cameraEndFov = INSPECTION_FOV

        // Flag BEFORE exitPointerLock so PauseMenu's canAutoOpen sees it
        this.experience.isNanobotInspecting = true

        player.setLookEnabled(false)
        this.inputs.exitPointerLock()

        document.body.classList.add('is-nanobot-inspecting')
        this.overlayEl.classList.add('is-visible')

        this.animationProgress = 0
        this.isAnimating = true
        this.isExiting = false
        this.isInspecting = false
    }

    exitInspection()
    {
        if(!this.isInspecting && !this.isAnimating) return

        const player = this.world?.player

        this.cameraStartPos.copy(this.camera.position)
        this.cameraStartQuat.setFromEuler(this.camera.rotation)

        if(player)
        {
            const targetPos = player.cameraSmoothPosition?.clone() ?? player.position.clone()
            this.cameraEndPos.copy(targetPos)
            const exitEuler = new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ')
            this.cameraEndQuat.setFromEuler(exitEuler)
        }
        else
        {
            this.cameraEndPos.copy(this.camera.position)
            this.cameraEndQuat.copy(this.camera.quaternion)
        }

        this.cameraStartFov = this.camera.fov
        this.cameraEndFov = this.defaultCameraFov
        this.animationProgress = 0
        this.isAnimating = true
        this.isExiting = true
        this.isInspecting = false
        this.isDragging = false

        this.overlayEl.classList.remove('is-visible')

        this.teardownPivot()
    }

    finishEnterAnimation()
    {
        this.isAnimating = false
        this.isInspecting = true
        this.camera.position.copy(this.fixedCameraPos)
        this.camera.quaternion.copy(this.fixedCameraQuat)
        this.camera.fov = INSPECTION_FOV
        this.camera.updateProjectionMatrix()
        this.releaseCursor()
        this.hideIndicator()
    }

    finishExitAnimation()
    {
        const player = this.world?.player

        this.isAnimating = false
        this.isExiting = false
        this.experience.isNanobotInspecting = false
        this.camera.fov = this.defaultCameraFov
        this.camera.updateProjectionMatrix()

        if(player)
        {
            player.setLookEnabled(true)
            if(player.cameraSmoothPosition)
            {
                player.cameraSmoothPosition.copy(player.position)
            }
            if(player.cameraSmoothYaw !== undefined)
            {
                player.cameraSmoothYaw = player.yaw
            }
            if(player.cameraSmoothPitch !== undefined)
            {
                player.cameraSmoothPitch = player.pitch
            }
            this.inputs.requestPointerLock(this.experience.canvas)
        }

        document.body.classList.remove('is-nanobot-inspecting')

        this.experience.dialogueManager?.startByKey?.(COMPLETION_DIALOGUE_KEY)
    }

    updateCursor()
    {
        this.cursorElement = this.cursorElement || document.querySelector('.dialogue__cursor')
        if(!(this.cursorElement instanceof HTMLElement))
        {
            return
        }

        this.ownsCursor = true
        document.body.classList.add(MateriauConstants.CURSOR_OWNER_CLASS)
        this.cursorElement.style.left = `${this.centerScreen.x}px`
        this.cursorElement.style.top = `${this.centerScreen.y}px`
        this.cursorElement.classList.add('is-visible')
        this.cursorElement.classList.toggle('is-over-choice', Boolean(this.hoveredMesh))
    }

    releaseCursor()
    {
        if(!this.ownsCursor)
        {
            return
        }

        this.ownsCursor = false
        document.body.classList.remove(MateriauConstants.CURSOR_OWNER_CLASS)

        if(this.cursorElement instanceof HTMLElement)
        {
            this.cursorElement.classList.remove('is-visible')
            this.cursorElement.classList.remove('is-over-choice')
        }
    }

    tryCleanStain(event)
    {
        if(!this.isInspecting || this.cleanableStains.length === 0)
        {
            return false
        }

        const bounds = this.experience.canvas?.getBoundingClientRect?.()
        if(!bounds)
        {
            return false
        }

        this.mouseNdc.set(
            ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            -((event.clientY - bounds.top) / bounds.height) * 2 + 1
        )
        this.raycaster.setFromCamera(this.mouseNdc, this.camera)
        const intersections = this.raycaster.intersectObjects(this.cleanableStains, false)
        const hit = intersections[0]?.object ?? null
        if(!hit)
        {
            return false
        }

        this.cleanStain(hit)
        return true
    }

    cleanStain(stainMesh)
    {
        const stainIndex = this.cleanableStains.indexOf(stainMesh)
        if(stainIndex === -1)
        {
            return
        }

        this.cleanableStains.splice(stainIndex, 1)
        this.remainingStainCount = this.cleanableStains.length
        stainMesh.parent?.remove?.(stainMesh)
        stainMesh.geometry?.dispose?.()
        stainMesh.material?.map?.dispose?.()
        stainMesh.material?.dispose?.()
    }

    updateHoverState()
    {
        this.isInteractionEnabled = this.world?.isValidationInteractionEnabled === true

        if(this.isInspecting || this.isAnimating || !this.isInteractionEnabled || !this.centerRaycaster.hasCamera())
        {
            this.hoveredMesh = null
            this.releaseCursor()
            this.hideIndicator()
            return
        }

        const hoveredNanobotMesh = this.centerRaycaster.intersectFirst(this.nanobotMeshes, false)
        this.hoveredMesh = hoveredNanobotMesh ? this.nanobotObject : null
        this.updateCursor()

        if(this.hoveredMesh)
        {
            this.updateSceneIndicator()
            return
        }
        this.hideIndicator()
    }

    updateSceneIndicator()
    {
        if(!this.hoveredMesh)
        {
            this.hideIndicator()
            return
        }

        this.indicatorBounds.setFromObject(this.hoveredMesh)
        if(this.indicatorBounds.isEmpty())
        {
            this.hideIndicator()
            return
        }

        this.indicatorBounds.getCenter(this.indicatorCenter)
        this.indicatorBounds.getSize(this.indicatorSize)
        const anchorY = this.indicatorBounds.max.y + 0.04
        const labelY = anchorY + Math.max(0.2, this.indicatorSize.y * 0.28) + 0.08

        this.indicatorLinePoints[0].set(this.indicatorCenter.x, anchorY, this.indicatorCenter.z)
        this.indicatorLinePoints[1].set(this.indicatorCenter.x, labelY - 0.05, this.indicatorCenter.z)
        this.indicatorLineGeometry.setFromPoints(this.indicatorLinePoints)

        this.indicatorDot.position.copy(this.indicatorLinePoints[0])
        this.indicatorLabelSprite.position.set(this.indicatorCenter.x, labelY, this.indicatorCenter.z)
        this.indicatorGroup.visible = true
        this.indicatorCurrentVisible = true
    }

    hideIndicator()
    {
        if(this.indicatorGroup)
        {
            this.indicatorGroup.visible = false
        }
        this.indicatorCurrentVisible = false
    }

    easeInOutCubic(t)
    {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    }

    update(delta)
    {
        this.updateHoverState()

        if(!this.isAnimating && !this.isInspecting) return

        const deltaSeconds = Math.min(delta, 50) * 0.001

        if(this.isAnimating)
        {
            this.animationProgress += deltaSeconds / ANIMATION_DURATION
            this.animationProgress = Math.min(this.animationProgress, 1)

            const t = this.easeInOutCubic(this.animationProgress)
            const pos = new THREE.Vector3().lerpVectors(this.cameraStartPos, this.cameraEndPos, t)
            const quat = new THREE.Quaternion().slerpQuaternions(this.cameraStartQuat, this.cameraEndQuat, t)
            const fov = THREE.MathUtils.lerp(this.cameraStartFov, this.cameraEndFov, t)

            this.camera.position.copy(pos)
            this.camera.quaternion.copy(quat)
            this.camera.fov = fov
            this.camera.updateProjectionMatrix()

            if(this.animationProgress >= 1)
            {
                if(this.isExiting)
                {
                    this.finishExitAnimation()
                }
                else
                {
                    this.finishEnterAnimation()
                }
            }
        }

        if(this.isInspecting)
        {
            this.camera.position.copy(this.fixedCameraPos)
            this.camera.quaternion.copy(this.fixedCameraQuat)
        }
    }

    destroy()
    {
        this.inputs.off('sceneinteractdown.nanobotInspector')
        window.removeEventListener('mousedown', this.onMouseDown)
        window.removeEventListener('mousemove', this.onMouseMove)
        window.removeEventListener('mouseup', this.onMouseUp)
        window.removeEventListener('resize', this.onWindowResize)

        this.experience.isNanobotInspecting = false
        document.body.classList.remove('is-nanobot-inspecting')
        this.releaseCursor()
        this.hideIndicator()

        if(this.closeBtnEl)
        {
            this.closeBtnEl.removeEventListener('click', this.onCloseClick)
        }

        if(this.overlayEl)
        {
            this.overlayEl.remove()
            this.overlayEl = null
            this.closeBtnEl = null
        }

        this.teardownPivot()

        if(this.indicatorGroup)
        {
            this.experience.scene.remove(this.indicatorGroup)
            this.indicatorLineGeometry?.dispose?.()
            this.indicatorLine?.material?.dispose?.()
            this.indicatorDot?.geometry?.dispose?.()
            this.indicatorDot?.material?.dispose?.()
            this.indicatorLabelSprite?.material?.map?.dispose?.()
            this.indicatorLabelSprite?.material?.dispose?.()
        }

        if(this.createdCursorElement && this.cursorElement instanceof HTMLElement)
        {
            this.cursorElement.remove()
        }

        if((this.isInspecting || this.isAnimating) && this.world?.player)
        {
            this.world.player.setLookEnabled(true)
        }

        this.cursorElement = null
        this.indicatorGroup = null
    }
}
