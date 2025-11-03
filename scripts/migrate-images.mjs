#!/usr/bin/env node
/**
 * Image Migration Script
 * Migrates images to canonical directory and updates all references
 */

import { readFile, writeFile, copyFile, mkdir, unlink } from 'fs/promises';
import { join, dirname, relative } from 'path';
import { existsSync } from 'fs';

const CANONICAL_DIR = process.env.CANONICAL_DIR || 'public/images';
const DRY_RUN = process.env.DRY_RUN !== 'false';
const NON_CANONICAL_DIR = CANONICAL_DIR === 'public/images' ? 'docs/images' : 'public/images';

console.log(`📦 Starting migration...`);
console.log(`   Canonical: ${CANONICAL_DIR}`);
console.log(`   Non-canonical: ${NON_CANONICAL_DIR}`);
console.log(`   Dry Run: ${DRY_RUN}`);

// Load audit data
let auditData;
try {
  const auditJson = await readFile('tmp/images-audit.json', 'utf-8');
  auditData = JSON.parse(auditJson);
} catch (err) {
  console.error('❌ Could not load audit data. Run audit-images.mjs first.');
  process.exit(1);
}

const changes = {
  filesToCopy: [],
  filesToDelete: [],
  referencesToUpdate: [],
  errors: []
};

/**
 * Recursively find files matching extensions
 */
async function findFilesByExtensions(rootDir, extensions, excludeDirs = []) {
  const files = [];
  const { readdir } = await import('fs/promises');
  const { extname, join } = await import('path');
  
  async function scanDir(dir) {
    if (excludeDirs.some(excl => dir.includes(excl))) return;
    
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (err) {
      // Ignore
    }
  }
  
  if (existsSync(rootDir)) {
    await scanDir(rootDir);
  }
  
  return files;
}

/**
 * Update file references
 */
