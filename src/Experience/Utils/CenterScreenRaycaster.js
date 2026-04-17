import * as THREE from 'three'

export default class CenterScreenRaycaster
{
    constructor({ getCamera = null } = {})
    {
        this.getCamera = typeof getCamera === 'function' ? getCamera : () => null
        this.raycaster = new THREE.Raycaster()
        this.centerNdc = new THREE.Vector2(0, 0)
    }

    hasCamera()
    {
        return Boolean(this.getCamera())
    }

    intersectFirst(objects, recursive = false)
    {
        const camera = this.getCamera()
        if(!camera || !Array.isArray(objects) || objects.length === 0)
        {
            return null
        }

        this.raycaster.setFromCamera(this.centerNdc, camera)
        const hits = this.raycaster.intersectObjects(objects, recursive)
        return hits[0]?.object ?? null
    }
}
