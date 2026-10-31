import{it,expect,vi,afterEach}from'vitest';import{SaveStore,SAVE_KEY,parseSave}from'../src/storage';import{MAP_ID,RunState}from'../src/model';
afterEach(()=>vi.unstubAllGlobals());
it('keeps the old map save intact and isolates new checkpoints and records',()=>{const old='{"version":1,"checkpoint":4,"best":100}',data=new Map<string,string>([['baby-steps:save:v1',old],['baby-steps:muted:v1','true']]);vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});const store=new SaveStore();expect(store.saved).toBeNull();expect(store.muted).toBe(true);const run=new RunState();run.reset();store.write(run,true);expect(data.get('baby-steps:save:v1')).toBe(old);expect(parseSave(data.get(SAVE_KEY)!)?.map).toBe(MAP_ID);expect(store.saved?.best).toBeNull();});
it('preserves sliding through pause and resume without moving a body',()=>{const run=new RunState();run.phase='sliding';run.pause();expect(run.phase).toBe('paused');run.resume();expect(run.phase).toBe('sliding');});
it('persists Sam and Daniela independently and accepts saves predating Sam',()=>{
 const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});
 const store=new SaveStore(),run=new RunState();run.reset();run.advance(12);store.write(run,false,false,true);
 expect(new SaveStore().saved).toMatchObject({checkpoint:1,danielaSeen:false,samSeen:true});
 const old={...store.saved};delete old.samSeen;expect(parseSave(JSON.stringify(old))?.checkpoint).toBe(1);
 expect(parseSave(JSON.stringify({...old,samSeen:'true'}))).toBeNull();
 run.reset();store.write(run,false,false,false);expect(new SaveStore().saved?.samSeen).toBe(false);
});
it('keeps learned walking through saving and lost checkpoints, but resets it on a new journey',()=>{
 const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});
 const store=new SaveStore(),run=new RunState();run.reset();run.advance(28);run.walkingUnlocked=true;store.write(run,false,false,true,false);
 expect(new SaveStore().saved).toMatchObject({walkingUnlocked:true,rewardSeen:false,checkpoint:2});
 run.checkpoint=0;run.maxProgress=0;store.write(run,false,false,true,true);
 expect(new SaveStore().saved).toMatchObject({walkingUnlocked:true,rewardSeen:true,checkpoint:0});
 const old={...store.saved};delete old.walkingUnlocked;delete old.rewardSeen;expect(parseSave(JSON.stringify(old))).not.toBeNull();
 expect(parseSave(JSON.stringify({...old,walkingUnlocked:'true'}))).toBeNull();
 expect(parseSave(JSON.stringify({...old,rewardSeen:'true'}))).toBeNull();
 expect(parseSave(JSON.stringify({...old,rewardSeen:true,walkingUnlocked:false}))).toBeNull();
 run.reset();store.write(run,false);expect(new SaveStore().saved).toMatchObject({walkingUnlocked:false,rewardSeen:false});
});
it('restores the next ending sentence, accepts older saves and preserves a read ending before finishing',()=>{
 const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});
 const store=new SaveStore(),run=new RunState();run.reset();run.advance(164);run.walkingUnlocked=true;
 for(const endingIndex of Array.from({length:13},(_,index)=>index)){
  store.write(run,false,true,true,true,endingIndex);
  expect(new SaveStore().saved).toMatchObject({checkpointMeters:164,endingIndex,finished:false,walkingUnlocked:true});
 }
 const old={...store.saved};delete old.endingIndex;
 expect(parseSave(JSON.stringify(old))).toMatchObject({checkpointMeters:164,finished:false});
 for(const endingIndex of [-1,13,1.5,'2',null,true])expect(parseSave(JSON.stringify({...old,endingIndex}))).toBeNull();
 run.reset();store.write(run,false);expect(new SaveStore().saved?.endingIndex).toBe(0);
});
it('persists the revealed summit independently of checkpoints, accepts old saves and resets new journeys',()=>{
 const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});
 const store=new SaveStore(),run=new RunState();run.reset();run.advance(164);
 store.write(run,false,false,false,false,0,true);
 expect(new SaveStore().saved).toMatchObject({checkpointMeters:164,summitRevealed:true,finished:false});
 run.checkpoint=0;run.maxProgress=0;store.write(run,false,false,false,false,0,true);
 expect(new SaveStore().saved).toMatchObject({checkpointMeters:0,summitRevealed:true});
 const old={...store.saved};delete old.summitRevealed;
 expect(parseSave(JSON.stringify(old))).toMatchObject({checkpointMeters:0});
 for(const summitRevealed of ['true',1,0,null,{},[]])expect(parseSave(JSON.stringify({...old,summitRevealed}))).toBeNull();
 expect(parseSave(JSON.stringify({...old,summitRevealed:false}))?.summitRevealed).toBe(false);
 run.reset();store.write(run,false);expect(new SaveStore().saved?.summitRevealed).toBe(false);
});
