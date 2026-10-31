import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
let output=resolve(root,'exports/glb'),runtimeOnly=false;
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
  if(args[i]==='--runtime-only'){runtimeOnly=true;continue;}
  if(args[i]==='--out'&&args[i+1]){output=resolve(process.cwd(),args[++i]);continue;}
  if(args[i]==='--help'){console.log('npm run export:glb -- [--out directory] [--runtime-only]\nExports existing procedural art using local Vite + headless Chrome; no game server or network is required.\nOnly named model files, manifest.json and README.md are overwritten.');process.exit(0);}
  throw Error(`Unknown argument: ${args[i]}`);
}
let vite,browser;
try{
  await mkdir(output,{recursive:true});
  vite=await createServer({root,configFile:false,appType:'mpa',server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});await vite.listen();
  const address=vite.httpServer.address(),origin=`http://127.0.0.1:${address.port}`;
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server']});const page=await browser.newPage();
  page.on('pageerror',e=>console.error(e));
  await page.exposeFunction('saveGLB',async(file,data,report)=>{
    if(basename(file)!==file||!file.endsWith('.glb'))throw Error('Invalid output filename');
    const bytes=Buffer.from(data,'base64');if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error(`Invalid GLB header: ${file}`);
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8').trim());
    if(json.buffers?.some(b=>b.uri)||json.images?.some(i=>i.uri))throw Error(`External dependency in ${file}`);
    await writeFile(resolve(output,file),bytes);console.log(`${file}  ${(report.bytes/1024).toFixed(1)} KB  ${report.meshes} meshes`);
  });
  await page.goto(`${origin}/tools/export.html`);await page.waitForFunction(()=>typeof window.exportAll==='function');
  const manifest=await page.evaluate(runtimeOnly=>window.exportAll(runtimeOnly),runtimeOnly);
  await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await writeFile(resolve(output,'README.md'),await readFile(resolve(root,'docs/GLB-ASSETS.md'),'utf8'));
  console.log(`Exported and reloaded ${manifest.assets.length} self-contained GLBs: ${output}`);
}finally{await browser?.close();await vite?.close();}
