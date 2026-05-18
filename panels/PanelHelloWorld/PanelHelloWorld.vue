<template>
  <VCard>
    <VCardHeader>
      <h2 class="text-md">This taxon in GBIF</h2>
    </VCardHeader>
    <VCardContent class="text-sm">
      <VSpinner
        v-if="loading"
        logo-class="w-6 h-6"
        legend=""
      />

      <p
        v-else-if="error"
        class="opacity-60"
      >
        Could not load GBIF match.
      </p>

      <p
        v-else-if="!match"
        class="opacity-60"
      >
        No confident match could be found on GBIF for
        <em>{{ scientificName }}</em
        >.
      </p>

      <div
        v-else
        class="space-y-2"
      >
        <p
          class="text-base"
          v-html="displayName"
        />

        <p
          v-if="isSynonym"
          class="text-xs opacity-70"
        >
          Synonym:
          <span v-html="match.usage.formattedName" />
        </p>

        <div v-if="images.length">
          <div
            class="relative w-full h-80 rounded border border-base-border bg-base-foreground overflow-hidden"
          >
            <img
              :key="currentImage.identifier"
              :src="currentImage.identifier"
              :alt="`Occurrence ${currentImage.occurrenceKey}`"
              class="absolute inset-0 w-full h-full object-contain transition-opacity duration-150"
              :class="imageLoading || imageError ? 'opacity-0' : 'opacity-100'"
              loading="lazy"
              @load="onImageLoad"
              @error="onImageError"
            />

            <div
              v-if="imageLoading"
              class="absolute inset-0 flex items-center justify-center"
            >
              <VSpinner
                logo-class="w-6 h-6"
                legend=""
              />
            </div>

            <p
              v-if="imageError"
              class="absolute inset-0 flex items-center justify-center text-xs opacity-70"
            >
              Image failed to load
            </p>

            <button
              v-if="images.length > 1"
              type="button"
              @click="prevImage"
              aria-label="Previous image"
              class="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-base-background/80 border border-base-border shadow hover:bg-base-foreground"
            >
              ‹
            </button>
            <button
              v-if="images.length > 1"
              type="button"
              @click="nextImage"
              aria-label="Next image"
              class="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-base-background/80 border border-base-border shadow hover:bg-base-foreground"
            >
              ›
            </button>

            <a
              :href="currentImageOccurrenceUrl"
              target="_blank"
              rel="noopener"
              class="absolute bottom-2 right-2 px-2 py-1 text-xs rounded bg-base-background/80 border border-base-border shadow hover:bg-base-foreground"
            >
              See on GBIF →
            </a>
          </div>

          <p class="mt-1 text-xs opacity-70 flex justify-between gap-2">
            <span class="truncate">
              {{ currentImage.rightsHolder || 'Unknown rights holder' }}
              <template v-if="currentImageLicense">
                <span class="opacity-60 mx-1">·</span>
                <a
                  :href="currentImageLicense.url"
                  target="_blank"
                  rel="noopener"
                  class="underline"
                >
                  {{ currentImageLicense.label }}
                </a>
              </template>
            </span>
            <span class="shrink-0">
              {{ imageIndex + 1 }} / {{ images.length }}
            </span>
          </p>
        </div>

        <ol
          v-if="classification.length"
          class="flex flex-wrap gap-x-1 text-xs opacity-80"
        >
          <li
            v-for="(rank, index) in classification"
            :key="rank.key"
            class="after:content-['›'] after:ml-1 last:after:content-['']"
          >
            <span class="uppercase opacity-60 mr-1">{{ rank.rank }}</span>
            {{ rank.name }}
          </li>
        </ol>

        <p class="text-xs opacity-80">
          <span v-if="occurrenceCount === null">Loading occurrences…</span>
          <span v-else-if="occurrenceCount === undefined">
            Occurrence count unavailable.
          </span>
          <span v-else>
            <a
              :href="occurrenceUrl"
              target="_blank"
              rel="noopener"
              class="text-primary-color underline"
            >
              <strong>{{ formattedOccurrenceCount }}</strong> occurrence{{
                occurrenceCount === 1 ? '' : 's'
              }}
            </a>
            on GBIF
          </span>
        </p>

        <div
          v-show="showMap"
          class="relative w-full h-64"
        >
          <div
            ref="mapEl"
            class="absolute inset-0 rounded border border-base-border"
          />
          <button
            type="button"
            @click="openExplore"
            class="absolute bottom-2 left-2 z-[1000] px-2 py-1 text-xs rounded bg-base-background border border-base-border shadow hover:bg-base-foreground"
          >
            Explore →
          </button>
        </div>

        <p>
          <a
            :href="gbifUrl"
            target="_blank"
            rel="noopener"
            class="text-primary-color underline"
          >
            View on GBIF →
          </a>
        </p>
      </div>
    </VCardContent>
  </VCard>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

