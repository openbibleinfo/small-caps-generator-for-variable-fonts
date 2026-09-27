// Offline regression suite. Browser installation is a separate, explicit step.
const {spawnSync}=require('node:child_process');
const tests=['browser.cjs','control-contract.cjs','preview-controls.cjs','scroll-position.cjs',
  'typeset-exports.cjs','accessibility.cjs','share.cjs','simple-exports.cjs','transform-export.cjs','tracking.cjs',
  'overlay.cjs','ui-state.cjs','app-layout.cjs','sources.cjs','google-naive.cjs','features.cjs'];
const failed=[];
for(const test of tests){
  console.log(`\nRunning ${test}`);
  const result=spawnSync(process.execPath,['tests/'+test],{stdio:'inherit',timeout:180000});
  if(result.status!==0){failed.push(test);if(result.error)console.error(result.error.message);}
}
if(failed.length){console.error('\nFailed:',failed.join(', '));process.exitCode=1;}
else console.log(`\nAll ${tests.length} offline browser suites passed.`);
