<script>
  import { ditherFace, STYLES } from 'dither-face'

  const px = 80
  const initialSeed = 'preview-output'
  const initialName = '7even'
  let seed = $state(initialSeed)
  let name = $state(initialName)
  let style = $state('pixel-sprite')

  function dataUrl(svg) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }

  const initial = STYLES.map((entry) => ({
    slug: entry.slug,
    src: dataUrl(ditherFace(initialSeed, { style: entry.slug, name: initialName, px })),
  }))

  let live = $derived(
    STYLES.map((entry) => ({
      slug: entry.slug,
      src: dataUrl(ditherFace(seed, { style: entry.slug, name, px })),
    })),
  )

  let current = $derived(live.find((entry) => entry.slug === style) ?? live[0])
</script>

<main data-framework="svelte">
  <h1>Svelte qualification</h1>
  <section id="explorer">
    <div class="controls">
      <label for="seed">Seed <input id="seed" bind:value={seed} /></label>
      <label for="name">Name <input id="name" bind:value={name} /></label>
      <label for="style">
        Style
        <select id="style" bind:value={style}>
          {#each STYLES as entry (entry.slug)}
            <option value={entry.slug}>{entry.slug}</option>
          {/each}
        </select>
      </label>
    </div>

    <div id="current" data-style={style}>
      <img id="current-avatar" data-avatar="current" alt="" src={current.src} />
    </div>

    <h2>Server initial</h2>
    <ul id="initial-grid">
      {#each initial as entry (entry.slug)}
        <li data-initial-style={entry.slug}>
          <img data-initial={entry.slug} alt={`initial ${entry.slug}`} src={entry.src} />
        </li>
      {/each}
    </ul>

    <h2>Live</h2>
    <ul id="live-grid">
      {#each live as entry (entry.slug)}
        <li data-live-style={entry.slug}>
          <img data-live={entry.slug} alt={`live ${entry.slug}`} src={entry.src} />
        </li>
      {/each}
    </ul>
  </section>
</main>