const CHECKLIST_KEY = '7ddf754f-d193-4cc9-b351-99906754a03b'
const GBIF_TAXON_BASE = 'https://demo.gbif-staging.org/taxon'
const GBIF_OCCURRENCE_BASE = 'https://demo.gbif-staging.org/occurrence/search'
const GBIF_OCCURRENCE_DETAIL = 'https://demo.gbif-staging.org/occurrence'
const GBIF_OCCURRENCE_SEARCH = 'https://api.gbif.org/v1/occurrence/search'
const GBIF_MULTIMEDIA_BASE =
  'https://api.gbif.org/v1/occurrence/experimental/multimedia/species'
const GBIF_MAP_CAPABILITIES =
  'https://api.gbif.org/v2/map/occurrence/density/capabilities.json'
const GBIF_TILE_TEMPLATE =
  'https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}@2x.png'
const ARCGIS_TILE_TEMPLATE =
  'https://services.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'
const MIN_CONFIDENCE = 80
const ACCEPTED_MATCH_TYPES = ['EXACT', 'FUZZY', 'HIGHERRANK']
const IMAGE_LIMIT = 20
const IMAGE_RANKS = new Set([
  'FAMILY',
  'SUBFAMILY',
  'INFRAFAMILY',
  'SUPERTRIBE',
  'TRIBE',
  'SUBTRIBE',
  'INFRATRIBE',
  'SUPERGENUS',
  'GENUS',
  'SUBGENUS',
  'INFRAGENUS',
  'SECTION',
  'SUBSECTION',
  'SERIES',
  'SUBSERIES',
  'SPECIES_AGGREGATE',
  'SPECIES',
  'SUBSPECIES',
  'INFRASUBSPECIFIC_NAME',
  'VARIETY',
  'SUBVARIETY',
  'FORM',
  'SUBFORM',
  'CULTIVAR',
  'CULTIVAR_GROUP',
  'CONVARIETY',
  'GREX',
  'STRAIN',
  'PATHOVAR',
  'BIOVAR',
  'CHEMOVAR',
  'MORPHOVAR',
  'PHAGOVAR',
  'SEROVAR',
  'FORMA_SPECIALIS',
  'ABERRATION',
  'RACE',
  'NATIO',
  'PROLES'
])

const props = defineProps({
  otuId: {
    type: [Number, String],
    required: true
  },

  taxonId: {
    type: [Number, String],
    required: true
  },

  taxon: {
    type: Object,
    default: undefined
  },

  otu: {
    type: Object,
    default: undefined
  }
})

const loading = ref(false)
const error = ref(false)
const match = ref(null)
const occurrenceCount = ref(null)
const georeferencedCount = ref(null)
const images = ref([])
const imageIndex = ref(0)
const imageLoading = ref(false)
const imageError = ref(false)
const mapEl = ref(null)
let mapInstance = null
let gbifTileLayer = null

const scientificName = computed(
  () =>
    props.taxon?.name ||
    props.taxon?.full_name ||
    props.otu?.object_label ||
    ''
)

const isSynonym = computed(
  () => !!(match.value?.usage?.status === 'SYNONYM' && match.value.acceptedUsage)
)

