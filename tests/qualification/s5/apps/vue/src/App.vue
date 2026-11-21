<script setup>
import { computed, ref } from 'vue'
import { ditherFace, STYLES } from 'dither-face'

const px = 80
const initialSeed = 'preview-output'
const initialName = '7even'
const seed = ref(initialSeed)
const name = ref(initialName)
const style = ref('pixel-sprite')

function dataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const initial = STYLES.map((entry) => ({
  slug: entry.slug,
  src: dataUrl(ditherFace(initialSeed, { style: entry.slug, name: initialName, px })),
}))

const live = computed(() =>
  STYLES.map((entry) => ({
    slug: entry.slug,
    src: dataUrl(ditherFace(seed.value, { style: entry.slug, name: name.value, px })),
  })),
)

const current = computed(
  () => live.value.find((entry) => entry.slug === style.value) ?? live.value[0],
)
</script>

<template>
  <main data-framework="vue">
    <h1>Vue 3 qualification</h1>
    <section id="explorer">
      <div class="controls">
        <label for="seed">Seed <input id="seed" v-model="seed" /></label>
        <label for="name">Name <input id="name" v-model="name" /></label>
        <label for="style">
          Style
          <select id="style" v-model="style">
            <option v-for="entry in STYLES" :key="entry.slug" :value="entry.slug">
              {{ entry.slug }}
            </option>
          </select>
        </label>
      </div>

      <div id="current" :data-style="style">
        <img id="current-avatar" data-avatar="current" alt="" :src="current.src" />
      </div>

      <h2>Server initial</h2>
      <ul id="initial-grid">
        <li v-for="entry in initial" :key="entry.slug" :data-initial-style="entry.slug">
          <img :data-initial="entry.slug" :alt="`initial ${entry.slug}`" :src="entry.src" />
        </li>
      </ul>

      <h2>Live</h2>
      <ul id="live-grid">
        <li v-for="entry in live" :key="entry.slug" :data-live-style="entry.slug">
          <img :data-live="entry.slug" :alt="`live ${entry.slug}`" :src="entry.src" />
        </li>
      </ul>
    </section>
  </main>
</template>
