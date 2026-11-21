import { ditherFace, STYLES } from 'dither-face'
import './style.css'

const seedInput = document.querySelector('#seed')
const nameInput = document.querySelector('#name')
const sizeSelect = document.querySelector('#size')
const resetButton = document.querySelector('#reset')
const grid = document.querySelector('#grid')
const status = document.querySelector('#status')

const initial = { seed: seedInput.value, name: nameInput.value, size: Number(sizeSelect.value) }
const state = { ...initial }
let renders = 0

function currentRecords() {
  return [...grid.querySelectorAll('figure')].map((figure) => {
    const img = figure.querySelector('img')
    return {
      style: figure.dataset.style,
      src: img.src,
      width: img.width,
      height: img.height,
      naturalWidth: img.naturalWidth,
      complete: img.complete,
    }
  })
}

function render() {
  const previous = window.__s4
  renders = (previous?.renders ?? 0) + 1
  const records = []
  grid.replaceChildren()
  for (const style of STYLES) {
    const svg = ditherFace(state.seed, { style: style.slug, px: state.size, name: state.name })
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    const figure = document.createElement('figure')
    figure.dataset.style = style.slug
    const img = document.createElement('img')
    img.alt = `${style.title} avatar`
    img.width = state.size
    img.height = state.size
    img.src = src
    const caption = document.createElement('figcaption')
    caption.textContent = style.slug
    figure.append(img, caption)
    grid.append(figure)
    records.push({ style: style.slug, sha256Input: svg, src })
  }
  window.__s4 = {
    seed: state.seed,
    name: state.name,
    size: state.size,
    renders,
    records,
    initial,
    getRecords: currentRecords,
  }
  status.textContent = `Rendered ${STYLES.length} avatars for ${state.seed} / ${state.name} / ${state.size}px`
}

function applyControls() {
  state.seed = seedInput.value
  state.name = nameInput.value
  state.size = Number(sizeSelect.value)
  render()
}

document.querySelector('#controls').addEventListener('submit', (event) => event.preventDefault())
seedInput.addEventListener('input', applyControls)
nameInput.addEventListener('input', applyControls)
sizeSelect.addEventListener('change', applyControls)
resetButton.addEventListener('click', () => {
  seedInput.value = initial.seed
  nameInput.value = initial.name
  sizeSelect.value = String(initial.size)
  applyControls()
})

render()
