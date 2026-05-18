import { ref, computed, watch } from 'vue'

export const CHECKLIST_KEY = '7ddf754f-d193-4cc9-b351-99906754a03b'
export const GBIF_TAXON_BASE = 'https://demo.gbif-staging.org/taxon'
export const GBIF_OCCURRENCE_BASE = 'https://demo.gbif-staging.org/occurrence/search'
export const GBIF_OCCURRENCE_DETAIL = 'https://demo.gbif-staging.org/occurrence'

const MATCH_ENDPOINT = 'https://api.gbif.org/v2/species/match'
const MIN_CONFIDENCE = 80
const ACCEPTED_MATCH_TYPES = ['EXACT', 'FUZZY', 'HIGHERRANK']

const cache = new Map()

function isConfidentMatch(data) {
  const matchType = data?.diagnostics?.matchType
  const confidence = data?.diagnostics?.confidence ?? 0

  return (
    !!data?.usage?.key &&
    ACCEPTED_MATCH_TYPES.includes(matchType) &&
    confidence >= MIN_CONFIDENCE
  )
}

async function fetchMatch(name) {
  try {
    const url = new URL(MATCH_ENDPOINT)
    url.searchParams.set('scientificName', name)
    url.searchParams.set('verbose', 'true')
    url.searchParams.set('checklistKey', CHECKLIST_KEY)

    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    return { match: isConfidentMatch(data) ? data : null, error: false }
  } catch (e) {
    return { match: null, error: true }
  }
}

function getOrFetch(name) {
  if (!cache.has(name)) {
    cache.set(name, fetchMatch(name))
  }
  return cache.get(name)
}

export function useGbifMatch(scientificName) {
  const loading = ref(false)
  const error = ref(false)
  const match = ref(null)

  watch(
    () => scientificName.value,
    async (name) => {
      if (!name) {
        match.value = null
        error.value = false
        loading.value = false
        return
      }

      loading.value = true
      error.value = false
      const result = await getOrFetch(name)

      if (scientificName.value !== name) return

      match.value = result.match
      error.value = result.error
      loading.value = false
    },
    { immediate: true }
  )

  const isSynonym = computed(
    () =>
      !!(match.value?.usage?.status === 'SYNONYM' && match.value.acceptedUsage)
  )

  const targetUsage = computed(() =>
    isSynonym.value ? match.value.acceptedUsage : match.value?.usage
  )

  const gbifKey = computed(() => targetUsage.value?.key)

  const classification = computed(() => match.value?.classification || [])

  return {
    loading,
    error,
    match,
    isSynonym,
    targetUsage,
    gbifKey,
    classification
  }
}

export function deriveScientificName(taxon, otu) {
  return taxon?.name || taxon?.full_name || otu?.object_label || ''
}
