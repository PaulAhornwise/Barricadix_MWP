/**
 * Test script to verify 3D mode integration
 * Run this in the browser console after loading the application
 */

console.log('🧪 Testing 3D Mode Integration...');

// Test 1: Check if Cesium is loaded
console.log('Test 1: Checking Cesium availability...');
if (typeof Cesium !== 'undefined') {
    console.log('✅ Cesium is loaded:', Cesium);
} else {
    console.error('❌ Cesium is not loaded');
}

// Test 2: Check if 3D toggle button exists
console.log('Test 2: Checking 3D toggle button...');
const toggleButton = document.querySelector('.three-d-toggle-container button');
if (toggleButton) {
    console.log('✅ 3D toggle button found:', toggleButton);
    console.log('Button text:', toggleButton.textContent);
} else {
    console.error('❌ 3D toggle button not found');
}

// Test 3: Check if Cesium container exists
console.log('Test 3: Checking Cesium container...');
const cesiumContainer = document.getElementById('cesium-root');
if (cesiumContainer) {
    console.log('✅ Cesium container found:', cesiumContainer);
    console.log('Container style display:', cesiumContainer.style.display);
} else {
    console.error('❌ Cesium container not found');
}

// Test 4: Check environment variables
console.log('Test 4: Checking environment variables...');
console.log('VITE_DZNRW_3DTILES_URL:', import.meta.env.VITE_DZNRW_3DTILES_URL);
console.log('VITE_DZNRW_SCENE_URL:', import.meta.env.VITE_DZNRW_SCENE_URL);
console.log('VITE_CESIUM_ION_TOKEN:', import.meta.env.VITE_CESIUM_ION_TOKEN);

// Test 5: Check if map is initialized
console.log('Test 5: Checking map initialization...');
if (typeof map !== 'undefined' && map) {
    console.log('✅ Map is initialized:', map);
    console.log('Map center:', map.getCenter());
    console.log('Map zoom:', map.getZoom());
} else {
    console.error('❌ Map is not initialized');
}

// Test 6: Check if 3D state is available
console.log('Test 6: Checking 3D state...');
if (typeof threeDState !== 'undefined') {
    console.log('✅ 3D state is available:', threeDState);
} else {
    console.error('❌ 3D state is not available');
}

console.log('🧪 3D Integration Test Complete!');

