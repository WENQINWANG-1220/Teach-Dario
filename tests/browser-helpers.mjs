/** Import the actual Vite entry, including its HMR timestamp, without booting a second game. */
export async function loadGame(page){
  await page.evaluate(async()=>{
    const entry=[...document.scripts].find(s=>s.src&&new URL(s.src).pathname==='/src/main.ts');
    if(!entry)throw Error('Development entry script missing');
    const module=await import(entry.src);await module.ready;
    if(!module.game)throw Error(document.getElementById('asset-error')?.textContent??'Game failed to initialize');
    window.g=module.game;
  });
}
