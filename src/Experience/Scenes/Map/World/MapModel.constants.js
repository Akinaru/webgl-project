export const FORCE_DOUBLE_SIDE_COLLISION_TOKENS = ['buildingx', 'plantes', 'fontaine', 'fountain']
export const BLOOM_CONTOUR_AVOID_TOKENS = ['buildingx', 'plantes']
export const FOUNTAIN_NAME_TOKENS = ['fontaine', 'fountain']
export const FOUNTAIN_STRICT_COLLISION_TOKENS = ['fontaine_1']
export const EXTRA_WALKABLE_SURFACE_TOKENS = ['remailleur', 'polygone1_instance']
export const FOUNTAIN_TOP_COLLISION_HEIGHT = 0.28
export const FOUNTAIN_TOP_COLLISION_OUTER_MARGIN = 0.06
export const FOUNTAIN_TOP_COLLISION_INNER_RATIO = 0.32
export const FOUNTAIN_TOP_COLLISION_MIN_RING_THICKNESS = 0.08
export const FOUNTAIN_TOP_COLLISION_STRICT_INSET = 0.12
export const PLAN_HEIGHT_TEXTURE_RESOLUTION = 256
export const PLAN_NOISE_TEXTURE_RESOLUTION = 128
export const PALM_MASTER_NAME = 'palmier_master'
export const PALM_PLACEMENT_NAME_PATTERN = /^palmier_[^_]+_nul$/i
export const USER_DATA_EXCLUDE_COLLISION = 'excludeCollisionFromMapModel'
export const USER_DATA_BUILDING_INSTANCE = 'isBuildingInstanceMesh'
export const USER_DATA_BUILDING_COLLISION_PROXY_INSTANCE = 'isBuildingCollisionProxyInstanceMesh'
export const USER_DATA_PALM_MASTER = 'isPalmMasterMesh'
export const USER_DATA_PALM_PLACEMENT = 'isPalmPlacementMesh'
export const USER_DATA_REPEATABLE_MASTER = 'isRepeatableMasterMesh'
export const USER_DATA_REPEATABLE_PLACEMENT = 'isRepeatablePlacementMesh'
export const SCALE_EPSILON = 1e-5
export const BUILDING_INSTANCE_Y_OFFSET_DEFAULT = -0.58
export const BUSH_SOCKET_EXTERIOR_NAME_PATTERN = /^socle_ext_bush_nul_\d+$/i
export const BUSH_SOCKET_INTERIOR_NAME_PATTERN = /^socle_int_bush_nul_\d+$/i
export const COLLISION_PROXY_NAME_PATTERN = /^col_/i
export const REPEATABLE_INSTANCE_CONFIGS = [
    {
        key: 'build_tour',
        masterName: 'build_tour_master',
        collisionMasterName: 'col_build_tour-1',
        placementPattern: /^build_tour_[^_]+_nul$/i
    },
    {
        key: 'build_feuille',
        masterName: 'build_feuille_master1',
        collisionMasterName: 'col_build_feuille-1',
        placementPattern: /^build_feuille_[^_]+_nul$/i
    }
]
