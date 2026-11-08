const { spawnSync } = require('child_process');

console.log('====================================================');
console.log('  AERO FLOW AIRLINES — SUITE COMPLETA DE PRUEBAS');
console.log('====================================================\n');

// 1. Ejecutar pruebas unitarias y de regresión Python (pytest)
console.log('>>> [1/2] Ejecutando pruebas unitarias y de regresión Python (pytest)...');
const pyResult = spawnSync('pytest', ['-v'], { stdio: 'inherit', shell: true });
if (pyResult.status !== 0) {
  console.error('\n❌ Error en las pruebas de Python (pytest).');
  process.exit(pyResult.status || 1);
}
console.log('✔ Pruebas Python pasaron exitosamente (100%).\n');

// 2. Ejecutar pruebas de resiliencia Frontend (Node.js)
console.log('>>> [2/2] Ejecutando pruebas de resiliencia Frontend (Node.js)...');
const nodeResult = spawnSync('node', ['tests/test_frontend_resilience.js'], { stdio: 'inherit', shell: true });
if (nodeResult.status !== 0) {
  console.error('\n❌ Error en las pruebas de Node.js.');
  process.exit(nodeResult.status || 1);
}
console.log('✔ Pruebas Node.js pasaron exitosamente (100%).\n');

console.log('====================================================');
console.log('  TODAS LAS PRUEBAS AUTOMATIZADAS PASARON (100%)');
console.log('====================================================');
process.exit(0);
