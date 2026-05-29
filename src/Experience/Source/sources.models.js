const BLOOM_MODEL_CACHE_BUSTER = 'anim-fix-2026-05-12'

export default [
    {
        name: 'bloomModel',
        type: 'gltfModel',
        path: `models/bloom/model/Bloom_Draco.glb?v=${BLOOM_MODEL_CACHE_BUSTER}`
    },
    {
        name: 'mapModel',
        type: 'gltfModel',
        path: 'models/scenes/map/Map_Draco.glb'
    },
    {
        name: 'recuperationModel',
        type: 'gltfModel',
        path: 'models/scenes/recuperation/SceneRecuperation_Draco.glb'
    },
    {
        name: 'recyclageModel',
        type: 'gltfModel',
        path: 'models/scenes/recyclage/SceneRecyclage_Draco.glb'
    },
    {
        name: 'distributionModel',
        type: 'gltfModel',
        path: 'models/scenes/distribution/SceneDistribution_Draco.glb'
    },
    {
        name: 'buildingTourModel',
        type: 'gltfModel',
        path: 'models/scenes/map/building_tour_Draco.glb'
    },
    {
        name: 'buildingFeuilleModel',
        type: 'gltfModel',
        path: 'models/scenes/map/building_feuille_Draco.glb'
    }
]
