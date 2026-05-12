import * as THREE from 'three'

export const UP_AXIS = new THREE.Vector3(0, 1, 0)
export const GROUND_IGNORED_TOKENS = ['building', 'balcon', 'window', 'fenetre', 'fenêtre']
export const COLLISION_OCTREE_MARGIN = 0.35
export const PLAYER_HEAD_TOP_OFFSET = 0.04
export const CEILING_HIT_EPSILON = 0.02
export const COLLISION_CONTACT_EPSILON = 0.002
export const COLLISION_MIN_DISTANCE = 0.0001
export const WALL_NORMAL_MAX_Y = 0.65
