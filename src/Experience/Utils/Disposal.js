import * as THREE from 'three'

/**
 * Utility for recursive disposal of Three.js objects to free GPU memory.
 */
export default class Disposal
{
    /**
     * Recursively disposes of an object, its children, geometries, and materials.
     * @param {THREE.Object3D} object 
     */
    static disposeObject(object)
    {
        if(!object) return

        let geometriesDisposed = 0
        let materialsDisposed = 0
        let texturesDisposed = 0

        object.traverse((child) =>
        {
            // Dispose geometry
            if(child.geometry)
            {
                child.geometry.dispose()
                geometriesDisposed++
            }

            // Dispose materials
            if(child.material)
            {
                if(Array.isArray(child.material))
                {
                    child.material.forEach(material => {
                        texturesDisposed += this.disposeMaterial(material)
                        materialsDisposed++
                    })
                }
                else
                {
                    texturesDisposed += this.disposeMaterial(child.material)
                    materialsDisposed++
                }
            }
        })

        // Remove from parent if applicable
        if(object.parent)
        {
            object.parent.remove(object)
        }

        if (geometriesDisposed > 0 || materialsDisposed > 0) {
            console.log(`[Disposal] Object "${object.name || 'unnamed'}" disposed: ${geometriesDisposed} geometries, ${materialsDisposed} materials, ${texturesDisposed} textures.`)
        }
    }

    /**
     * Disposes of a material and all its associated textures.
     * @param {THREE.Material} material 
     * @returns {number} Count of textures disposed
     */
    static disposeMaterial(material)
    {
        if(!material) return 0

        let texturesDisposed = 0

        // Thoroughly check for textures in all common material properties
        const textureKeys = [
            'map', 'lightMap', 'bumpMap', 'normalMap', 'displacementMap', 
            'roughnessMap', 'metalnessMap', 'alphaMap', 'envMap', 'emissiveMap',
            'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
            'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularIntensityMap', 'specularColorMap'
        ]

        textureKeys.forEach(key => {
            if (material[key] && material[key].isTexture) {
                material[key].dispose()
                texturesDisposed++
            }
        })

        // Also check uniforms for ShaderMaterials
        if (material.uniforms) {
            Object.values(material.uniforms).forEach(uniform => {
                if (uniform && uniform.value) {
                    if (uniform.value.isTexture) {
                        uniform.value.dispose()
                        texturesDisposed++
                    } else if (Array.isArray(uniform.value)) {
                        uniform.value.forEach(v => {
                            if (v && v.isTexture) {
                                v.dispose()
                                texturesDisposed++
                            }
                        })
                    }
                }
            })
        }

        material.dispose()
        return texturesDisposed
    }

    /**
     * Clear a Three.js scene completely by disposing all its children.
     * @param {THREE.Scene} scene 
     */
    static clearScene(scene)
    {
        if(!scene || !scene.isScene) return

        console.log(`[Disposal] Clearing scene: ${scene.uuid}`)

        // We need to work on a copy of the children array because disposeObject removes them
        const children = [...scene.children]
        children.forEach(child => this.disposeObject(child))
    }
}
