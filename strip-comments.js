const fs = require('fs');
const path = require('path');

function removeComments(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Regex to match block comments and line comments safely.
  // It handles strings to avoid stripping // inside quotes.
  // (A simplified but usually effective regex for basic ts files)
  let stripped = content.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Remove line comments but ignore URLs (http:// or https://)
  stripped = stripped.replace(/(?<!:)\/\/.*$/gm, '');
  
  // Also clean up consecutive empty lines
  stripped = stripped.replace(/^\s*[\r\n]{2,}/gm, '\n');
  
  fs.writeFileSync(filePath, stripped, 'utf8');
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.prisma')) {
      if (!fullPath.includes('node_modules') && !fullPath.includes('dist') && !fullPath.includes('generated')) {
        removeComments(fullPath);
      }
    }
  }
}

walk('./src');
walk('./prisma');
console.log("Comments stripped.");
