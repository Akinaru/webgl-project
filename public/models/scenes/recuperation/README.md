# Modèles de la scène Récupération

Cette scène utilise des modèles compressés avec **Draco** pour optimiser les performances de chargement.

## Convention de nommage
- Modèle source : `SceneRecuperation.gltf`
- Modèle optimisé : `SceneRecuperation_Draco.glb` (utilisé par le jeu)

## Comment mettre à jour le modèle ?
Si vous remplacez le fichier source, générez la version Draco en utilisant cette commande à la racine du projet :

```bash
node tools/compress-models.cjs public/models/scenes/recuperation/SceneRecuperation.gltf
```

*(Note : La version source est ignorée par Git pour éviter de surcharger le dépôt.)*
