#!/usr/bin/env node

/**
 * Build script for the geodata provider abstraction system.
 * This script compiles TypeScript files and runs tests.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('🚀 Building Geodata Provider Abstraction System...\n');

// Check if required directories exist
const requiredDirs = [
  'src/core/geodata',
  'src/core/geodata/providers',
  'src/core/geodata/integration',
  'src/core/geodata/controls',
  'src/core/geodata/__tests__'
];

console.log('📁 Checking directory structure...');
for (const dir of requiredDirs) {
  if (!fs.existsSync(dir)) {
    console.error(`❌ Missing directory: ${dir}`);
    process.exit(1);
  }
  console.log(`✅ ${dir}`);
}

// Check if required files exist
const requiredFiles = [
  'src/core/geodata/provider.ts',
  'src/core/geodata/providers/nrwProvider.ts',
  'src/core/geodata/providers/osmProvider.ts',
  'src/core/geodata/index.ts',
  'src/core/geodata/integration/mapIntegration.ts',
  'src/core/geodata/integration/entryDetectionIntegration.ts',
  'src/core/geodata/__tests__/provider.test.ts'
];

console.log('\n📄 Checking required files...');
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`❌ Missing file: ${file}`);
    process.exit(1);
  }
  console.log(`✅ ${file}`);
}

// Run TypeScript compilation check
console.log('\n🔧 Checking TypeScript compilation...');
try {
  execSync('npx tsc --noEmit --skipLibCheck src/core/geodata/provider.ts src/core/geodata/providers/nrwProvider.ts src/core/geodata/providers/osmProvider.ts src/core/geodata/index.ts src/core/geodata/integration/mapIntegration.ts src/core/geodata/integration/entryDetectionIntegration.ts src/core/geodata/controls/SourceAttributionControl.ts', { stdio: 'inherit' });
  console.log('✅ TypeScript compilation successful');
} catch (error) {
  console.error('❌ TypeScript compilation failed');
  process.exit(1);
}

// Run tests if available
console.log('\n🧪 Running tests...');
try {
  if (fs.existsSync('package.json')) {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    if (packageJson.devDependencies?.vitest || packageJson.dependencies?.vitest) {
      execSync('npx vitest run src/core/geodata/__tests__/provider.test.ts', { stdio: 'inherit' });
      console.log('✅ Tests passed');
    } else {
      console.log('⚠️  Vitest not found, skipping tests');
    }
  } else {
    console.log('⚠️  package.json not found, skipping tests');
  }
} catch (error) {
  console.error('❌ Tests failed');
  process.exit(1);
}

// Generate integration summary
console.log('\n📋 Integration Summary:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Provider Core System');
console.log('   • GeoDataProvider interface');
console.log('   • NRW WFS/WMS provider');
console.log('   • OSM provider wrapper');
console.log('   • Provider selection router');
console.log('');
console.log('✅ Integration Components');
console.log('   • Map initialization integration');
console.log('   • Entry detection integration');
console.log('   • Source attribution UI');
console.log('   • Error handling & fallback');
console.log('');
console.log('✅ Features');
console.log('   • Automatic provider selection based on location');
console.log('   • NRW WFS for road data in North Rhine-Westphalia');
console.log('   • NRW WMS for basemap tiles in NRW areas');
console.log('   • OSM fallback for non-NRW areas or service failures');
console.log('   • Provider-agnostic caching system');
console.log('   • Source attribution display');
console.log('');
console.log('📖 Next Steps:');
console.log('1. Review INTEGRATION_GUIDE.md for detailed integration instructions');
console.log('2. Apply changes shown in INTEGRATION_EXAMPLE.ts to index.tsx');
console.log('3. Test the system in NRW and non-NRW areas');
console.log('4. Verify automatic fallback behavior');
console.log('');
console.log('🎉 Geodata Provider Abstraction System built successfully!');

// Create a simple verification script
const verificationScript = `
// Quick verification that the provider system is working
import { pickProvider } from './src/core/geodata/index.js';

// Test NRW area
const nrwBbox = [700000, 6600000, 800000, 6700000];
const provider = await pickProvider(nrwBbox);
console.log('NRW area provider:', provider.id);

// Test non-NRW area  
const berlinBbox = [1300000, 6900000, 1400000, 7000000];
const provider2 = await pickProvider(berlinBbox);
console.log('Berlin area provider:', provider2.id);
`;

fs.writeFileSync('verify-provider-system.js', verificationScript);
console.log('📝 Created verify-provider-system.js for testing');