async function updateFileReferences(file, replacements) {
  try {
    let content = await readFile(file, 'utf-8');
    let modified = false;
    let fileChanges = [];
    
    replacements.forEach(replace => {
      const before = content;
      
      // Various replacement patterns
      const patterns = [
        // Direct paths
        new RegExp(replace.oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        // In template strings
        new RegExp(replace.oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '\\/'), 'g'),
        // Relative paths
        new RegExp(replace.oldPath.replace(/^\.\//, '\\./').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      ];
      
      patterns.forEach(pattern => {
        if (pattern.test(content)) {
          content = content.replace(pattern, replace.newPath);
          modified = true;
          fileChanges.push({
            old: replace.oldPath,
            new: replace.newPath
          });
        }
      });
      
      // Special handling for BASE_URL pattern (already correct)
      if (content.includes(`\${import.meta.env.BASE_URL}images/`)) {
        // Already using correct pattern, but check if path needs updating
        const baseUrlPattern = /\$\{import\.meta\.env\.BASE_URL\}images\/([^'"`\s}]+)/g;
        let match;
        while ((match = baseUrlPattern.exec(content)) !== null) {
          const imageName = match[1];
          // Ensure we're not referencing docs/images
          if (content.includes('docs/images/' + imageName)) {
            content = content.replace(`docs/images/${imageName}`, `images/${imageName}`);
            modified = true;
            fileChanges.push({
              old: `docs/images/${imageName}`,
              new: `images/${imageName}`
            });
          }
        }
      }
    });
    
    if (modified && !DRY_RUN) {
      await writeFile(file, content, 'utf-8');
    }
    
    return { modified, changes: fileChanges };
  } catch (err) {
    return { modified: false, error: err.message };
  }
}

/**
 * Main migration function
 */
async function main() {
  console.log('\n1️⃣ Analyzing duplicates for migration...');
  
  // Find unique files in non-canonical directory
  const duplicateHashes = auditData.duplicates.hashMap;
  const canonicalFiles = new Set();
  const nonCanonicalFiles = new Set();
  
  // Build sets of files in each directory
  Object.entries(duplicateHashes).forEach(([hash, files]) => {
    files.forEach(file => {
      if (file.source === CANONICAL_DIR) {
        canonicalFiles.add(file.name);
      } else if (file.source === NON_CANONICAL_DIR) {
        nonCanonicalFiles.add(file.name);
      }
    });
  });
  
  // Find files in non-canonical that don't exist in canonical
  const filesToCopy = [];
  for (const file of auditData.duplicates.crossDirectory) {
    const canonicalFile = file.files.find(f => f.source === CANONICAL_DIR);
    const nonCanonicalFile = file.files.find(f => f.source === NON_CANONICAL_DIR);
    
    if (canonicalFile && nonCanonicalFile) {
      // Same hash, no need to copy
      changes.filesToDelete.push(nonCanonicalFile.path);
    } else if (!canonicalFile && nonCanonicalFile) {
      // Missing in canonical, needs copy
      filesToCopy.push({
        from: nonCanonicalFile.path,
        to: join(CANONICAL_DIR, nonCanonicalFile.name),
        hash: file.hash
      });
    }
  }
  
  // Also check for files not in duplicate list (unique files in non-canonical)
  // This would require scanning the directory, but for now we focus on duplicates
  
  console.log(`   ✅ Files to copy: ${filesToCopy.length}`);
  console.log(`   ✅ Files to delete: ${changes.filesToDelete.length}`);
  
  // 2. Prepare reference updates
  console.log('\n2️⃣ Preparing reference updates...');
  
  const referenceUpdates = [];
  const allReferences = [
    ...auditData.usage['docs/images'],
    ...auditData.usage['public/images'],
    ...auditData.usage.relative,
    ...auditData.usage.absolute
  ];
  
  // Group by file
  const filesToUpdate = new Map();
  
  allReferences.forEach(ref => {
    if (!filesToUpdate.has(ref.file)) {
      filesToUpdate.set(ref.file, []);
    }
    
    let newPath = ref.path;
    
    // Convert various path formats to canonical format
    if (ref.path.includes('/docs/images/') || ref.path.includes('docs/images/')) {
      const imageName = ref.path.match(/([^\/]+\.(jpg|jpeg|png|gif|webp|svg|ico))$/i)?.[1];
      if (imageName) {
        // Determine if this is a TS/JS file (use BASE_URL) or HTML/CSS (relative)
        const isCodeFile = /\.(ts|tsx|js|jsx)$/.test(ref.file);
        newPath = isCodeFile 
          ? `\${import.meta.env.BASE_URL}images/${imageName}`
          : `images/${imageName}`;
      }
    } else if (ref.path.includes('/public/images/') || ref.path.includes('public/images/')) {
      // Already pointing to public, but should be relative
      const imageName = ref.path.match(/([^\/]+\.(jpg|jpeg|png|gif|webp|svg|ico))$/i)?.[1];
      if (imageName) {
        const isCodeFile = /\.(ts|tsx|js|jsx)$/.test(ref.file);
        newPath = isCodeFile 
          ? `\${import.meta.env.BASE_URL}images/${imageName}`
          : `images/${imageName}`;
      }
    } else if (ref.path.includes('images/') && !ref.path.includes('BASE_URL')) {
      // Relative path, ensure it's correct format
      const isCodeFile = /\.(ts|tsx|js|jsx)$/.test(ref.file);
      if (isCodeFile && !ref.path.includes('BASE_URL')) {
        const imageName = ref.path.match(/([^\/'"`]+\.(jpg|jpeg|png|gif|webp|svg|ico))$/i)?.[1];
        if (imageName) {
          newPath = `\${import.meta.env.BASE_URL}images/${imageName}`;
        }
      }
    }
    
    if (newPath !== ref.path) {
      filesToUpdate.get(ref.file).push({
        old: ref.path,
        new: newPath,
        line: ref.line
      });
    }
  });
  
  console.log(`   ✅ Files to update: ${filesToUpdate.size}`);
  
  // 3. Perform migration
  if (!DRY_RUN) {
    console.log('\n3️⃣ Executing migration...');
    
    // Copy missing files
    for (const file of filesToCopy) {
      try {
        const targetDir = dirname(file.to);
        if (!existsSync(targetDir)) {
          await mkdir(targetDir, { recursive: true });
        }
        await copyFile(file.from, file.to);
        console.log(`   ✅ Copied: ${relative(process.cwd(), file.from)} -> ${relative(process.cwd(), file.to)}`);
      } catch (err) {
        changes.errors.push(`Failed to copy ${file.from}: ${err.message}`);
      }
    }
    
    // Update references
    for (const [file, replacements] of filesToUpdate.entries()) {
      const result = await updateFileReferences(file, replacements);
      if (result.modified) {
        console.log(`   ✅ Updated: ${file} (${result.changes.length} changes)`);
        changes.referencesToUpdate.push({
          file,
          changes: result.changes
        });
      }
    }
    
    // Delete duplicates (only after copy and update)
    for (const filePath of changes.filesToDelete) {
      try {
        if (existsSync(filePath)) {
          await unlink(filePath);
          console.log(`   ✅ Deleted: ${relative(process.cwd(), filePath)}`);
        }
      } catch (err) {
        changes.errors.push(`Failed to delete ${filePath}: ${err.message}`);
      }
    }
  } else {
    console.log('\n3️⃣ Dry-run mode - no changes will be made');
    changes.filesToCopy = filesToCopy;
    changes.referencesToUpdate = Array.from(filesToUpdate.entries()).map(([file, reps]) => ({
      file,
      changes: reps
    }));
  }
  
  // 4. Generate report
  console.log('\n4️⃣ Generating migration report...');
  
  const reportMd = `# Image Migration Report

Generated: ${new Date().toISOString()}
Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLIED'}

## Migration Summary

- **Canonical Directory**: \`${CANONICAL_DIR}\`
- **Non-Canonical Directory**: \`${NON_CANONICAL_DIR}\`
- **Files to Copy**: ${changes.filesToCopy.length}
- **Files to Delete**: ${changes.filesToDelete.length}
- **Files with Updated References**: ${changes.referencesToUpdate.length}

## Files to Copy

${changes.filesToCopy.length > 0 ? changes.filesToCopy.slice(0, 20).map(f => `- \`${f.from}\` -> \`${f.to}\``).join('\n') : 'None'}
${changes.filesToCopy.length > 20 ? `\n... and ${changes.filesToCopy.length - 20} more` : ''}

## Files to Delete (Duplicates)

${changes.filesToDelete.length > 0 ? changes.filesToDelete.slice(0, 20).map(f => `- \`${f}\``).join('\n') : 'None'}
${changes.filesToDelete.length > 20 ? `\n... and ${changes.filesToDelete.length - 20} more` : ''}

## Reference Updates

${changes.referencesToUpdate.map(update => `
### \`${update.file}\`

${update.changes.map(ch => `- Line ${ch.line || '?'}: \`${ch.old}\` -> \`${ch.new}\``).join('\n')}
`).join('\n')}

## Errors

${changes.errors.length > 0 ? changes.errors.map(e => `- ${e}`).join('\n') : 'None'}

## Next Steps

${DRY_RUN ? `
1. Review this report carefully
2. Set \`DRY_RUN=false\` to apply changes
3. Run the script again: \`DRY_RUN=false node scripts/migrate-images.mjs\`
` : `
1. ✅ Migration completed
2. Review the changes
3. Test the build: \`npm run build\`
4. Verify images load correctly
`}
`;

  await writeFile('tmp/migrate-dry-run.md', reportMd, 'utf-8');
  console.log('   ✅ Report written to tmp/migrate-dry-run.md');
  
  // Write files to delete list
  if (changes.filesToDelete.length > 0) {
    const deleteList = changes.filesToDelete.join('\n');
    await writeFile('tmp/images-to-delete.txt', deleteList, 'utf-8');
    console.log('   ✅ Deletion list written to tmp/images-to-delete.txt');
  }
  
  console.log(`\n✅ Migration ${DRY_RUN ? 'dry-run' : ''} complete!`);
}

main().catch(console.error);

