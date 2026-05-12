import * as THREE from 'three'
import * as SpatialBoxOctreeConstants from './SpatialBoxOctree.constants.js'

export default class SpatialBoxOctree
{
    constructor({ maxDepth = SpatialBoxOctreeConstants.DEFAULT_MAX_DEPTH, maxItemsPerNode = SpatialBoxOctreeConstants.DEFAULT_MAX_ITEMS_PER_NODE } = {})
    {
        this.maxDepth = maxDepth
        this.maxItemsPerNode = maxItemsPerNode
        this.root = null
    }

    build(items = [])
    {
        const validItems = items.filter((item) => item?.bounds instanceof THREE.Box3 && !item.bounds.isEmpty())
        const rootBounds = SpatialBoxOctreeConstants.computeRootBounds(validItems)

        if(!rootBounds)
        {
            this.root = null
            return
        }

        this.root = new SpatialBoxOctreeConstants.SpatialBoxOctreeNode(
            rootBounds.clone(),
            0,
            this.maxDepth,
            this.maxItemsPerNode
        )

        for(const item of validItems)
        {
            this.root.insert({
                bounds: item.bounds,
                payload: item.payload
            })
        }
    }

    queryBox(queryBounds, out = [])
    {
        if(!(queryBounds instanceof THREE.Box3) || !this.root)
        {
            return out
        }

        this.root.query(queryBounds, out)
        return out
    }

    collectNodeBounds({ leavesOnly = false, maxDepth = Infinity } = {})
    {
        const result = []
        if(!this.root)
        {
            return result
        }

        this.root.collectBounds(result, {
            leavesOnly,
            maxDepth
        })
        return result
    }
}