const targetUsage = computed(() =>
  isSynonym.value ? match.value.acceptedUsage : match.value?.usage
)

const displayName = computed(() => targetUsage.value?.formattedName || '')

const classification = computed(() => match.value?.classification || [])

const gbifKey = computed(() => targetUsage.value?.key)

const gbifUrl = computed(() => `${GBIF_TAXON_BASE}/${gbifKey.value}`)

const occurrenceUrl = computed(
  () => `${GBIF_OCCURRENCE_BASE}?taxonKey=${gbifKey.value}`
)

const formattedOccurrenceCount = computed(() =>
  typeof occurrenceCount.value === 'number'
    ? occurrenceCount.value.toLocaleString()
    : ''
)

const showMap = computed(
  () => typeof georeferencedCount.value === 'number' && georeferencedCount.value > 0
)

const shouldFetchImages = computed(() => {
  const rank = targetUsage.value?.rank
  return rank ? IMAGE_RANKS.has(rank) : false
})

const currentImage = computed(() => images.value[imageIndex.value])

const currentImageOccurrenceUrl = computed(() =>
  currentImage.value?.occurrenceKey
    ? `${GBIF_OCCURRENCE_DETAIL}/${currentImage.value.occurrenceKey}`
    : '#'
)

const currentImageLicense = computed(() => formatLicense(currentImage.value?.license))

function formatLicense(url) {
  if (!url) return null

  const cc = url.match(
    /creativecommons\.org\/licenses\/([a-z-]+)\/([0-9.]+)/i
  )
  if (cc) return { label: `CC ${cc[1].toUpperCase()} ${cc[2]}`, url }

  const cc0 = url.match(
    /creativecommons\.org\/publicdomain\/zero\/([0-9.]+)/i
  )
  if (cc0) return { label: `CC0 ${cc0[1]}`, url }

  const pdm = url.match(
    /creativecommons\.org\/publicdomain\/mark\/([0-9.]+)/i
  )
  if (pdm) return { label: `Public Domain ${pdm[1]}`, url }

  return { label: url.replace(/^https?:\/\//, ''), url }
}

function isConfidentMatch(data) {
  const matchType = data?.diagnostics?.matchType
  const confidence = data?.diagnostics?.confidence ?? 0

  return (
    !!data?.usage?.key &&
    ACCEPTED_MATCH_TYPES.includes(matchType) &&
    confidence >= MIN_CONFIDENCE
  )
}

async function fetchOccurrenceCount(taxonKey) {
  occurrenceCount.value = null

  try {
    const url = new URL(GBIF_OCCURRENCE_SEARCH)
    url.searchParams.set('taxonKey', taxonKey)
    url.searchParams.set('checklistKey', CHECKLIST_KEY)
    url.searchParams.set('limit', '0')

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    occurrenceCount.value = typeof data?.count === 'number' ? data.count : undefined
  } catch (e) {
    occurrenceCount.value = undefined
  }
}

async function fetchImages(taxonKey) {
  images.value = []
  imageIndex.value = 0

  try {
    const url = new URL(
      `${GBIF_MULTIMEDIA_BASE}/${CHECKLIST_KEY}/${taxonKey}`
    )
    url.searchParams.set('mediaType', 'stillImage')
    url.searchParams.set('limit', String(IMAGE_LIMIT))
    url.searchParams.set('offset', '0')

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    images.value = (data?.results || []).filter((item) => item.identifier)
  } catch (e) {
    images.value = []
  }
}

function prevImage() {
  if (!images.value.length) return
  imageIndex.value =
    (imageIndex.value - 1 + images.value.length) % images.value.length
}

function nextImage() {
  if (!images.value.length) return
  imageIndex.value = (imageIndex.value + 1) % images.value.length
}

function onImageLoad() {
  imageLoading.value = false
  imageError.value = false
}

function onImageError() {
  imageLoading.value = false
  imageError.value = true
}

async function fetchMapCapabilities(taxonKey) {
  georeferencedCount.value = null

  try {
    const url = new URL(GBIF_MAP_CAPABILITIES)
    url.searchParams.set('taxonKey', taxonKey)
    url.searchParams.set('checklistKey', CHECKLIST_KEY)

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    georeferencedCount.value = typeof data?.total === 'number' ? data.total : 0
  } catch (e) {
    georeferencedCount.value = 0
  }
}

async function initMap(taxonKey) {
  if (typeof window === 'undefined' || !mapEl.value || mapInstance) return

  const L = (await import('leaflet')).default

  mapInstance = L.map(mapEl.value, {
    center: [20, 0],
    zoom: 1,
    minZoom: 1,
    worldCopyJump: true,
    scrollWheelZoom: false,
    attributionControl: true
  })

  L.tileLayer(ARCGIS_TILE_TEMPLATE, {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 18
  }).addTo(mapInstance)

  addGbifLayer(L, taxonKey)
}

function addGbifLayer(L, taxonKey) {
  if (!mapInstance) return

  if (gbifTileLayer) {
    gbifTileLayer.remove()
    gbifTileLayer = null
  }

  const params = new URLSearchParams({
    style: 'classic.poly',
    bin: 'hex',
    hexPerTile: '70',
    taxonKey: taxonKey,
    checklistKey: CHECKLIST_KEY,
    srs: 'EPSG:3857'
  })

  gbifTileLayer = L.tileLayer(`${GBIF_TILE_TEMPLATE}?${params}`, {
    attribution: 'Occurrences &copy; <a href="https://www.gbif.org">GBIF</a>',
    maxZoom: 18
  }).addTo(mapInstance)
}

function openExplore() {
  if (!mapInstance) return

  const bounds = mapInstance.getBounds()
  const minLat = Math.max(-90, bounds.getSouth())
  const maxLat = Math.min(90, bounds.getNorth())
  const minLng = bounds.getWest()
  const maxLng = bounds.getEast()

  const ring = [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat]
  ]
    .map(([lng, lat]) => `${lng} ${lat}`)
    .join(', ')

  const wkt = `POLYGON((${ring}))`
  const url = `${GBIF_OCCURRENCE_BASE}?geometry=${encodeURIComponent(wkt)}`

  window.open(url, '_blank', 'noopener')
}

function destroyMap() {
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
    gbifTileLayer = null
  }
}

