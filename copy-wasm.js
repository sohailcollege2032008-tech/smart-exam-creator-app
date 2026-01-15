const fs = require('fs');
const path = require('path');

try {
    const src = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    const destDir = path.join(__dirname, 'public');
    const dest = path.join(destDir, 'sql-wasm.wasm');

    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
        console.log('Created public directory');
    }

    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log('✅ Success: sql-wasm.wasm copied to public folder.');
    } else {
        console.error('❌ Error: Source file not found at ' + src);
        console.log('cwd: ' + process.cwd());
    }
} catch (error) {
    console.error('❌ Failed:', error);
}
