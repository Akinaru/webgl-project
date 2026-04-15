import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import EventEmitter from './EventEmitter.js'
import EventEnum from '../Enum/EventEnum.js'

export default class Resources extends EventEmitter
{
    constructor(sources)
    {
        super()

        this.sources = sources
        this.items = {}
        this.toLoad = this.sources.length
        this.loaded = 0
        this.isReady = false

        this.setLoaders()
        this.startLoading()
    }

    setLoaders()
    {
        this.loaders = {}
        this.loaders.gltfLoader = new GLTFLoader()
        this.loaders.textureLoader = new THREE.TextureLoader()
        this.loaders.cubeTextureLoader = new THREE.CubeTextureLoader()
    }

    startLoading()
    {
        if(this.toLoad === 0)
        {
            this.isReady = true
            queueMicrotask(() =>
            {
                this.trigger(EventEnum.READY)
            })
            return
        }

        for(const source of this.sources)
        {
            if(source.type === 'gltfModel')
            {
                this.loaders.gltfLoader.load(
                    source.path,
                    (file) =>
                    {
                        this.sourceLoaded(source, file)
                    },
                    undefined,
                    (error) =>
                    {
                        console.error(`[Resources] Echec de chargement: ${source.path}`, error)
                        this.sourceLoaded(source, null)
                    }
                )
            }
            else if(source.type === 'texture')
            {
                this.loaders.textureLoader.load(
                    source.path,
                    (file) =>
                    {
                        this.sourceLoaded(source, file)
                    },
                    undefined,
                    (error) =>
                    {
                        console.error(`[Resources] Echec de chargement: ${source.path}`, error)
                        this.sourceLoaded(source, null)
                    }
                )
            }
            else if(source.type === 'cubeTexture')
            {
                this.loaders.cubeTextureLoader.load(
                    source.path,
                    (file) =>
                    {
                        this.sourceLoaded(source, file)
                    },
                    undefined,
                    (error) =>
                    {
                        console.error(`[Resources] Echec de chargement: ${source.path}`, error)
                        this.sourceLoaded(source, null)
                    }
                )
            }
            else
            {
                console.warn(`Type de source inconnu: ${source.type}`)
                this.sourceLoaded(source, null)
            }
        }
    }

    sourceLoaded(source, file)
    {
        this.items[source.name] = file
        this.loaded++

        if(this.loaded === this.toLoad)
        {
            this.isReady = true
            this.trigger(EventEnum.READY)
        }
    }
}
