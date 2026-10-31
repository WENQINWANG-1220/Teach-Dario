import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {loadGame} from './browser-helpers.mjs';

const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server','--enable-webgl','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],requests=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('request',request=>requests.push(request.url()));
page.setDefaultTimeout(30000);
const lines=[
  {speaker:'Sam',text:'路太窄？\n那就把它Scaling Laws 。'},
  {speaker:'Dario',text:'我认识你。'},
  {speaker:'Sam',text:'准确来说，我只是你记忆里的测试用例。\n不过这确实像我会问的问题：既然有效，为什么不把它做大？'},
];
const snapshot=()=>page.evaluate(()=>({active:g.samDialogue.active,index:g.samDialogue.index,completed:g.samDialogue.completed,current:g.samDialogue.current}));
async function moveTo(s){
  await page.evaluate(async s=>{const {route,routeFacing}=await import('/src/model.ts');g.clearInput();g.walker.reset(route(s),routeFacing(s));g.view.initialized=false;},s);
}
async function approach(){await page.evaluate(()=>g.run.advance(12));await moveTo(16);}
async function expectLine(index){
  await page.waitForFunction(index=>g.samDialogue.active&&g.samDialogue.index===index,index);
  assert.deepEqual((await snapshot()).current,lines[index]);
  await page.locator('#daniela-dialogue').waitFor({state:'visible'});
  await page.waitForFunction(text=>document.getElementById('daniela-text')?.textContent===text,lines[index].text);
  assert.equal(await page.locator('#daniela-speaker').textContent(),lines[index].speaker);
  assert.equal(await page.locator('#daniela-progress').textContent(),`${index+1} / 3`);
}
try{
  await page.goto(process.env.GAME_URL??'http://127.0.0.1:5190/');await loadGame(page);
  assert.ok(requests.some(url=>new URL(url).pathname.endsWith('/models/SAM.glb')),'loads the supplied SAM.glb model');
  const art=await page.evaluate(async()=>{
    const {route,SEESAW}=await import('/src/model.ts'),{ROOT_HEIGHT}=await import('/src/rig.ts'),{SAM_POSITION}=await import('/src/sam.ts');
    const originals=[],projected=[];g.assets.instantiate('sam').traverse(n=>{if(n.isMesh)originals.push(...(Array.isArray(n.material)?n.material:[n.material]));});
    let samMeshes=0,bounds;g.sam.root.updateMatrixWorld(true);
    g.sam.root.traverse(n=>{
      if(!n.isMesh||n.userData.assetSource!=='SAM.glb')return;
      samMeshes++;
      projected.push(...(Array.isArray(n.material)?n.material:[n.material]));
      if(n.isSkinnedMesh){n.skeleton.update();n.computeBoundingBox();}else n.geometry.computeBoundingBox();
      const box=(n.isSkinnedMesh?n.boundingBox:n.geometry.boundingBox).clone().applyMatrix4(n.matrixWorld);
      if(bounds)bounds.union(box);else bounds=box;
    });
    const dimensions=bounds?bounds.max.clone().sub(bounds.min).toArray():[];
    const p=route((SEESAW.start+SEESAW.end)/2),hit=g.walker.ground(p.x,p.z,p.y+1,2);
    g.samDialogue.update(0,{position:{x:SAM_POSITION.x,y:SAM_POSITION.y+ROOT_HEIGHT,z:SAM_POSITION.z},playing:true,blocked:false,checkpoint:0});
    const gated=!g.samDialogue.active;g.samDialogue.reset();
    return{samMeshes,dimensions,sourceOpaque:originals.length>0&&originals.every(m=>m.opacity===1),isolated:projected.every(m=>!originals.includes(m)),translucent:projected.every(m=>m.transparent&&m.opacity>.2&&m.opacity<.9&&!m.depthWrite),texturesPreserved:projected.every(m=>originals.some(source=>source.map===m.map)),distinct:g.sam.root!==g.daniela.root,dynamic:g.world.seesaw.body.isDynamic(),bridgeUnderfoot:hit?.collider.parent()?.handle===g.world.seesaw.body.handle,gated};
  });
  assert.ok(art.samMeshes>0,'Sam uses meshes from the supplied SAM.glb');assert.equal(art.dimensions.length,3);assert.ok(art.dimensions.every(value=>Number.isFinite(value)&&value>0));
  const [width,height,depth]=art.dimensions;assert.ok(height>1.5&&height<2.1&&depth<height&&width<height*1.3,`Sam has upright human dimensions: ${art.dimensions}`);
  assert.equal(art.sourceOpaque,true,'Sam projection preserves opaque source materials');assert.equal(art.isolated,true,'projection materials are cloned');assert.equal(art.translucent,true,'Sam figure uses translucent materials without depth writes');assert.equal(art.texturesPreserved,true,'the supplied model textures are preserved');
  assert.equal(art.distinct,true);assert.equal(art.dynamic,true);assert.equal(art.bridgeUnderfoot,true,'the bridge has its own actual walkable collider with no fixed road over it');assert.equal(art.gated,true,'Sam requires the first checkpoint');
  assert.equal((await snapshot()).active,false);
  await page.click('#start');await page.waitForFunction(()=>g.run.phase==='playing');
  assert.equal((await snapshot()).active,false,'Sam does not trigger at the start');
  await approach();await expectLine(0);
  assert.equal(await page.evaluate(()=>{const materials=[];g.sam.root.traverse(n=>{if(n.isMesh&&n.userData.assetSource==='SAM.glb')materials.push(...(Array.isArray(n.material)?n.material:[n.material]));});return materials.every(m=>m.transparent&&m.opacity>.2&&m.opacity<.9&&!m.depthWrite);}),true,'the active conversation keeps Sam translucent');
  await page.keyboard.down('Enter');await expectLine(1);await page.keyboard.down('Enter');await page.waitForTimeout(70);assert.equal((await snapshot()).index,1,'held Enter advances only once');await page.keyboard.up('Enter');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>g.run.phase==='paused');await page.locator('#daniela-dialogue').waitFor({state:'hidden'});
  const paused=await snapshot();await page.evaluate(()=>g.samDialogue.update(30,{position:g.walker.rendered,playing:false,blocked:false,checkpoint:g.run.checkpoint}));assert.deepEqual(await snapshot(),paused,'pause freezes the conversation');
  await page.click('#resume');await page.waitForFunction(()=>g.run.phase==='playing');await expectLine(1);
  await moveTo(12);await page.waitForFunction(()=>!g.samDialogue.active);assert.equal((await snapshot()).completed,false);
  await approach();await expectLine(0);
  await mkdir('.runtime',{recursive:true});
  await page.evaluate(async()=>{const {routeFacing}=await import('/src/model.ts');g.view.yaw=routeFacing(16)-.75;g.view.pitch=.32;g.view.distance=6.5;g.view.initialized=false;});
  await page.waitForTimeout(150);await page.screenshot({path:'.runtime/sam-dialogue-1280.png'});
  for(let index=0;index<lines.length;index++){await expectLine(index);await page.keyboard.press(index===1?'Space':'Enter');}
  await page.waitForFunction(()=>g.samDialogue.completed&&!g.samDialogue.active);await page.locator('#daniela-dialogue').waitFor({state:'hidden'});
  await moveTo(12);await approach();await page.waitForTimeout(100);assert.equal((await snapshot()).active,false,'completed dialogue stays completed');
  const resetPose=await page.evaluate(()=>{g.world.seesaw.reset();return {...g.world.seesaw.body.rotation()};});
  await page.evaluate(async()=>{
    const {route,SEESAW}=await import('/src/model.ts'),a=route(SEESAW.start),b=route(SEESAW.end),d=Math.hypot(b.x-a.x,b.z-a.z);
    g.world.seesaw.body.applyTorqueImpulse({x:(b.z-a.z)/d*1000,y:0,z:-(b.x-a.x)/d*1000},true);
    for(let i=0;i<30;i++)g.physics.step(undefined,g.walker.rig.hooks);
    g.world.seesaw.update();
  });
  await page.keyboard.press('KeyR');await page.waitForFunction(()=>g.run.phase==='playing');
  const afterReset=await page.evaluate(()=>({rotation:{...g.world.seesaw.body.rotation()},seen:g.samDialogue.completed,checkpoint:g.run.checkpoint,saved:g.store.saved?.samSeen}));
  const dot=Object.keys(resetPose).reduce((sum,k)=>sum+resetPose[k]*afterReset.rotation[k],0);
  assert.ok(Math.abs(dot)>.999,'R restores the bridge orientation');assert.equal(afterReset.seen,true);assert.equal(afterReset.saved,true);assert.equal(afterReset.checkpoint,1);
  await page.reload();await loadGame(page);await page.click('#continue');await page.waitForFunction(()=>g.run.phase==='playing');
  assert.equal((await snapshot()).completed,true,'continue restores Sam completion');await approach();await page.waitForTimeout(100);assert.equal((await snapshot()).active,false);
  await page.keyboard.press('1');await page.waitForFunction(()=>g.developer.mode==='camera');
  await page.evaluate(async()=>{
    const {route}=await import('/src/model.ts'),a=route(16),b=route(24),x=(a.x+b.x)/2,z=(a.z+b.z)/2,y=(a.y+b.y)/2,r=Math.hypot(x,z+18);
    g.view.camera.clearViewOffset();g.view.camera.position.set(x+x/r*11,y+7,z+(z+18)/r*11);g.view.camera.lookAt(x,y+.5,z);
  });
  await page.waitForTimeout(100);await page.screenshot({path:'.runtime/seesaw-overview.png'});
  await page.keyboard.press('Escape');await page.waitForFunction(()=>g.run.phase==='paused');
  page.once('dialog',dialog=>dialog.accept());await page.click('#restart');await page.waitForFunction(()=>g.run.phase==='playing');
  assert.equal((await snapshot()).completed,false,'new journey resets Sam dialogue');assert.equal(await page.evaluate(()=>g.store.saved?.samSeen),false);
  assert.deepEqual(errors,[]);
  console.log('Sam + seesaw passed: supplied SAM.glb with upright dimensions, isolated translucent materials and preserved textures, checkpoint gate, walkable dynamic bridge, exact dialogue, keyboard repeat, pause, reentry, R reset, persisted completion and restart. Screenshots in .runtime/.');
}finally{await browser.close();}
