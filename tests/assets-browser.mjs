import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {loadGame as loaded} from './browser-helpers.mjs';
await mkdir('.runtime',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-angle=swiftshader']});
const origin=process.env.GAME_URL??'http://127.0.0.1:5190/';
function changeJSON(bytes,change){const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString('utf8').trim());change(json);const text=Buffer.from(JSON.stringify(json)),padded=Math.ceil(text.length/4)*4,tail=bytes.subarray(20+length),out=Buffer.alloc(20+padded+tail.length,0x20);bytes.copy(out,0,0,20);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded,12);text.copy(out,20);tail.copy(out,20+padded);return out;}
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()));await page.goto(origin);await loaded(page);
  const skin=await page.evaluate(()=>{
    const a=g.assets.instantiate('hiker'),b=g.assets.instantiate('hiker');
    const first=a.getObjectByProperty('isSkinnedMesh',true),second=b.getObjectByProperty('isSkinnedMesh',true);
    const live=g.world.scene.getObjectByProperty('isSkinnedMesh',true);
    live.skeleton.update();
    return {independent:first.skeleton.bones[0]!==second.skeleton.bones[0],bones:live.skeleton.bones.length,finite:Array.from(live.skeleton.boneMatrices).every(Number.isFinite)};
  });
  assert.equal(skin.independent,true);assert.ok(skin.bones>=65);assert.equal(skin.finite,true);
  const count=requests.filter(u=>u.endsWith('.glb')).length,expected=await page.evaluate(async()=>(await import('/src/art/layout.ts')).ART_DEFINITIONS.length);
  assert.equal(count,expected);assert.equal(requests.some(u=>u.includes('/src/art/builders')),false);
  const sharing=await page.evaluate(()=>{const a=g.assets.instantiate('tree'),b=g.assets.instantiate('tree'),meshes=[];a.traverse(n=>{if(n.isMesh)meshes.push(n);});const other=[];b.traverse(n=>{if(n.isMesh)other.push(n);});return {geometry:meshes[0].geometry===other[0].geometry,material:meshes[0].material===other[0].material,node:a!==b};});assert.deepEqual(sharing,{geometry:true,material:true,node:true});
  const collision=await page.evaluate(async()=>{
    const {FollowCamera}=await import('/src/camera.ts'),wall=g.world.surfaces.find(n=>n.userData.assetSource?.includes('terrain-rest'));
    g.world.scene.updateMatrixWorld(true);wall.geometry.computeBoundingBox();const box=wall.geometry.boundingBox.clone().applyMatrix4(wall.matrixWorld),center=box.getCenter(wall.position.clone()),camera=new FollowCamera();camera.yaw=Math.PI/2;camera.pitch=0;camera.distance=5;
    camera.update({x:box.min.x-1,y:center.y-.25,z:center.z},1/60,g.world.surfaces);
    return {allGLB:g.world.surfaces.every(n=>n.isMesh&&n.userData.assetSource?.endsWith('.glb')),distance:camera.camera.position.distanceTo(camera.target),beforeWall:camera.camera.position.x<box.min.x};
  });assert.equal(collision.allGLB,true);assert.equal(collision.beforeWall,true);assert.ok(collision.distance<1);
  await page.screenshot({path:'.runtime/glb-home.png'});await page.click('#start');await page.waitForFunction(()=>g.run.phase==='playing');await page.keyboard.press('Escape');await page.locator('#back').click();await page.click('#start');await page.waitForFunction(()=>g.run.phase==='playing');
  assert.equal(requests.filter(u=>u.endsWith('.glb')).length,count);assert.equal(await page.locator('#scene canvas').count(),1);
  const childX=await page.evaluate(()=>{const mesh=g.world.scene.getObjectByProperty('isSkinnedMesh',true);mesh.position.x+=.125;return mesh.position.x;});await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>g.world.scene.getObjectByProperty('isSkinnedMesh',true).position.x),childX);assert.deepEqual(errors,[]);await page.close();
  const missing=await browser.newPage();await missing.route('**/models/Dariov2.glb',r=>r.fulfill({status:404,body:'missing'}));await missing.goto(origin);await missing.locator('#asset-error').waitFor();assert.match(await missing.locator('#asset-error').textContent(),/Dariov2\.glb/);assert.equal(await missing.locator('#scene canvas').count(),0);
  await missing.unroute('**/models/Dariov2.glb');await missing.click('#retry-assets');await loaded(missing);await missing.close();
  const bytes=await readFile(new URL('../public/models/Dariov2.glb',import.meta.url)),broken=changeJSON(bytes,j=>{j.nodes.find(n=>n.name==='mixamorig:Spine').name='Missing_Spine';});
  const invalid=await browser.newPage();await invalid.route('**/models/Dariov2.glb',r=>r.fulfill({status:200,contentType:'model/gltf-binary',body:broken}));await invalid.goto(origin);await invalid.locator('#asset-error').waitFor();assert.match(await invalid.locator('#asset-error').textContent(),/Dariov2\.glb.*Spine/);await invalid.close();
  const edited=changeJSON(bytes,j=>{const mesh=j.nodes.find(n=>n.skin!==undefined&&n.mesh!==undefined).mesh,index=j.meshes[mesh].primitives[0].material;j.materials[index].pbrMetallicRoughness.baseColorFactor=[.1,.2,.9,1];});const replacement=await browser.newPage();await replacement.route('**/models/Dariov2.glb',r=>r.fulfill({status:200,contentType:'model/gltf-binary',body:edited}));await replacement.goto(origin);await loaded(replacement);
  assert.ok(await replacement.evaluate(()=>{const mesh=g.world.scene.getObjectByProperty('isSkinnedMesh',true);return mesh.material.color.b>mesh.material.color.r*3;}));await replacement.close();
  console.log(`GLB browser passed: ${count} model requests, shared geometry/materials, no procedural builders or repeated downloads, camera collision with GLB meshes, preserved child transforms, missing file retry, missing node error and edited material preservation.`);
}finally{await browser.close();}
