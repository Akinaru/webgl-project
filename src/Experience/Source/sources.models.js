const BLOOM_MODEL_CACHE_BUSTER = 'anim-fix-2026-05-12'

export default [
    {
        name: 'bloomModel',
        type: 'gltfModel',
        path: `models/bloom/model/Bloom.gltf?v=${BLOOM_MODEL_CACHE_BUSTER}`
    },
    {
        name: 'mapModel',
        type: 'gltfModel',
        path: 'models/scenes/map/Map.gltf'
    },
    {
        name: 'recuperationModel',
        type: 'gltfModel',
        path: 'models/scenes/recuperation/SceneRecuperation.gltf'
    },
    {
        name: 'distributionModel',
        type: 'gltfModel',
        path: 'models/scenes/distribution/SceneDistribution.gltf'
    }
]
