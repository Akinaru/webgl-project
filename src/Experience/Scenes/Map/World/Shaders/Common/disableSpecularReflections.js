const STANDARD_SPECULAR_OUTGOING_LIGHT = 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;'
const PHONG_SPECULAR_OUTGOING_LIGHT = 'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;'
const LAMBERT_OUTGOING_LIGHT = 'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;'
const TOON_OUTGOING_LIGHT = 'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;'
const BASIC_OUTGOING_LIGHT = 'vec3 outgoingLight = reflectedLight.indirectDiffuse;'

// Neutralise les reflets speculaires des surfaces d eau tout en gardant leur eclairage diffus.
export function applyMatteWaterMaterial(material)
{
    if(!material)
    {
        return material
    }

    if('roughness' in material)
    {
        material.roughness = 1
    }
    if('metalness' in material)
    {
        material.metalness = 0
    }
    if('envMapIntensity' in material)
    {
        material.envMapIntensity = 0
    }
    if('reflectivity' in material)
    {
        material.reflectivity = 0
    }
    if('specularIntensity' in material)
    {
        material.specularIntensity = 0
    }
    if('clearcoat' in material)
    {
        material.clearcoat = 0
    }
    if('clearcoatRoughness' in material)
    {
        material.clearcoatRoughness = 1
    }
    if('sheen' in material)
    {
        material.sheen = 0
    }
    if('sheenRoughness' in material)
    {
        material.sheenRoughness = 1
    }
    if('iridescence' in material)
    {
        material.iridescence = 0
    }

    return material
}

export function stripSpecularReflectionsFromShader(shader)
{
    if(!shader?.fragmentShader)
    {
        return
    }

    shader.fragmentShader = shader.fragmentShader
        .replace(
            STANDARD_SPECULAR_OUTGOING_LIGHT,
            'vec3 outgoingLight = diffuseColor.rgb + totalEmissiveRadiance;'
        )
        .replace(
            PHONG_SPECULAR_OUTGOING_LIGHT,
            'vec3 outgoingLight = diffuseColor.rgb + totalEmissiveRadiance;'
        )
        .replace(
            LAMBERT_OUTGOING_LIGHT,
            'vec3 outgoingLight = diffuseColor.rgb + totalEmissiveRadiance;'
        )
        .replace(
            TOON_OUTGOING_LIGHT,
            'vec3 outgoingLight = diffuseColor.rgb + totalEmissiveRadiance;'
        )
        .replace(
            BASIC_OUTGOING_LIGHT,
            'vec3 outgoingLight = diffuseColor.rgb;'
        )
}
