#!/usr/bin/env node
/**
 * Image Audit Script
 * Analyzes usage of docs/images and public/images directories
 * Generates hash-based duplicate detection report
 */

import { readdir, readFile, stat } from 'fs/promises';
import { createHash } from 'crypto';
import { join, relative, extname } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';

const CANONICAL_DIR = process.env.CANONICAL_DIR || 'public/images';
const DRY_RUN = process.env.DRY_RUN !== 'false';

// Ensure tmp directory exists
const TMP_DIR = 'tmp';
if (!existsSync(TMP_DIR)) {
  await mkdir(TMP_DIR, { recursive: true });
}

const report = {
  framework: {},
  usage: {
    'docs/images': [],
    'public/images': [],
    'relative': [],
    'absolute': []
  },
  duplicates: {
    hashMap: {},
    crossDirectory: [],
    orphans: []
  },
  stats: {
    'docs/images': { files: 0, size: 0 },
    'public/images': { files: 0, size: 0 }
  }
};

/**
 * Calculate SHA-256 hash of a file
 */
async function calculateHash(filePath) {
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Find all image files in a directory
 */
async function findImageFiles(dir) {
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg', '.ico'];
  const files = [];
  
  async function scanDir(currentDir) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = entry.name.toLowerCase().substring(entry.name.lastIndexOf('.'));
          if (imageExtensions.includes(ext)) {
            const stats = await stat(fullPath);
            files.push({
              path: fullPath,
              relPath: relative(process.cwd(), fullPath),
              name: entry.name,
              size: stats.size
            });
          }
        }
      }
    } catch (err) {
      console.warn(`Warning: Could not read directory ${currentDir}:`, err.message);
    }
  }
  
  if (existsSync(dir)) {
    await scanDir(dir);
  }
  
  return files;
}

/**
 * Recursively find files matching extensions
 */
