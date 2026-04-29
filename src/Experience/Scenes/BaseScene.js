import * as THREE from 'three'

export default class BaseScene
{
    constructor(name)
    {
        this.name = name
        this.instance = new THREE.Scene()
    }

    enter()
    {
        // Hook de cycle de vie.
    }

    exit()
    {
        // Hook de cycle de vie.
    }

    resize()
    {
        // Hook de cycle de vie.
    }

    update()
    {
        // Hook de cycle de vie.
    }

    destroy()
    {
        // Hook de cycle de vie.
    }
}
