
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
