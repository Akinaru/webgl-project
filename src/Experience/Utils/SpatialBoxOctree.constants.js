import * as THREE from 'three'

export const DEFAULT_MAX_DEPTH = 8
export const DEFAULT_MAX_ITEMS_PER_NODE = 12
export const MIN_NODE_SIZE = 0.0001

export function computeRootBounds(entries)
{
    const bounds = new THREE.Box3()
    let hasBounds = false

    for(const entry of entries)
    {
        const entryBounds = entry?.bounds
        if(!(entryBounds instanceof THREE.Box3) || entryBounds.isEmpty())
        {
            continue
        }

        if(!hasBounds)
        {
            bounds.copy(entryBounds)
            hasBounds = true
            continue
        }

        bounds.union(entryBounds)
    }

    return hasBounds ? bounds : null
}

export class SpatialBoxOctreeNode
{
    constructor(bounds, depth, maxDepth, maxItemsPerNode)
    {
        this.bounds = bounds
        this.depth = depth
        this.maxDepth = maxDepth
        this.maxItemsPerNode = maxItemsPerNode
        this.items = []
        this.children = null
    }

    insert(item)
    {
        if(this.children)
        {
            const childIndex = this.getContainingChildIndex(item.bounds)
            if(childIndex !== -1)
            {
                this.children[childIndex].insert(item)
                return
            }
        }

        this.items.push(item)
        if(this.children || this.depth >= this.maxDepth || this.items.length <= this.maxItemsPerNode)
        {
            return
        }

        this.subdivide()
        this.redistributeItems()
    }

    query(queryBounds, out)
    {
        if(!this.bounds.intersectsBox(queryBounds))
        {
            return
        }

        for(const item of this.items)
        {
            if(item.bounds.intersectsBox(queryBounds))
            {
                out.push(item.payload)
            }
        }

        if(!this.children)
        {
            return
        }

        for(const child of this.children)
        {
            child.query(queryBounds, out)
        }
    }

    subdivide()
    {
        const size = this.bounds.getSize(new THREE.Vector3())
        if(size.x < MIN_NODE_SIZE || size.y < MIN_NODE_SIZE || size.z < MIN_NODE_SIZE)
        {
            return
        }

        const min = this.bounds.min
        const max = this.bounds.max
        const center = this.bounds.getCenter(new THREE.Vector3())

        this.children = []

        for(let x = 0; x < 2; x++)
        {
            for(let y = 0; y < 2; y++)
            {
                for(let z = 0; z < 2; z++)
                {
                    const childMin = new THREE.Vector3(
                        x === 0 ? min.x : center.x,
                        y === 0 ? min.y : center.y,
                        z === 0 ? min.z : center.z
                    )
                    const childMax = new THREE.Vector3(
                        x === 0 ? center.x : max.x,
                        y === 0 ? center.y : max.y,
                        z === 0 ? center.z : max.z
                    )

                    this.children.push(
                        new SpatialBoxOctreeNode(
                            new THREE.Box3(childMin, childMax),
                            this.depth + 1,
                            this.maxDepth,
                            this.maxItemsPerNode
                        )
                    )
                }
            }
        }
    }

    redistributeItems()
    {
        if(!this.children)
        {
            return
        }

        const remainingItems = []
        for(const item of this.items)
        {
            const childIndex = this.getContainingChildIndex(item.bounds)
            if(childIndex === -1)
            {
                remainingItems.push(item)
                continue
            }

            this.children[childIndex].insert(item)
        }

        this.items = remainingItems
    }

    getContainingChildIndex(itemBounds)
    {
        if(!this.children)
        {
            return -1
        }

        for(let index = 0; index < this.children.length; index++)
        {
            const childBounds = this.children[index].bounds
            if(childBounds.containsBox(itemBounds))
            {
                return index
            }
        }

        return -1
    }

    collectBounds(out, { leavesOnly = false, maxDepth = Infinity } = {})
    {
        if(this.depth > maxDepth)
        {
            return
        }

        const isLeaf = !this.children || this.children.length === 0
        if(!leavesOnly || isLeaf)
        {
            out.push(this.bounds.clone())
        }

        if(!this.children)
        {
            return
        }

        for(const child of this.children)
        {
            child.collectBounds(out, {
                leavesOnly,
                maxDepth
            })
        }
    }
}
