import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import EventEmitter from './EventEmitter.js'
import EventEnum from '../Enum/EventEnum.js'

export default class Resources extends EventEmitter
{
    constructor(sources, { autoStart = true } = {})
    {
        super()

        this.sources = sources || []
        this.items = {}
        this.toLoad = 0
        this.loaded = 0
        this.isReady = false
        this.hasStartedLoading = false

        this.setLoaders()

        if(autoStart && this.toLoad > 0)
        {
            this.startLoading()
        }
    }

    setLoaders()
    {
        this.loaders = {}
        this.loaders.gltfLoader = new GLTFLoader()
        this.loaders.textureLoader = new THREE.TextureLoader()
        this.loaders.exrLoader = new EXRLoader()
        this.loaders.cubeTextureLoader = new THREE.CubeTextureLoader()
        this.loaders.audioLoader = new THREE.AudioLoader()
    }

    startLoading(sources = null)
    {
        const sourcesToLoad = sources || this.sources
        if(!Array.isArray(sourcesToLoad) || sourcesToLoad.length === 0)
        {
            console.log('[Resources] Aucune source à charger')
            this.checkReady()
            return Promise.resolve()
        }

        // Filtrer pour ne pas recharger ce qui l'est déjà
        const newSources = sourcesToLoad.filter(s => !this.items[s.name])
        console.log(`[Resources] Demande de chargement: ${sourcesToLoad.length} total, ${newSources.length} nouveaux`)

        if(newSources.length === 0)
        {
            this.checkReady()
            return Promise.resolve()
        }

        this.hasStartedLoading = true
        this.toLoad += newSources.length
        console.log(`[Resources] Nouvel état: toLoad=${this.toLoad}, loaded=${this.loaded}`)

        const promises = newSources.map(source => this.loadSource(source))
        
        return Promise.all(promises).then(() => {
            console.log('[Resources] Fin du groupe de chargement')
            this.checkReady()
        })
    }

    loadSource(source)
    {
        return new Promise((resolve) => {
            const onLoad = (file) => {
                console.log(`[Resources] Succès: ${source.name} (${source.path})`)
                this.sourceLoaded(source, file)
                resolve(file)
            }
            const onError = (error) => {
                console.error(`[Resources] Echec de chargement: ${source.name} (${source.path})`, error)
                this.sourceLoaded(source, null)
                resolve(null)
            }

            console.log(`[Resources] Lancement: ${source.name}...`)
            if(source.type === 'gltfModel')
            {
                this.loaders.gltfLoader.load(source.path, onLoad, undefined, onError)
            }
            else if(source.type === 'texture')
            {
                this.loaders.textureLoader.load(source.path, onLoad, undefined, onError)
            }
            else if(source.type === 'exrTexture')
            {
                this.loaders.exrLoader.load(source.path, onLoad, undefined, onError)
            }
            else if(source.type === 'cubeTexture')
            {
                this.loaders.cubeTextureLoader.load(source.path, onLoad, undefined, onError)
            }
            else if(source.type === 'audioBuffer')
            {
                this.loaders.audioLoader.load(source.path, onLoad, undefined, onError)
            }
            else
            {
                console.warn(`Type de source inconnu: ${source.type}`)
                this.sourceLoaded(source, null)
                resolve(null)
            }
        })
    }

    sourceLoaded(source, file)
    {
        if(this.items[source.name]) return
        this.items[source.name] = file
        this.loaded++
        this.trigger('itemLoaded', [source, file])
    }

    checkReady()
    {
        if(this.loaded >= this.toLoad && !this.isReady)
        {
            this.isReady = true
            this.trigger(EventEnum.READY)
        }
    }

    /**
     * Charge un groupe de ressources et retourne une promesse résolue quand fini.
     */
    async loadGroup(sources = [])
    {
        if(!Array.isArray(sources) || sources.length === 0) return
        this.isReady = false // On repasse en mode chargement
        await this.startLoading(sources)
    }
}
