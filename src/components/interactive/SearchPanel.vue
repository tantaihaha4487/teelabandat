<script setup lang="ts">
import { computed, ref } from 'vue';
import { normalizeSearch, searchEntries } from '../../lib/search';
import type { SearchEntry } from '../../lib/types';

const props = withDefaults(defineProps<{
  entries: SearchEntry[];
  initialQuery?: string;
}>(), {
  initialQuery: '',
});

const query = ref(normalizeSearch(props.initialQuery));

const results = computed(() => {
  return searchEntries(props.entries, query.value);
});

const statusText = computed(() => {
  const normalizedQuery = normalizeSearch(query.value);
  if (!normalizedQuery) return 'พิมพ์คำที่ต้องการค้นหาได้ทั้งภาษาไทยและชื่อคำสั่ง';
  if (!results.value.length) return `ยังไม่พบเนื้อหาสำหรับ “${query.value}”`;
  return `พบ ${results.value.length} รายการสำหรับ “${query.value}”`;
});

function clearSearch() {
  query.value = '';
}
</script>

<template>
  <section class="search-panel" aria-label="ค้นหาบทเรียนและแบบฝึก">
    <form class="search-form" role="search" @submit.prevent>
      <label for="learning-search">คำค้น</label>
      <div class="search-input-row">
        <input id="learning-search" v-model="query" type="search" autocomplete="off" placeholder="เช่น ตัวแปร หรือ git commit" />
        <button v-if="query" type="button" class="clear-button" @click="clearSearch">ล้างคำค้น</button>
      </div>
    </form>

    <p class="search-status" aria-live="polite">{{ statusText }}</p>

    <ul v-if="results.length" class="result-list">
      <li v-for="entry in results" :key="entry.id" class="result-item">
        <a :href="entry.url">
          <span class="result-type">{{ entry.type === 'lesson' ? 'บทเรียน' : 'แบบฝึกหัด' }} · {{ entry.section }}</span>
          <strong>{{ entry.title }}</strong>
          <span>{{ entry.description }}</span>
        </a>
      </li>
    </ul>

    <p v-else-if="query" class="empty-result">ลองใช้คำที่สั้นลง หรือค้นด้วยชื่อคำสั่งที่อยู่ในโค้ด</p>
  </section>
</template>

<style scoped>
.search-panel {
  --interactive-primary: var(--primary, #6741a5);
  --interactive-paper: var(--paper, #faf6f0);
  --interactive-container: var(--container, #efe4f2);
  --interactive-ink: var(--ink, #1a1420);
  --interactive-muted: var(--muted, #51465c);
  --interactive-outline: var(--outline, #d8cedd);

  color: var(--interactive-ink);
  background: var(--interactive-paper);
  border: 1px solid var(--interactive-outline);
  border-inline-start: 5px solid var(--interactive-primary);
  border-radius: 16px 6px 6px 16px;
}

.search-heading {
  padding: 1.35rem 1.35rem 1rem;
}

.eyebrow {
  margin: 0 0 0.35rem;
  color: var(--interactive-muted);
  font-size: 0.76rem;
  font-weight: 600;
}

h2 {
  margin: 0;
  font-family: var(--body, 'IBM Plex Sans Thai', sans-serif);
  font-size: clamp(1.3rem, 2vw, 1.7rem);
  font-weight: 600;
  line-height: 1.35;
}

.search-heading p:last-child {
  max-width: 58ch;
  margin: 0.6rem 0 0;
  color: var(--interactive-muted);
  line-height: 1.75;
}

.search-form {
  padding: 1rem 1.35rem;
  background: var(--interactive-container);
  border-block: 1px solid var(--interactive-outline);
}

.search-form label {
  display: block;
  margin-bottom: 0.35rem;
  color: var(--interactive-muted);
  font-size: 0.82rem;
  font-weight: 600;
}

.search-input-row {
  display: flex;
  gap: 0.65rem;
}

input,
button {
  min-height: 2.8rem;
  font: inherit;
}

input {
  flex: 1;
  min-width: 0;
  padding: 0.65rem 0.8rem;
  color: var(--interactive-ink);
  background: var(--interactive-paper);
  border: 1px solid var(--interactive-outline);
  border-radius: 8px 8px 3px 8px;
}

button {
  padding: 0.55rem 0.8rem;
  color: var(--interactive-primary);
  background: transparent;
  border: 1px solid var(--interactive-outline);
  border-radius: 8px 8px 3px 8px;
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
}

button:hover {
  background: color-mix(in srgb, var(--interactive-primary) 8%, transparent);
}

input:focus-visible,
button:focus-visible,
a:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--interactive-primary) 40%, transparent);
  outline-offset: 2px;
}

.search-status,
.empty-result {
  margin: 0;
  padding: 0.8rem 1.35rem;
  color: var(--interactive-muted);
  font-size: 0.88rem;
}

.result-list {
  display: grid;
  gap: 0.65rem;
  margin: 0;
  padding: 0 1.35rem 1.35rem;
  list-style: none;
}

.result-item a {
  display: grid;
  gap: 0.25rem;
  padding: 0.95rem 1rem;
  color: var(--interactive-ink);
  background: #fffdfa;
  border: 1px solid var(--interactive-outline);
  border-radius: 8px 8px 3px 8px;
  text-decoration: none;
  transition: opacity 150ms cubic-bezier(0.31, 0.94, 0.34, 1), transform 150ms cubic-bezier(0.31, 0.94, 0.34, 1);
}

.result-item a:hover {
  transform: translateX(3px);
}

.result-item strong {
  color: var(--interactive-primary);
  font-family: var(--body, 'IBM Plex Sans Thai', sans-serif);
  font-size: 1rem;
  font-weight: 600;
}

.result-item span:last-child {
  color: var(--interactive-muted);
  line-height: 1.6;
}

.result-type {
  color: var(--interactive-muted);
  font-size: 0.75rem;
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .result-item a {
    transition: none;
  }

  .result-item a:hover {
    transform: none;
  }
}

@media (max-width: 40rem) {
  .search-heading,
  .search-form,
  .search-status,
  .empty-result,
  .result-list {
    padding-inline: 0.9rem;
  }

  .search-input-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
