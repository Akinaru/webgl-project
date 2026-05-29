const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Draco Compression Script for Fluid Project
 * Usage: node tools/compress-models.js [file-or-dir]
 */

const inputArg = process.argv[2];
if (!inputArg) {
    console.error('Usage: node tools/compress-models.js <path-to-gltf-or-directory>');
    process.exit(1);
}

const inputPath = path.resolve(process.cwd(), inputArg);

function compressFile(filePath) {
    if (!filePath.match(/\.(gltf|glb)$/i) || filePath.includes('_Draco.glb')) {
        return;
    }

    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const outputPath = path.join(dir, `${baseName}_Draco.glb`);

    console.log(`\n📦 Compressing: ${path.basename(filePath)}...`);
    
    try {
        // Use gltf-pipeline for Draco compression
        // -d: draco, -b: output as glb
        execSync(`npx gltf-pipeline -i "${filePath}" -o "${outputPath}" -d -b`, { stdio: 'inherit' });
        console.log(`✅ Success! Saved to: ${path.basename(outputPath)}`);
        
        const originalSize = fs.statSync(filePath).size / (1024 * 1024);
        const newSize = fs.statSync(outputPath).size / (1024 * 1024);
        const gain = ((1 - newSize / originalSize) * 100).toFixed(1);
        
        console.log(`📊 Size: ${originalSize.toFixed(2)}MB -> ${newSize.toFixed(2)}MB (-${gain}%)`);
    } catch (error) {
        console.error(`❌ Failed to compress ${filePath}:`, error.message);
    }
}

if (fs.statSync(inputPath).isDirectory()) {
    console.log(`📁 Scanning directory: ${inputPath}`);
    const files = fs.readdirSync(inputPath);
    files.forEach(file => {
        const fullPath = path.join(inputPath, file);
        if (fs.statSync(fullPath).isFile()) {
            compressFile(fullPath);
        }
    });
} else {
    compressFile(inputPath);
}
