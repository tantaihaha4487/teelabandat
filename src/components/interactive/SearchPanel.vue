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
  color: var(--md-on-surface);
}

.search-form {
  position: relative;
}

.search-form label {
  display: block;
  margin: 0 0 0.5rem 1.25rem;
  color: var(--md-on-surface-variant);
  font-size: 0.9rem;
  font-weight: 600;
}

.search-input-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 4rem;
  padding: 0.4rem 0.4rem 0.4rem 1.4rem;
  background: var(--md-surface-container-high);
  border-radius: var(--shape-full);
}

.search-input-row::before {
  content: "";
  flex: none;
  width: 1.4rem;
  height: 1.4rem;
  background: var(--md-on-surface-variant);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'/%3E%3C/svg%3E") center / contain no-repeat;
}

input,
button {
  min-height: 3rem;
  font: inherit;
}

input {
  flex: 1;
  min-width: 0;
  padding: 0.5rem 0.25rem;
  color: var(--md-on-surface);
  background: transparent;
  border: 0;
  font-size: 1.05rem;
}

input::placeholder {
  color: var(--md-on-surface-variant);
  opacity: 0.8;
}

input:focus-visible {
  outline: none;
}

.search-input-row:focus-within {
  outline: 3px solid var(--md-primary);
  outline-offset: 2px;
}

button {
  flex: none;
  padding: 0.5rem 1.25rem;
  color: var(--md-on-secondary-container);
  background: var(--md-secondary-container);
  border: 0;
  border-radius: var(--shape-full);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform var(--dur-click) var(--ease-expressive-spatial);
}

button:active {
  transform: scale(0.95);
  transition-duration: var(--dur-fast);
}

button:focus-visible,
a:focus-visible {
  outline: 3px solid var(--md-primary);
  outline-offset: 2px;
}

.search-status,
.empty-result {
  margin: 0;
  padding: 1rem 1.25rem;
  color: var(--md-on-surface-variant);
  font-size: 0.95rem;
}

.result-list {
  display: grid;
  gap: 6px;
  margin: 0 0 3rem;
  padding: 0;
  list-style: none;
}

.result-item {
  animation: result-in var(--dur-enter) var(--ease-emph-decel) both;
}

.result-item:nth-child(2) { animation-delay: 30ms; }
.result-item:nth-child(3) { animation-delay: 60ms; }
.result-item:nth-child(4) { animation-delay: 90ms; }
.result-item:nth-child(n + 5) { animation-delay: 120ms; }

@keyframes result-in {
  from { opacity: 0; translate: 0 10px; }
}

.result-item a {
  position: relative;
  isolation: isolate;
  display: grid;
  gap: 0.2rem;
  padding: 1.1rem 1.4rem;
  color: var(--md-on-surface);
  background: var(--md-surface-container-low);
  border-radius: var(--shape-lg);
  text-decoration: none;
}

.result-item:first-child a { border-radius: var(--shape-xl) var(--shape-xl) var(--shape-lg) var(--shape-lg); }
.result-item:last-child a { border-radius: var(--shape-lg) var(--shape-lg) var(--shape-xl) var(--shape-xl); }
.result-item:only-child a { border-radius: var(--shape-xl); }

.result-item a::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--md-secondary-container);
  opacity: 0;
  transition: opacity var(--dur-hover) var(--ease-standard);
}

.result-item a:hover::before,
.result-item a:focus-visible::before {
  opacity: 0.8;
}

.result-item strong {
  color: var(--md-on-surface);
  font-family: var(--body);
  font-size: 1.1rem;
  font-weight: 600;
}

.result-item span:last-child {
  color: var(--md-on-surface-variant);
  line-height: 1.65;
}

.result-type {
  width: fit-content;
  color: var(--md-primary);
  font-size: 0.85rem;
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .result-item {
    animation: none;
  }

  button {
    transition: none;
  }

  button:active {
    transform: none;
  }
}

@media (max-width: 40rem) {
  .search-input-row {
    padding-left: 1.1rem;
  }

  .clear-button {
    padding-inline: 0.9rem;
  }
}
</style>
