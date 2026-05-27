# Modèles de la scène Map

Cette scène utilise des modèles compressés avec **Draco** pour optimiser les performances de chargement.

## Convention de nommage
- Modèle source : `Map.gltf`, `building_tour.gltf`, `building_feuille.gltf`
- Modèle optimisé : `[Nom]_Draco.glb` (utilisé par le jeu)

## Comment mettre à jour les modèles ?
Si vous remplacez un fichier source, générez la version Draco en utilisant cette commande à la racine du projet :

```bash
node tools/compress-models.cjs public/models/scenes/map/
```

*(Note : Les versions sources sont ignorées par Git pour éviter de surcharger le dépôt.)*
