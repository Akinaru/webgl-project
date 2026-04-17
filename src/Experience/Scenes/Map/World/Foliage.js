import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const DEFAULT_PLANE_COUNT = 80
const DEFAULT_PLANE_SIZE = 0.8
const DEFAULT_NORMAL_BLEND = 0.85
const DEFAULT_ALPHA_TEST = 0.4
const DEFAULT_ROTATION_RANDOMNESS = 9999

export default class Foliage
{
    constructor({
        planeCount = DEFAULT_PLANE_COUNT,
        planeSize = DEFAULT_PLANE_SIZE,
        color = '#88a94a',
        seed = 0x79f8a1d3,
        alphaTexture = null,
        alphaTest = DEFAULT_ALPHA_TEST,
        normalBlend = DEFAULT_NORMAL_BLEND,
        rotationRandomness = DEFAULT_ROTATION_RANDOMNESS,
        createMesh = true
    } = {})
    {
        this.planeCount = Math.max(1, Math.floor(planeCount))
        this.planeSize = planeSize
        this.color = color
        this.seed = seed >>> 0
        this.alphaTexture = alphaTexture
        this.alphaTest = alphaTest
        this.normalBlend = THREE.MathUtils.clamp(normalBlend, 0, 1)
        this.rotationRandomness = Math.max(0, rotationRandomness)
        this.createMesh = Boolean(createMesh)

        this.random = this.createSeededRandom(this.seed)

        this.init()
    }

    init()
    {
        this.setGeometry()
        this.setMaterial()
        if(this.createMesh)
        {
            this.setMesh()
        }
    }

    createSeededRandom(seed)
    {
        let state = seed >>> 0

        return () =>
        {
            state += 0x6D2B79F5
            let t = state
            t = Math.imul(t ^ (t >>> 15), t | 1)
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
    }

    setGeometry()
    {
        const count = this.planeCount
        const planes = []

        for(let i = 0; i < count; i++)
        {
            const plane = new THREE.PlaneGeometry(this.planeSize, this.planeSize)
            planes.push(plane)

            const spherical = new THREE.Spherical(
                1 - Math.pow(this.random(), 3),
                Math.PI * 2 * this.random(),
                Math.PI * this.random()
            )
            const position = new THREE.Vector3().setFromSpherical(spherical)

            plane.rotateX(this.random() * this.rotationRandomness)
            plane.rotateY(this.random() * this.rotationRandomness)
            plane.rotateZ(this.random() * this.rotationRandomness)
            plane.translate(position.x, position.y, position.z)

            const normal = position.clone().normalize()
            const normalArray = new Float32Array(12)
            for(let vertexIndex = 0; vertexIndex < 4; vertexIndex++)
            {
                const i3 = vertexIndex * 3
                const vertexPosition = new THREE.Vector3(
                    plane.attributes.position.array[i3],
                    plane.attributes.position.array[i3 + 1],
                    plane.attributes.position.array[i3 + 2]
                )

                const mixedNormal = vertexPosition.lerp(normal, this.normalBlend)
                normalArray[i3] = mixedNormal.x
                normalArray[i3 + 1] = mixedNormal.y
                normalArray[i3 + 2] = mixedNormal.z
            }

            plane.setAttribute('normal', new THREE.BufferAttribute(normalArray, 3))
        }

        this.geometry = mergeGeometries(planes)

        for(const plane of planes)
        {
            plane.dispose()
        }
    }

    setMaterial()
    {
        if(this.alphaTexture)
        {
            if('NoColorSpace' in THREE)
            {
                this.alphaTexture.colorSpace = THREE.NoColorSpace
            }
            this.alphaTexture.minFilter = THREE.NearestFilter
            this.alphaTexture.magFilter = THREE.NearestFilter
            this.alphaTexture.generateMipmaps = false
            this.alphaTexture.needsUpdate = true
        }

        this.material = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.86,
            metalness: 0,
            side: THREE.DoubleSide,
            alphaMap: this.alphaTexture,
            alphaTest: this.alphaTexture ? this.alphaTest : 0,
            transparent: false,
            opacity: 1
        })

        this.material.depthWrite = true
        this.material.depthTest = true
    }

    setColor(color)
    {
        this.color = color
        this.material?.color?.set?.(color)
    }

    setAlphaTest(alphaTest)
    {
        this.alphaTest = Math.max(0, alphaTest)
        if(this.material)
        {
            this.material.alphaTest = this.alphaTexture ? this.alphaTest : 0
            this.material.needsUpdate = true
        }
    }

    setMesh()
    {
        this.mesh = new THREE.Mesh(this.geometry, this.material)
        this.mesh.name = '__mapBushFoliage'
        this.mesh.castShadow = true
        this.mesh.receiveShadow = true
    }

    update()
    {
        // Placeholder pour les prochaines etapes (wind/material/shader) du buisson.
    }

    destroy()
    {
        this.mesh?.removeFromParent?.()
        this.geometry?.dispose?.()
        this.material?.dispose?.()
        this.mesh = null
        this.geometry = null
        this.material = null
        this.alphaTexture = null
    }
}
