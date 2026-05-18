<template>
  <VCard v-if="showMap">
    <VCardHeader class="flex items-center gap-3">
      <img
        :src="gbifMark"
        alt="GBIF"
        class="h-8 w-auto shrink-0"
      />
      <h2 class="text-md">GBIF occurrences map</h2>
    </VCardHeader>
    <div class="relative w-full h-64 overflow-hidden rounded-b">
      <div
        ref="mapEl"
        class="absolute inset-0"
      />
      <button
        type="button"
        @click="openExplore"
        class="absolute bottom-2 left-2 z-[1000] px-2 py-1 text-xs rounded bg-base-background border border-base-border shadow hover:bg-base-foreground"
      >
        Explore →
      </button>
    </div>
  </VCard>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import {
  useGbifMatch,
  deriveScientificName,
  CHECKLIST_KEY,
  GBIF_OCCURRENCE_BASE
} from '../_gbifShared/useGbifMatch'
import gbifMark from '../_gbifShared/gbif-mark.svg'

const GBIF_MAP_CAPABILITIES =
  'https://api.gbif.org/v2/map/occurrence/density/capabilities.json'
const GBIF_TILE_TEMPLATE =
  'https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}@2x.png'
const ARCGIS_TILE_TEMPLATE =
  'https://services.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'

const props = defineProps({
  otuId: { type: [Number, String], required: true },
  taxonId: { type: [Number, String], required: true },
  taxon: { type: Object, default: undefined },
  otu: { type: Object, default: undefined }
})

const scientificName = computed(() => deriveScientificName(props.taxon, props.otu))
const { gbifKey } = useGbifMatch(scientificName)

const georeferencedCount = ref(null)
const mapEl = ref(null)
let mapInstance = null
let gbifTileLayer = null

const showMap = computed(
  () =>
    typeof georeferencedCount.value === 'number' && georeferencedCount.value > 0
)

async function fetchMapCapabilities(taxonKey) {
  georeferencedCount.value = null

  try {
    const url = new URL(GBIF_MAP_CAPABILITIES)
    url.searchParams.set('taxonKey', taxonKey)
    url.searchParams.set('checklistKey', CHECKLIST_KEY)

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    georeferencedCount.value =
      typeof data?.total === 'number' ? data.total : 0
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
    taxonKey,
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

watch(
  gbifKey,
  (key) => {
    destroyMap()
    if (key) fetchMapCapabilities(key)
    else georeferencedCount.value = null
  },
  { immediate: true }
)

watch([showMap, mapEl, gbifKey], async ([show, el, key]) => {
  if (!show || !el || !key) return
  await nextTick()
  if (mapInstance) {
    addGbifLayer((await import('leaflet')).default, key)
  } else {
    initMap(key)
  }
})

onBeforeUnmount(destroyMap)
</script>