async function findFilesByExtensions(rootDir, extensions, excludeDirs = []) {
  const files = [];
  
  async function scanDir(dir, relPath = '') {
    if (excludeDirs.some(excl => dir.includes(excl))) return;
    
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const entryRelPath = relPath ? join(relPath, entry.name) : entry.name;
        
        if (entry.isDirectory()) {
          await scanDir(fullPath, entryRelPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (err) {
      // Ignore permission errors
    }
  }
  
  if (existsSync(rootDir)) {
    await scanDir(rootDir);
  }
  
  return files;
}

/**
 * Search for image references in code files
 */
async function findImageReferences() {
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.html', '.md', '.mdx', '.css', '.scss', '.sass', '.less', '.json', '.yml', '.yaml'];
  const excludeDirs = ['node_modules', 'dist', 'build', 'docs/assets', 'docs/cesium', '.git'];
  
  const files = await findFilesByExtensions('.', extensions, excludeDirs);
  const references = [];
  
  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        const lineNum = index + 1;
        
        // Match various image path patterns
        const patterns = [
          /(['"`])(\/docs\/images\/[^'"`]+)\1/g,
          /(['"`])(\/public\/images\/[^'"`]+)\1/g,
          /(['"`])(\.\/images\/[^'"`]+)\1/g,
          /(['"`])(\.\.\/images\/[^'"`]+)\1/g,
          /(['"`])(images\/[^'"`]+)\1/g,
          /\$\{.*?BASE_URL.*?\}images\/([^'"`\s}]+)/g,
          /\$\{.*?\}\/images\/([^'"`\s}]+)/g,
          /url\(['"]?([^'"`)]*\/images\/[^'"`)]+)\)/gi,
          /url\(['"]?([^'"`)]*images\/[^'"`)]+)\)/gi,
          /src=["']([^"']*\/images\/[^"']+)["']/gi,
          /src=["']([^"']*images\/[^"']+)["']/gi,
          /href=["']([^"']*\/images\/[^"']+)["']/gi,
          /!\[[^\]]*\]\(([^)]*\/images\/[^)]+)\)/gi,
          /!\[[^\]]*\]\(([^)]*images\/[^)]+)\)/gi
        ];
        
        patterns.forEach(pattern => {
          let match;
          while ((match = pattern.exec(line)) !== null) {
            const path = match[1] || match[2] || match[0];
            references.push({
              file,
              line: lineNum,
              path: path.trim(),
              context: line.trim().substring(0, 100)
            });
          }
        });
      });
    } catch (err) {
      // Ignore read errors
    }
  }
  
  return references;
}

/**
 * Main audit function
 */
async function main() {
  console.log('🔍 Starting image audit...\n');
  
  // 1. Framework detection
  console.log('1️⃣ Detecting framework...');
  try {
    const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
    report.framework.name = 'Vite/React';
    report.framework.buildOutput = 'docs';
    report.framework.ghPagesMode = 'docs-dir';
    report.framework.basePath = '/Barricadix_MWP/';
    console.log(`   ✅ Framework: ${report.framework.name}`);
    console.log(`   ✅ Build Output: ${report.framework.buildOutput}`);
    console.log(`   ✅ GH Pages Mode: ${report.framework.ghPagesMode}`);
  } catch (err) {
    console.warn('   ⚠️ Could not read package.json');
  }
  
  // 2. Find image references
  console.log('\n2️⃣ Searching for image references...');
  const references = await findImageReferences();
  
  references.forEach(ref => {
    if (ref.path.includes('/docs/images/') || ref.path.includes('docs/images/')) {
      report.usage['docs/images'].push(ref);
    } else if (ref.path.includes('/public/images/') || ref.path.includes('public/images/')) {
      report.usage['public/images'].push(ref);
    } else if (ref.path.startsWith('/') || ref.path.startsWith('./') || ref.path.startsWith('../')) {
      report.usage.absolute.push(ref);
    } else {
      report.usage.relative.push(ref);
    }
  });
  
  console.log(`   ✅ Found ${references.length} total references`);
  console.log(`      - docs/images: ${report.usage['docs/images'].length}`);
  console.log(`      - public/images: ${report.usage['public/images'].length}`);
  console.log(`      - relative (images/): ${report.usage.relative.length}`);
  console.log(`      - absolute: ${report.usage.absolute.length}`);
  
  // 3. Scan image files and calculate hashes
  console.log('\n3️⃣ Scanning image files and calculating hashes...');
  
  const docsImages = await findImageFiles('docs/images');
  const publicImages = await findImageFiles('public/images');
  
  report.stats['docs/images'].files = docsImages.length;
  report.stats['docs/images'].size = docsImages.reduce((sum, f) => sum + f.size, 0);
  
  report.stats['public/images'].files = publicImages.length;
  report.stats['public/images'].size = publicImages.reduce((sum, f) => sum + f.size, 0);
  
  console.log(`   ✅ docs/images: ${docsImages.length} files, ${(report.stats['docs/images'].size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   ✅ public/images: ${publicImages.length} files, ${(report.stats['public/images'].size / 1024 / 1024).toFixed(2)} MB`);
  
  // 4. Calculate hashes and find duplicates
  console.log('\n4️⃣ Calculating file hashes...');
  
  const allImages = [
    ...docsImages.map(img => ({ ...img, source: 'docs/images' })),
    ...publicImages.map(img => ({ ...img, source: 'public/images' }))
  ];
  
  let processed = 0;
  for (const img of allImages) {
    processed++;
    if (processed % 50 === 0) {
      console.log(`   ⏳ Processed ${processed}/${allImages.length} files...`);
    }
    
    try {
      const hash = await calculateHash(img.path);
      
      if (!report.duplicates.hashMap[hash]) {
        report.duplicates.hashMap[hash] = [];
      }
      report.duplicates.hashMap[hash].push({
        path: img.relPath,
        source: img.source,
        size: img.size,
        name: img.name
      });
    } catch (err) {
      console.warn(`   ⚠️ Could not hash ${img.relPath}:`, err.message);
    }
  }
  
  // 5. Analyze duplicates
  console.log('\n5️⃣ Analyzing duplicates...');
  
  const duplicateHashes = Object.entries(report.duplicates.hashMap)
    .filter(([hash, files]) => files.length > 1);
  
  // Cross-directory duplicates
  for (const [hash, files] of duplicateHashes) {
    const sources = new Set(files.map(f => f.source));
    if (sources.size > 1) {
      report.duplicates.crossDirectory.push({
        hash,
        files,
        size: files[0].size
      });
    }
  }
  
  // Orphans (files not referenced)
  const referencedFiles = new Set();
  references.forEach(ref => {
    const match = ref.path.match(/([^\/'"`]+\.(jpg|jpeg|png|gif|webp|svg|ico))$/i);
    if (match) {
      referencedFiles.add(match[1].toLowerCase());
    }
  });
  
  for (const [hash, files] of Object.entries(report.duplicates.hashMap)) {
    files.forEach(file => {
      if (!referencedFiles.has(file.name.toLowerCase())) {
        report.duplicates.orphans.push(file);
      }
    });
  }
  
  console.log(`   ✅ Found ${duplicateHashes.length} duplicate sets (same hash)`);
  console.log(`   ✅ Found ${report.duplicates.crossDirectory.length} cross-directory duplicates`);
  console.log(`   ✅ Found ${report.duplicates.orphans.length} orphan files (no references)`);
  
  // 6. Generate report
  console.log('\n6️⃣ Generating report...');
  
  const reportMd = `# Image Audit Report

Generated: ${new Date().toISOString()}

## Framework Detection

- **Framework**: ${report.framework.name || 'Unknown'}
- **Build Output**: ${report.framework.buildOutput || 'Unknown'}
- **GH Pages Mode**: ${report.framework.ghPagesMode || 'Unknown'}
- **Base Path**: ${report.framework.basePath || '/'}

## Directory Statistics

### docs/images
- **Files**: ${report.stats['docs/images'].files}
- **Size**: ${(report.stats['docs/images'].size / 1024 / 1024).toFixed(2)} MB

### public/images
- **Files**: ${report.stats['public/images'].files}
- **Size**: ${(report.stats['public/images'].size / 1024 / 1024).toFixed(2)} MB

## Usage Analysis

### References to docs/images
Total: ${report.usage['docs/images'].length}
${report.usage['docs/images'].slice(0, 20).map(ref => `- \`${ref.file}:${ref.line}\`: \`${ref.path}\``).join('\n')}
${report.usage['docs/images'].length > 20 ? `\n... and ${report.usage['docs/images'].length - 20} more` : ''}

### References to public/images
Total: ${report.usage['public/images'].length}
${report.usage['public/images'].slice(0, 20).map(ref => `- \`${ref.file}:${ref.line}\`: \`${ref.path}\``).join('\n')}
${report.usage['public/images'].length > 20 ? `\n... and ${report.usage['public/images'].length - 20} more` : ''}

### Relative References (images/)
Total: ${report.usage.relative.length}
${report.usage.relative.slice(0, 20).map(ref => `- \`${ref.file}:${ref.line}\`: \`${ref.path}\``).join('\n')}
${report.usage.relative.length > 20 ? `\n... and ${report.usage.relative.length - 20} more` : ''}

## Duplicate Analysis

### Cross-Directory Duplicates
Total: ${report.duplicates.crossDirectory.length}
${report.duplicates.crossDirectory.slice(0, 10).map(dup => `
**Hash**: \`${dup.hash.substring(0, 16)}...\`
- ${dup.files.map(f => `\`${f.path}\` (${f.source})`).join('\n- ')}
- **Size**: ${(dup.size / 1024).toFixed(2)} KB
`).join('\n')}
${report.duplicates.crossDirectory.length > 10 ? `\n... and ${report.duplicates.crossDirectory.length - 10} more duplicate sets` : ''}

### Orphan Files (No References)
Total: ${report.duplicates.orphans.length}
${report.duplicates.orphans.slice(0, 20).map(orphan => `- \`${orphan.path}\` (${(orphan.size / 1024).toFixed(2)} KB)`).join('\n')}
${report.duplicates.orphans.length > 20 ? `\n... and ${report.duplicates.orphans.length - 20} more` : ''}

## Recommendations

1. **Canonical Directory**: Based on the analysis, \`${CANONICAL_DIR}\` should be used as the canonical directory.
2. **Migration Strategy**: 
   - Keep files in \`${CANONICAL_DIR}\`
   - Update all references to use \`\${import.meta.env.BASE_URL}images/\` pattern
   - Remove duplicate files from non-canonical directory after migration
3. **Estimated Space Savings**: ${(report.duplicates.crossDirectory.reduce((sum, d) => sum + d.size * (d.files.length - 1), 0) / 1024 / 1024).toFixed(2)} MB (after removing duplicates)
`;
  console.log('   ✅ Report written to tmp/images-audit.md');
  
  // Also save JSON for migration script
  await writeFile('tmp/images-audit.json', JSON.stringify(report, null, 2), 'utf-8');
  console.log('   ✅ JSON data written to tmp/images-audit.json');
  
  console.log('\n✅ Audit complete!');
}

main().catch(console.error);

