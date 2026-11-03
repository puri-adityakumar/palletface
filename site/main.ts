import { ditherFace, STYLES } from '../src/index.js'
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const seed = byId<HTMLInputElement>('seed'), name = byId<HTMLInputElement>('name'), size = byId<HTMLSelectElement>('size')
const gallery = byId<HTMLDivElement>('gallery'), preview = byId<HTMLDivElement>('preview'), status = byId<HTMLParagraphElement>('status')
let selected = STYLES[0]!.slug
const params = new URLSearchParams(location.search)
seed.value = params.get('seed') ?? 'dither-face'
name.value = params.get('name') ?? ''
if (STYLES.some(s => s.slug === params.get('style'))) selected = params.get('style')!
if (['48','80','128','192'].includes(params.get('size') ?? '')) size.value = params.get('size')!
function stateUrl() { const p = new URLSearchParams(); p.set('seed', seed.value); if(name.value) p.set('name', name.value); p.set('style', selected); p.set('size', size.value); return `${location.pathname}?${p}` }
function render() {
  const style = STYLES.find(s => s.slug === selected)!
  preview.innerHTML = ditherFace(seed.value, { style: selected, px: Number(size.value), name: name.value })
  byId('selected-title').textContent = style.title; byId('selected-note').textContent = style.note
  for (const b of gallery.querySelectorAll<HTMLButtonElement>('button')) { b.setAttribute('aria-pressed', String(b.dataset.style === selected)) }
  history.replaceState(null, '', stateUrl())
}
for(const style of STYLES) { const button=document.createElement('button'); button.type='button'; button.className='style-card'; button.dataset.style=style.slug; button.setAttribute('aria-label',`Select ${style.title}`); button.innerHTML=`<span class="thumb"></span><span class="style-name"></span><span class="style-note"></span>`; button.querySelector('.thumb')!.innerHTML=ditherFace(seed.value,{style:style.slug,px:64,name:name.value}); button.querySelector('.style-name')!.textContent=style.title; button.querySelector('.style-note')!.textContent=style.note; button.addEventListener('click',()=>{selected=style.slug;render()}); gallery.append(button) }
function refresh(){ for(const [i,style] of STYLES.entries()) gallery.children[i]!.querySelector('.thumb')!.innerHTML=ditherFace(seed.value,{style:style.slug,px:64,name:name.value}); render() }
seed.addEventListener('input',refresh); name.addEventListener('input',refresh); size.addEventListener('change',render)
const svg=()=>ditherFace(seed.value,{style:selected,px:Number(size.value),name:name.value})
async function copy(text:string, message:string){try{await navigator.clipboard.writeText(text);status.textContent=message}catch{status.textContent='Clipboard unavailable. Select and copy the content manually.'}}
byId('copy-svg').addEventListener('click',()=>copy(svg(),'SVG copied.'))
byId('copy-code').addEventListener('click',()=>copy(`ditherFace(${JSON.stringify(seed.value)}, { style: ${JSON.stringify(selected)}, px: ${Number(size.value)}${name.value ? `, name: ${JSON.stringify(name.value)}` : ''} })`,'Usage code copied.'))
byId('share').addEventListener('click',()=>copy(location.href,'Share link copied.'))
byId('download-svg').addEventListener('click',()=>{const blob=new Blob([svg()],{type:'image/svg+xml;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='dither-face.svg';a.click();URL.revokeObjectURL(a.href);status.textContent='SVG downloaded.'})
render()