async function fetchMatch() {
  if (!scientificName.value) return

  loading.value = true
  error.value = false
  match.value = null
  occurrenceCount.value = null
  georeferencedCount.value = null
  images.value = []
  imageIndex.value = 0
  imageLoading.value = false
  imageError.value = false
  destroyMap()

  try {
    const url = new URL('https://api.gbif.org/v2/species/match')
    url.searchParams.set('scientificName', scientificName.value)
    url.searchParams.set('verbose', 'true')
    url.searchParams.set('checklistKey', CHECKLIST_KEY)

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    if (isConfidentMatch(data)) {
      match.value = data
      const key =
        data.usage.status === 'SYNONYM' && data.acceptedUsage
          ? data.acceptedUsage.key
          : data.usage.key
      fetchOccurrenceCount(key)
      fetchMapCapabilities(key)
      if (shouldFetchImages.value) fetchImages(key)
    }
  } catch (e) {
    error.value = true
  } finally {
    loading.value = false
  }
}

watch([showMap, mapEl, gbifKey], async ([show, el, key]) => {
  if (!show || !el || !key) return
  await nextTick()
  if (mapInstance) {
    addGbifLayer((await import('leaflet')).default, key)
  } else {
    initMap(key)
  }
})

watch(
  () => currentImage.value?.identifier,
  (val) => {
    if (val) {
      imageLoading.value = true
      imageError.value = false
    }
  },
  { immediate: true }
)

onMounted(fetchMatch)

watch(scientificName, (val, prev) => {
  if (val && val !== prev) fetchMatch()
})

onBeforeUnmount(destroyMap)
</script>
