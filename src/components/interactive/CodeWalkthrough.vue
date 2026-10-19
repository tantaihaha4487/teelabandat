<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { CodeExampleData, CodeTeachingData, EditableCodeValue, HighlightedCodeLine, TraceSnapshot, TraceVariable } from '../../lib/types';
import { claimPlayback, releasePlayback } from './playbackCoordinator';
import { runPythonExample } from '../../lib/pythonRunner';

type TeachingValue = string | number | boolean;
type EditableField = EditableCodeValue;
type Teaching = CodeTeachingData;

const props = defineProps<{
  example: CodeExampleData;
  highlightedLines?: HighlightedCodeLine[];
  teaching?: Teaching;
  trace?: TraceSnapshot[];
}>();
const walkthroughRoot = ref<HTMLElement | null>(null);
const isHydrated = ref(false);
onMounted(() => { isHydrated.value = true; });
const codeBlock = ref<HTMLElement | null>(null);
const codeContent = ref<HTMLElement | null>(null);
const activeStep = ref(0);
const selectedNoteIndex = ref<number | null>(null);
const copyState = ref('');
const isPlaying = ref(false);
const speed = ref(1);
function initialInputs(source?: Teaching) {
  const result: Record<string, string> = {};
  source?.editable?.filter(field => field.kind === 'input').forEach((field, index) => {
    const provided = source.inputs?.[inputIndex(field, index)];
    result[field.id] = provided ?? String(field.initial);
  });
  return result;
}
function inputIndex(field: EditableField, fallback: number) {
  const match = field.target.match(/\[(\d+)\]/);
  return match ? Number(match[1]) : fallback;
}
function initialValues(source?: Teaching) {
  const result: Record<string, TeachingValue> = { ...(source?.values ?? {}) };
  source?.editable?.filter(field => field.kind === 'value').forEach(field => {
    result[field.id] ??= field.initial;
  });
  return result;
}
const inputs = ref<Record<string, string>>(initialInputs(props.teaching));
const values = ref<Record<string, TeachingValue>>(initialValues(props.teaching));
const extraAnswers = ref<Record<number, string>>({});
const followUpAnswer = ref('');
const runtimeTrace = ref<TraceSnapshot[] | null>(null);
const runPhase = ref<'idle' | 'loading' | 'running'>('idle');
const runError = ref('');
let runSequence = 0;
let activeRunController: AbortController | undefined;
let playTimer: ReturnType<typeof setTimeout> | undefined;

const notes = computed(() => props.example.notes ?? []);
const teaching = computed(() => props.teaching);
const trace = computed(() => runtimeTrace.value ?? props.trace ?? teaching.value?.trace ?? []);
const isConsole = computed(() => teaching.value?.mode === 'console' || (!teaching.value && props.example.language === 'bash' && linesCount(props.example.code) <= 2));
const editableFields = computed(() => teaching.value?.editable ?? []);
const hasEditable = computed(() => editableFields.value.length > 0);
const hasPendingEdits = computed(() => Object.keys(extraAnswers.value).length > 0 || editableFields.value.some((field, index) => {
  if (field.kind === 'value') return String(values.value[field.id] ?? teaching.value?.values?.[field.id] ?? field.initial) !== String(teaching.value?.values?.[field.id] ?? field.initial);
  return String(inputs.value[field.id] ?? field.initial) !== String(teaching.value?.inputs?.[inputIndex(field, index)] ?? field.initial);
}));
const hasExecutionTrace = computed(() => trace.value.length > 0);
const snapshots = computed<TraceSnapshot[]>(() => {
  return trace.value.length ? trace.value : notes.value.map((note, index) => ({ line: note.range[0], noteIndex: index, variables: [] }));
});
function snapshotNoteIndex(step: TraceSnapshot) {
  return step.noteIndex ?? notes.value.findIndex(note => step.line >= note.range[0] && step.line <= note.range[1]);
}
const selectedSnapshotIndex = computed(() => selectedNoteIndex.value === null ? activeStep.value : snapshots.value.findIndex(step => snapshotNoteIndex(step) === selectedNoteIndex.value));
const current = computed(() => selectedSnapshotIndex.value >= 0 ? snapshots.value[selectedSnapshotIndex.value] : undefined);
const currentNoteIndex = computed(() => selectedNoteIndex.value ?? current.value?.noteIndex ?? notes.value.findIndex(note => current.value && current.value.line >= note.range[0] && current.value.line <= note.range[1]));
const currentNote = computed(() => notes.value[currentNoteIndex.value] ?? null);
const hasPlaybackSteps = computed(() => snapshots.value.length > 1);
const isShowingUnplayedNote = computed(() => selectedNoteIndex.value !== null && selectedSnapshotIndex.value < 0);
const currentLine = computed(() => current.value?.line ?? currentNote.value?.range[0] ?? 1);
const displayedNote = computed(() => {
  if (isShowingUnplayedNote.value) return currentNote.value?.note ?? '';
  if (hasPendingEdits.value && !runtimeTrace.value) return '';
  if (hasPendingEdits.value && runtimeTrace.value) {
    if (current.value?.needsInput !== undefined) return 'โปรแกรมรอคำตอบจาก input() ใส่คำตอบถัดไปเพื่อทดลองต่อ';
    if (current.value?.event === 'return') return 'ฟังก์ชันส่งค่ากลับแล้ว ดูค่าที่แสดงทางขวา';
    if (current.value?.event === 'exception') return 'ชุดทดลองนี้เกิดข้อผิดพลาด ดูข้อความและค่าตัวแปรที่ขั้นนี้';
    return `บรรทัด ${current.value?.line ?? 1} ของชุดที่ปรับค่าทำงานแล้ว ดูค่าตัวแปรที่เปลี่ยนทางขวา`;
  }
  return currentNote.value?.note ?? '';
});
const hasPrevious = computed(() => activeStep.value > 0);
const hasNext = computed(() => activeStep.value < snapshots.value.length - 1);
const outputText = computed(() => {
  if (isShowingUnplayedNote.value) return '';
  if (hasPendingEdits.value && !runtimeTrace.value) return '';
  if (runtimeTrace.value) return current.value?.stdout ?? '';
  return current.value?.stdout ?? props.example.output ?? teaching.value?.consoleOutput ?? '';
});
const currentVariables = computed(() => isShowingUnplayedNote.value || (hasPendingEdits.value && !runtimeTrace.value) ? [] : current.value?.variables ?? []);
const outputLabel = computed(() => runtimeTrace.value ? 'ผลจากการรันชุดทดลอง' : props.example.output !== undefined || hasExecutionTrace.value ? 'ผลตัวอย่างที่เตรียมไว้' : 'ผลจากชุดตัวอย่าง');
const codeStatus = computed(() => ({ working: 'ตัวอย่าง', broken: 'ตั้งใจให้เกิดข้อผิดพลาด', fragment: 'ชิ้นส่วนโค้ด' })[props.example.status]);
const speeds = [0.25, 0.5, 1, 2];
const displayedCode = computed(() => {
  let code = props.example.code;
  for (const field of editableFields.value.filter(item => item.kind === 'value')) {
    const oldValue = String(field.initial);
    const newValue = String(values.value[field.id] ?? oldValue);
    if (newValue === oldValue) continue;
    // Replace the first matching literal after its assignment target, preserving the surrounding statement.
    const target = field.target ?? field.id;
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const assignment = new RegExp(`(^\\s*${escaped}\\s*=\\s*)([^\\n]+)`, 'm');
    code = code.replace(assignment, (_match, prefix: string, rhs: string) => {
      const [, comment] = splitPythonComment(rhs);
      return `${prefix}${pythonLiteral(newValue, field)}${comment ? ` ${comment}` : ''}`;
    });
  }
  return code;
});
const isEdited = computed(() => displayedCode.value !== props.example.code);
const displayedLines = computed(() => displayedCode.value.replace(/\r\n?/g, '\n').split('\n'));

watch([activeStep, selectedNoteIndex], async () => {
  await nextTick();
  const frame = codeBlock.value;
  const row = frame?.querySelector<HTMLElement>('.code-row--active');
  if (!frame || !row) return;
  const frameTop = frame.scrollTop;
  const frameBottom = frameTop + frame.clientHeight;
  const rowTop = row.getBoundingClientRect().top - frame.getBoundingClientRect().top + frame.scrollTop - frame.clientTop;
  const rowBottom = rowTop + row.offsetHeight;
  if (rowTop < frameTop) frame.scrollTop = rowTop;
  else if (rowBottom > frameBottom) frame.scrollTop = Math.max(0, rowTop - Math.max(0, frame.clientHeight - row.offsetHeight) / 2);
});

function pythonLiteral(value: string, field: EditableField) {
  if (field.type === 'boolean' || typeof field.initial === 'boolean') return value.toLowerCase() === 'true' ? 'True' : 'False';
  if (field.type === 'number' || typeof field.initial === 'number') {
    const number = Number(value);
    return value.trim() !== '' && Number.isFinite(number) ? value.trim() : String(field.initial);
  }
  return JSON.stringify(value);
}
function splitPythonComment(source: string) {
  let quote = '';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) { escaped = false; continue; }
    if (quote && character === '\\') { escaped = true; continue; }
    if (quote) { if (character === quote) quote = ''; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '#') return [source.slice(0, index).trimEnd(), source.slice(index)] as const;
  }
  return [source.trimEnd(), ''] as const;
}
function linesCount(code: string) { return code.trim().split(/\r?\n/).length; }
function highlightedLineAt(index: number) { return props.highlightedLines?.[index]; }
function tokenStyles(token: { content: string; color?: string; fontStyle?: number }) {
  const style: Record<string, string> = {};
  if (token.color) style.color = token.color;
  if (token.fontStyle !== undefined && token.fontStyle >= 0) {
    if (token.fontStyle & 1) style.fontStyle = 'italic';
    if (token.fontStyle & 2) style.fontWeight = '700';
    const decorations = [token.fontStyle & 4 ? 'underline' : '', token.fontStyle & 8 ? 'line-through' : ''].filter(Boolean);
    if (decorations.length) style.textDecoration = decorations.join(' ');
  }
  return style;
}
function lineIsActive(lineNumber: number) {
  if (isConsole.value || !hasExecutionTrace.value || (hasPendingEdits.value && !runtimeTrace.value)) return false;
  if (selectedNoteIndex.value !== null) {
    const note = notes.value[selectedNoteIndex.value];
    return !!note && lineNumber >= note.range[0] && lineNumber <= note.range[1];
  }
  return current.value?.line === lineNumber;
}
function variableLabel(variable: TraceVariable) {
  if (variable.change === 'new') return 'ค่าเริ่มต้น';
  if (variable.change === 'removed') return 'สิ้นสุด';
  if (variable.change === 'changed') return 'เปลี่ยนค่า';
  return 'ค่าปัจจุบัน';
}
function displayScope(scope?: string) { return scope === '<module>' ? 'ระดับโปรแกรม' : scope; }
function formatValue(value: unknown) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === undefined) return 'ไม่มีค่า';
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`;
  if (typeof value === 'object') return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${formatValue(item)}`).join(', ')}}`;
  return String(value);
}
function stopPlayback() {
  isPlaying.value = false;
  if (playTimer) clearTimeout(playTimer);
  playTimer = undefined;
  releasePlayback(stopPlayback);
}
function scheduleNext() {
  if (!isPlaying.value) return;
  playTimer = setTimeout(() => {
    if (activeStep.value >= snapshots.value.length - 1) { stopPlayback(); return; }
    selectedNoteIndex.value = null;
    activeStep.value += 1;
    scheduleNext();
  }, 2500 / speed.value);
}
function play() {
  if (!snapshots.value.length) return;
  if (activeStep.value >= snapshots.value.length - 1) activeStep.value = 0;
  selectedNoteIndex.value = null;
  stopPlayback();
  claimPlayback(stopPlayback);
  isPlaying.value = true;
  scheduleNext();
}
function pause() { stopPlayback(); }
function previousStep() { stopPlayback(); selectedNoteIndex.value = null; if (hasPrevious.value) activeStep.value -= 1; }
function nextStep() { stopPlayback(); selectedNoteIndex.value = null; if (hasNext.value) activeStep.value += 1; }
function restart() { stopPlayback(); selectedNoteIndex.value = null; activeStep.value = 0; }
function setSpeed(value: number) { speed.value = value; if (isPlaying.value) { stopPlayback(); claimPlayback(stopPlayback); isPlaying.value = true; scheduleNext(); } }
function selectNote(index: number) {
  stopPlayback();
  selectedNoteIndex.value = index;
  const found = snapshots.value.findIndex(step => snapshotNoteIndex(step) === index);
  if (found >= 0) activeStep.value = found;
}
function selectCode() {
  if (typeof document === 'undefined' || !codeBlock.value) return;
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(codeContent.value ?? codeBlock.value);
  selection?.removeAllRanges(); selection?.addRange(range);
}
async function copyCode() {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
    await navigator.clipboard.writeText(displayedCode.value);
    copyState.value = 'คัดลอกโค้ดชุดนี้แล้ว';
  } catch { selectCode(); copyState.value = 'เลือกโค้ดไว้แล้ว กด Ctrl+C หรือ Cmd+C เพื่อคัดลอก'; }
}
function requestRun() {
  const edits: Record<string, string> = {};
  for (const field of editableFields.value) {
    edits[field.id] = String(field.kind === 'input' ? inputs.value[field.id] ?? field.initial : values.value[field.id] ?? field.initial);
  }
  runWithEdits(edits);
}
function runWithEdits(edits: Record<string, string>) {
  stopPlayback();
  activeRunController?.abort();
  const requestedInputIndex = current.value?.needsInput;
  const runInputs = [...(teaching.value?.inputs ?? [])];
  for (const [index, answer] of Object.entries(extraAnswers.value)) runInputs[Number(index)] = answer;
  if (requestedInputIndex !== undefined) runInputs[requestedInputIndex] = followUpAnswer.value;
  const runTeaching: CodeTeachingData = { ...teaching.value!, inputs: runInputs };
  const requestId = ++runSequence;
  activeRunController = new AbortController();
  runError.value = '';
  runPhase.value = 'loading';
  runtimeTrace.value = null;
  selectedNoteIndex.value = null;
  activeStep.value = 0;
  runPythonExample({
    example: props.example,
    teaching: runTeaching,
    edits,
    signal: activeRunController.signal,
    onPhase: phase => { if (requestId === runSequence) runPhase.value = phase; },
  }).then(result => {
    if (requestId !== runSequence) return;
    runtimeTrace.value = result;
    const needsAnswer = result.reduce((found, step, index) => step.needsInput !== undefined ? index : found, -1);
    activeStep.value = needsAnswer >= 0 ? needsAnswer : 0;
  }).catch(error => {
    if (requestId !== runSequence) return;
    if (error instanceof Error && error.name === 'AbortError') return;
    runError.value = error instanceof Error ? error.message : 'รันตัวอย่างไม่สำเร็จ ลองอีกครั้งได้ค่ะ';
  }).finally(() => {
    if (requestId === runSequence) { runPhase.value = 'idle'; activeRunController = undefined; }
  });
}
function cancelRun(clearTrace = true) {
  runSequence += 1;
  activeRunController?.abort();
  activeRunController = undefined;
  runPhase.value = 'idle';
  runError.value = '';
  if (clearTrace) runtimeTrace.value = null;
}
function handleEdit() { pause(); cancelRun(); selectedNoteIndex.value = null; activeStep.value = 0; copyState.value = ''; }
function submitFollowUp() {
  const index = current.value?.needsInput;
  if (index === undefined) return;
  extraAnswers.value = { ...extraAnswers.value, [index]: followUpAnswer.value };
  requestRun();
  followUpAnswer.value = '';
}
function resetEdits() {
  stopPlayback();
  cancelRun();
  extraAnswers.value = {};
  followUpAnswer.value = '';
  activeStep.value = 0;
  selectedNoteIndex.value = null;
  inputs.value = initialInputs(teaching.value);
  values.value = initialValues(teaching.value);
}
function activityHandler() { if (document.hidden) pause(); }
let visibilityObserver: IntersectionObserver | undefined;
watch(() => props.teaching, next => { if (next) { inputs.value = initialInputs(next); values.value = initialValues(next); } });
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', activityHandler);
onBeforeUnmount(() => {
  stopPlayback();
  cancelRun();
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', activityHandler);
  visibilityObserver?.disconnect();
});
if (typeof IntersectionObserver !== 'undefined') {
  visibilityObserver = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) pause();
  }, { threshold: 0.05 });
  // The observer is attached after mount through the template ref watcher below.
  watch(walkthroughRoot, element => { if (element) visibilityObserver?.observe(element); }, { immediate: true });
}
</script>

<template>
  <section ref="walkthroughRoot" class="code-walkthrough" :class="{ 'is-console': isConsole }" :aria-labelledby="`code-title-${example.id}`">
    <header class="walkthrough-header">
      <div><p class="eyebrow">{{ example.language }} <span aria-hidden="true">·</span> {{ codeStatus }}</p><h3 :id="`code-title-${example.id}`">{{ example.title ?? 'ลองอ่านโค้ดไปทีละบรรทัด' }}</h3></div>
      <span class="status-badge" :class="`status-badge--${example.status}`">{{ example.status === 'broken' ? 'ตัวอย่างผิดโดยตั้งใจ' : example.status === 'fragment' ? 'โค้ดบางส่วน' : 'ตัวอย่างพร้อมอ่าน' }}</span>
    </header>

    <div v-if="example.error" class="callout callout--error"><strong>จุดสังเกตในโค้ดต้นฉบับ</strong><p>{{ example.error }}</p></div>
    <aside v-if="teaching?.context" class="context-note"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg><p><strong>บริบทตัวอย่าง</strong>{{ teaching.context }}</p></aside>

    <template v-if="isConsole">
      <div class="console-source"><div class="code-toolbar"><span class="language-label">{{ example.language }}<span v-if="isEdited" class="edited-label"> · ชุดทดลองที่ปรับค่า</span></span><button :disabled="!isHydrated" class="copy-button" type="button" @click="copyCode"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>{{ isEdited ? 'คัดลอกชุดทดลอง' : 'คัดลอกโค้ด' }}</button></div>
      <div ref="codeBlock" class="code-frame" tabindex="0" :aria-label="`โค้ดภาษา ${example.language}`"><pre><code ref="codeContent"><span v-for="(line, index) in displayedLines" :key="`${example.id}-line-${index + 1}`" class="code-row" :class="{ 'code-row--active': lineIsActive(index + 1) }"><span class="line-number" aria-hidden="true">{{ index + 1 }}</span><span class="line-text"><template v-if="displayedCode === example.code && highlightedLineAt(index)?.length"><span v-for="(token, tokenIndex) in highlightedLineAt(index)" :key="`${example.id}-${index}-${tokenIndex}`" :style="tokenStyles(token)">{{ token.content }}</span></template><template v-else>{{ line || ' ' }}</template></span></span></code></pre></div></div><p v-if="copyState" class="copy-status" aria-live="polite">{{ copyState }}</p>
      <section v-if="outputText" class="console-output" :aria-labelledby="`output-title-${example.id}`">
        <header class="console-output-heading"><span class="output-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4m-5-12 3 3-3 3m6 0h4"/></svg></span><div><h4 :id="`output-title-${example.id}`">ผลลัพธ์</h4><p>{{ outputLabel }}</p></div></header>
        <pre>{{ outputText }}</pre>
      </section>
      <p v-if="teaching?.summary || notes[0]?.note" class="console-note">{{ teaching?.summary ?? notes[0]?.note }}</p>
    </template>

    <div v-else-if="notes.length" class="execution-workbench">
      <div class="source-pane"><div class="code-toolbar"><span class="language-label">{{ example.language }}<span v-if="isEdited" class="edited-label"> · ชุดทดลองที่ปรับค่า</span></span><button :disabled="!isHydrated" class="copy-button" type="button" @click="copyCode"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>{{ isEdited ? 'คัดลอกชุดทดลอง' : 'คัดลอกโค้ด' }}</button></div>
      <div ref="codeBlock" class="code-frame" tabindex="0" :aria-label="`โค้ดภาษา ${example.language}`"><pre><code ref="codeContent"><span v-for="(line, index) in displayedLines" :key="`${example.id}-line-${index + 1}`" class="code-row" :class="{ 'code-row--active': lineIsActive(index + 1) }"><span class="line-number" aria-hidden="true">{{ index + 1 }}</span><span class="line-text"><template v-if="displayedCode === example.code && highlightedLineAt(index)?.length"><span v-for="(token, tokenIndex) in highlightedLineAt(index)" :key="`${example.id}-${index}-${tokenIndex}`" :style="tokenStyles(token)">{{ token.content }}</span></template><template v-else>{{ line || ' ' }}</template></span></span></code></pre></div><p v-if="copyState" class="copy-status" aria-live="polite">{{ copyState }}</p></div>
      <section class="lesson-panel" aria-label="คำอธิบายการทำงาน">
      <div class="lesson-topline"><div><p class="eyebrow">{{ isShowingUnplayedNote ? 'อ่านคำอธิบาย' : hasPendingEdits && !runtimeTrace ? 'ชุดทดลองใหม่' : hasExecutionTrace ? 'ไล่การทำงาน' : 'อ่านคำอธิบาย' }}</p><h4>{{ isShowingUnplayedNote ? `คำอธิบายบรรทัด ${currentLine}` : hasPendingEdits && !runtimeTrace ? 'ชุดค่านี้ยังไม่ถูกรัน' : current?.needsInput !== undefined ? 'รอคำตอบเพิ่ม' : current?.event === 'return' ? 'ค่าที่ส่งกลับ' : current?.event === 'exception' ? 'เกิดข้อผิดพลาด' : hasExecutionTrace ? `บรรทัด ${currentLine}` : 'คำอธิบายโค้ด' }}</h4></div><span v-if="hasPlaybackSteps && !isShowingUnplayedNote && (!hasPendingEdits || runtimeTrace)" class="step-count">{{ activeStep + 1 }} / {{ snapshots.length }}</span></div>
      <div v-if="!hasPendingEdits || runtimeTrace" class="lesson-grid">
        <div class="active-note" :aria-live="isPlaying ? 'off' : 'polite'"><p>{{ displayedNote || (hasExecutionTrace ? 'ดูค่าที่เปลี่ยนในแต่ละขั้น แล้วลองปรับค่าเริ่มต้นได้เลย' : 'คำอธิบายนี้ใช้ประกอบโค้ดตัวอย่าง โดยยังไม่ได้ไล่การทำงานจริง') }}</p><p v-if="current?.error && current.needsInput === undefined" class="trace-error">{{ current.error }}</p></div>
        <section v-if="currentVariables.length" class="variable-panel" aria-label="ค่าตัวแปรในขั้นนี้"><div class="section-label">ค่าตัวแปร</div><div v-for="(variable, index) in currentVariables" :key="`${variable.scope}-${variable.name}-${index}`" class="variable-row" :class="`variable-row--${variable.change ?? 'steady'}`"><div class="variable-heading"><code>{{ variable.name }}</code><span>{{ variableLabel(variable) }}<template v-if="variable.scope"> · {{ displayScope(variable.scope) }}</template></span></div><code :key="formatValue(variable.change === 'removed' ? 'ไม่มีตัวแปรนี้แล้ว' : variable.value)" class="variable-value value-changed">{{ variable.change === 'removed' ? 'ไม่มีตัวแปรนี้แล้ว' : formatValue(variable.value) }}</code></div></section>
        <section v-if="current?.event === 'return' && current.returnValue !== undefined" class="return-value"><div class="section-label">ค่าที่ฟังก์ชันส่งกลับ</div><code>{{ formatValue(current.returnValue) }}</code></section><section v-if="outputText" class="trace-output"><div class="section-label">{{ outputLabel }}</div><pre>{{ outputText }}</pre></section>
      </div>
      <p v-if="hasPendingEdits && !runtimeTrace" class="pending-run-note">คุณเปลี่ยนค่าแล้ว กด “ลองค่าชุดนี้” เพื่อดูการทำงานและค่าตัวแปรของชุดใหม่นี้</p>
      <div v-if="hasPlaybackSteps && !isShowingUnplayedNote && (!hasPendingEdits || runtimeTrace)" class="player-controls" role="group" aria-label="ควบคุมการไล่โค้ด">
        <button type="button" class="icon-button" :disabled="!isHydrated || (!hasPrevious)" aria-label="ย้อนหนึ่งขั้น" title="ย้อนหนึ่งขั้น" @click="previousStep"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button>
        <button :disabled="!isHydrated" type="button" class="play-button" :aria-label="isPlaying ? 'พักการเล่น' : 'เล่นอัตโนมัติ'" @click="isPlaying ? pause() : play()"><svg v-if="!isPlaying" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg><svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8zM15 5h3v14h-3z"/></svg><span>{{ isPlaying ? 'พัก' : 'เล่น' }}</span></button>
        <button :disabled="!isHydrated" type="button" class="icon-button" aria-label="เริ่มใหม่" title="เริ่มใหม่" @click="restart"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11a8 8 0 1 1 2.3 5.7M4 5v6h6"/></svg></button>
        <button type="button" class="icon-button" :disabled="!isHydrated || (!hasNext)" aria-label="ไปหนึ่งขั้น" title="ไปหนึ่งขั้น" @click="nextStep"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button>
        <label class="speed-control">ความเร็ว<select :disabled="!isHydrated" v-model="speed" @change="setSpeed(Number(($event.target as HTMLSelectElement).value))"><option v-for="rate in speeds" :key="rate" :value="rate">{{ rate === 0.25 ? 'ช้ามาก' : rate === 0.5 ? 'ช้า' : `${rate}×` }}</option></select></label>
      </div>
      <section v-if="current?.needsInput !== undefined" class="follow-up-input"><div><p class="eyebrow">รอคำตอบลำดับที่ {{ current.needsInput + 1 }}</p><h4>{{ current.inputPrompt ?? 'โปรแกรมต้องการข้อมูลเพิ่มเติม' }}</h4></div><label><span class="sr-only">คำตอบที่ {{ current.needsInput + 1 }}</span><input :disabled="!isHydrated" v-model="followUpAnswer" type="text" @input="pause" @keydown.enter.prevent="submitFollowUp"/></label><button class="run-button" type="button" :disabled="!isHydrated || (runPhase !== 'idle')" @click="submitFollowUp">เพิ่มคำตอบแล้วลองใหม่</button></section>
      <details v-if="hasEditable" class="edit-panel"><summary class="edit-summary"><span><span class="eyebrow">ลองเปลี่ยนค่า</span><strong>ทดลองแล้วดูผล</strong></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></summary><div class="edit-content"><div class="edit-heading"><span></span><button :disabled="!isHydrated" class="text-button" type="button" @click="resetEdits">คืนค่าเดิม</button></div><div class="edit-fields"><label v-for="field in editableFields" :key="field.id" class="edit-field"><span>{{ field.label }}</span><input :disabled="!isHydrated" v-if="field.kind === 'input'" v-model="inputs[field.id]" :type="field.type === 'number' ? 'number' : 'text'" :placeholder="String(field.initial)" @input="handleEdit"/><input :disabled="!isHydrated" v-else-if="field.type === 'boolean'" v-model="values[field.id]" type="checkbox" @change="handleEdit"/><input :disabled="!isHydrated" v-else v-model="values[field.id]" :type="field.type === 'number' ? 'number' : 'text'" :placeholder="String(field.initial)" @input="handleEdit"/><small>{{ field.kind === 'input' ? 'คำตอบที่โปรแกรมจะอ่าน' : field.type === 'boolean' ? `ค่าเริ่มต้น ${values[field.id] ? 'True' : 'False'}` : `ค่าเริ่มต้นของ ${field.target}` }}</small></label></div><p v-if="runPhase !== 'idle'" class="run-status" role="status">{{ runPhase === 'loading' ? 'กำลังโหลด Python…' : 'กำลังไล่การทำงาน…' }}</p><p v-if="runError" class="run-error" role="alert">{{ runError }}</p><button class="run-button" type="button" :disabled="!isHydrated || (runPhase !== 'idle')" @click="requestRun"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>{{ runPhase === 'loading' ? 'กำลังโหลด…' : runPhase === 'running' ? 'กำลังรัน…' : 'ลองค่าชุดนี้' }}</button></div></details>
      <details v-if="notes.length > 1" class="all-notes"><summary><span>{{ hasPendingEdits ? 'ดูคำอธิบายโค้ดต้นฉบับ' : 'ดูคำอธิบายทุกบรรทัด' }}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></summary><ol><li v-for="(note, index) in notes" :key="`${example.id}-note-${index}`" :class="{ 'is-current': currentNoteIndex === index }"><button :disabled="!isHydrated" type="button" @click="selectNote(index)"><span>บรรทัด {{ note.range[0] }}<template v-if="note.range[1] !== note.range[0]">–{{ note.range[1] }}</template></span><span>{{ note.note }}</span></button></li></ol></details>
      <details v-if="example.output" class="reference-output"><summary><span>ผลลัพธ์ที่ระบุในบทเรียน</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></summary><pre>{{ example.output }}</pre></details>
      </section>
    </div>
  </section>
</template>

<style scoped>
.code-walkthrough{--p:var(--primary,#6741a5);--box:var(--container,#efe4f2);--line:var(--outline,#d8cedd);--ok:var(--correct,#346044);--bad:var(--error,#9d342d);color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:var(--shape-xl,28px);background:var(--md-surface-container-low,var(--paper));overflow:hidden;container-type:inline-size}
.walkthrough-header,.code-toolbar,.lesson-topline,.edit-heading,.player-controls{display:flex;align-items:center;justify-content:space-between;gap:.8rem}.walkthrough-header{padding:1rem 1.15rem .75rem}.walkthrough-header h3,.lesson-topline h4,.edit-heading h4{margin:0;font-family:var(--body,'IBM Plex Sans Thai',sans-serif);font-weight:600;line-height:1.35}.walkthrough-header h3{font-size:1.08rem}.eyebrow{margin:0 0 .25rem;color:var(--muted);font-size:.73rem;font-weight:600}.status-badge,.step-count{flex:none;border-radius:999px;padding:.28rem .55rem;font-size:.73rem;font-weight:600;line-height:1.3}.status-badge--working{color:var(--md-on-success-container,var(--ok));background:var(--success-container)}.status-badge--broken{color:var(--md-on-error-container,var(--bad));background:var(--error-container)}.status-badge--fragment,.step-count{color:var(--md-on-primary-container,var(--p));background:var(--box)}
.code-toolbar{padding:.45rem 1.1rem;color:var(--muted);background:var(--box);border-block:1px solid var(--line)}.language-label,.code-frame,.console-output pre,.trace-output pre,.variable-value{font-family:var(--font-code,'JetBrains Mono',monospace)}.language-label{font-size:.76rem}.edited-label{color:var(--warning)}button,select,input{font:inherit}button{color:var(--p);background:transparent;border:1px solid var(--line);border-radius:var(--shape-full,999px);font-size:.82rem;font-weight:600;cursor:pointer;transition:transform var(--dur-click,400ms) var(--ease-expressive-spatial,ease)}button:hover:not(:disabled){background:color-mix(in srgb,var(--p) 9%,transparent)}button:active:not(:disabled){transform:scale(.95);transition-duration:var(--dur-fast,200ms)}button:focus-visible,select:focus-visible,input:focus-visible,.code-frame:focus-visible,summary:focus-visible{outline:3px solid color-mix(in srgb,var(--p) 40%,transparent);outline-offset:2px}button:disabled{opacity:.42;cursor:not-allowed}.all-notes button:disabled{opacity:1;cursor:default}.copy-button,.play-button,.run-button{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;padding:.48rem .7rem}.copy-button svg,.player-controls svg,.run-button svg{width:1rem;height:1rem;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.play-button svg,.run-button svg{fill:currentColor;stroke:none}
.code-frame{overflow:auto;padding:.9rem 0;background:var(--code-bg);color:var(--code-ink);font-size:.82rem;line-height:1.7;scrollbar-color:var(--code-muted) var(--code-bg)}.code-frame pre{min-width:max-content;margin:0}.code-row{display:grid;grid-template-columns:2.8rem minmax(0,1fr);min-width:100%;padding-inline-end:1rem;border-inline-start:3px solid transparent}.code-row--active{background:var(--code-active);border-inline-start-color:var(--code-accent)}.line-number{padding-inline:.7rem;color:var(--code-muted);text-align:end;user-select:none}.line-text{padding-inline-start:.45rem;white-space:pre}.copy-status{margin:0;padding:.45rem 1.1rem;color:var(--muted);font-size:.8rem;animation:fade-up 200ms ease both}.callout{margin:.8rem 1.1rem 0;padding:.75rem 1rem;border-radius:var(--shape-lg,16px);color:var(--md-on-error-container,var(--bad));background:var(--error-container)}.callout p{margin:.3rem 0 0}
.is-console .walkthrough-header{padding-block:1rem}.console-source{margin:0 1rem;overflow:hidden;border:1px solid var(--line);border-radius:var(--shape-lg,16px)}.console-source .code-toolbar{border:0;border-block-end:1px solid var(--line)}.console-output{margin:1.2rem 1rem 0;padding-block-start:1rem;border-block-start:1px solid var(--line)}.console-output-heading{display:flex;align-items:center;gap:.65rem;margin-block-end:.75rem}.output-icon{display:grid;place-items:center;flex:none;width:2.25rem;height:2.25rem;color:var(--p);background:var(--box);border-radius:var(--shape-md,12px)}.output-icon svg{width:1.15rem;height:1.15rem;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.console-output-heading h4{margin:0;color:var(--ink);font-family:var(--body,'IBM Plex Sans Thai',sans-serif);font-size:.95rem;font-weight:600;line-height:1.5}.console-output-heading p{margin:.1rem 0 0;color:var(--muted);font-size:.72rem;line-height:1.5}.console-output pre,.trace-output pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.82rem;line-height:1.8}.console-output pre{padding:1rem 1.1rem;color:var(--ink);background:var(--surface-lowest);border:1px solid var(--line);border-radius:var(--shape-lg,16px)}.console-note{margin:0;padding:.8rem 1rem 1.1rem;color:var(--muted);font-size:.85rem;line-height:1.7}
.execution-workbench{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(16rem,1fr);gap:.8rem 1rem;align-items:start;padding:.8rem 1rem 1rem}.source-pane{min-width:0;grid-column:1;grid-row:1 / span 2;overflow:hidden;border-radius:var(--shape-lg,16px)}.source-pane .code-toolbar{padding-inline:.8rem}.source-pane .code-frame{max-height:32rem}.lesson-panel{display:contents}.lesson-topline{grid-column:2;grid-row:1;margin:.1rem 0}.lesson-topline h4,.edit-heading h4{font-size:.98rem}.player-controls{grid-column:1/-1;grid-row:3;justify-content:flex-start;flex-wrap:wrap;margin:0;padding:.55rem;background:var(--surface-lowest);border:1px solid var(--line);border-radius:var(--shape-xl,28px)}.icon-button{display:grid;place-items:center;width:2.55rem;height:2.55rem}.play-button{min-width:6.3rem;height:2.55rem;color:var(--on-primary);background:var(--p);border-color:var(--p)}.play-button:hover:not(:disabled){background:color-mix(in srgb,var(--p) 88%,var(--ink))}.speed-control{display:flex;align-items:center;gap:.4rem;margin-inline-start:auto;color:var(--muted);font-size:.75rem}.speed-control select{min-height:2.4rem;padding:.25rem .45rem;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:var(--shape-md,12px)}.lesson-grid{grid-column:2;grid-row:2;display:grid;grid-template-columns:1fr;gap:.55rem;align-items:start;min-width:0}.active-note,.variable-panel,.trace-output{min-width:0;align-self:start;padding:.78rem .85rem;background:var(--box);border-radius:var(--shape-lg,16px);animation:fade-up 280ms cubic-bezier(.2,.8,.2,1) both}.active-note{color:var(--md-on-primary-container,var(--ink))}.active-note p{margin:0;line-height:1.6}.active-note .trace-error{margin-top:.55rem;color:var(--bad)}.variable-panel,.trace-output{background:var(--surface-lowest);border:1px solid var(--line)}.section-label{margin-bottom:.45rem;color:var(--muted);font-size:.73rem;font-weight:600}.variable-row{padding:.4rem 0;border-block-start:1px solid color-mix(in srgb,var(--line) 75%,transparent);animation:value-in 240ms ease both}.variable-heading{display:flex;align-items:center;justify-content:space-between;gap:.5rem}.variable-heading code{font-weight:700}.variable-heading span{color:var(--muted);font-size:.68rem}.variable-value{display:block;max-width:100%;margin-top:.2rem;overflow-wrap:anywhere;color:var(--p);font-size:.78rem}.variable-row--new .variable-value{color:var(--ok)}.variable-row--changed .variable-value{color:var(--warning)}.variable-row--removed .variable-value{color:var(--bad)}.trace-output{grid-column:auto}.trace-output pre{color:var(--ink)}.pending-run-note{grid-column:2;grid-row:2;margin:0;padding:.75rem .85rem;color:var(--muted);background:var(--box);border-radius:var(--shape-lg,16px);font-size:.82rem;line-height:1.55}
.edit-panel{grid-column:1/-1;margin:0;padding:.65rem .8rem;background:var(--surface-lowest);border:1px solid var(--line);border-radius:var(--shape-lg,16px)}.edit-panel summary,.all-notes summary,.reference-output summary{display:flex;align-items:center;justify-content:space-between;gap:.5rem;cursor:pointer;list-style:none}.edit-panel summary::-webkit-details-marker,.all-notes summary::-webkit-details-marker,.reference-output summary::-webkit-details-marker{display:none}.edit-summary>span{display:grid;gap:.1rem}.edit-summary strong{font-size:.88rem}.edit-panel summary svg,.all-notes summary svg,.reference-output summary svg{width:1.1rem;height:1.1rem;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;transition:transform 180ms ease}.edit-panel[open] summary svg,.all-notes[open] summary svg,.reference-output[open] summary svg{transform:rotate(180deg)}.edit-content{padding-top:.65rem}.edit-heading{margin-bottom:.35rem}.text-button{border:0;padding:.25rem .35rem}.edit-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.6rem}.edit-field{display:grid;gap:.25rem;font-size:.79rem;font-weight:600}.edit-field input{width:100%;min-height:2.6rem;box-sizing:border-box;padding:.45rem .6rem;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:var(--shape-md,12px)}.edit-field small{color:var(--muted);font-size:.68rem;font-weight:400}.run-status{margin:.65rem 0 0;color:var(--muted);font-size:.8rem}.run-error{margin:.65rem 0 0;padding:.55rem .7rem;color:var(--bad);background:var(--error-container);border-radius:var(--shape-md,12px);font-size:.8rem}.run-button{margin-top:.7rem;color:var(--on-primary);background:var(--p);border-color:var(--p)}.run-button:hover:not(:disabled){background:color-mix(in srgb,var(--p) 88%,var(--ink))}
.all-notes{grid-column:1/-1;margin:0;border-block-start:1px solid var(--line)}.all-notes summary,.reference-output summary{padding:.65rem 0;color:var(--p);font-size:.83rem;font-weight:600;cursor:pointer}.all-notes ol{display:grid;gap:.3rem;margin:0;padding:0;list-style:none}.all-notes li{border-radius:var(--shape-md,12px)}.all-notes li.is-current{background:var(--box)}.all-notes li button{display:grid;width:100%;gap:.2rem;padding:.55rem .75rem;text-align:start;border:0;border-radius:var(--shape-md,12px)}.all-notes li button span:first-child{font-size:.7rem;color:var(--p)}.all-notes li button span+span{font-size:.78rem;color:var(--muted);font-weight:400}.reference-output{grid-column:1/-1;margin:0;border-block-start:1px solid var(--line)}.reference-output pre{margin:.15rem 0 0;padding:.7rem .8rem;color:var(--ink);background:var(--box);border-radius:var(--shape-md,12px);font-family:var(--font-code,'JetBrains Mono',monospace);font-size:.78rem;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}
@keyframes line-focus{from{opacity:.65;transform:translateX(-3px)}to{opacity:1;transform:none}}@keyframes fade-up{from{opacity:.45;transform:translateY(5px)}to{opacity:1;transform:none}}@keyframes value-in{from{opacity:.45;transform:translateY(4px) scale(.99)}to{opacity:1;transform:none}}
.value-changed{animation:value-change 180ms ease both}@keyframes value-change{from{opacity:.55;transform:translateY(2px)}to{opacity:1;transform:none}}
button{min-height:2.75rem}.icon-button{width:2.75rem;height:2.75rem}.play-button{height:2.75rem}.speed-control select{min-height:2.75rem}.edit-field input{min-height:2.75rem}
@container (max-width: 38rem){.walkthrough-header{align-items:flex-start;flex-direction:column}.status-badge{white-space:normal}.execution-workbench{grid-template-columns:minmax(0,1fr);gap:.7rem;padding:.7rem}.source-pane,.lesson-topline,.lesson-grid,.pending-run-note,.player-controls,.edit-panel,.all-notes{grid-column:1;grid-row:auto}.lesson-grid{grid-template-columns:1fr}.trace-output{grid-column:auto}.speed-control{margin-inline-start:auto}}
.context-note{display:flex;align-items:flex-start;gap:.55rem;margin:.75rem 1.1rem 0;padding:.6rem .75rem;color:var(--muted);background:var(--surface-lowest);border:1px solid var(--line);border-radius:var(--shape-md,12px);font-size:.78rem;line-height:1.5}.context-note svg{flex:none;width:1rem;height:1rem;margin-top:.12rem;fill:none;stroke:var(--p);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.context-note p{margin:0}.context-note strong{margin-inline-end:.35rem;color:var(--ink)}.return-value{padding:.7rem .85rem;background:var(--surface-lowest);border:1px solid var(--line);border-radius:var(--shape-lg,16px);animation:fade-up 280ms cubic-bezier(.2,.8,.2,1) both}.return-value code{color:var(--p);font-family:var(--font-code,'JetBrains Mono',monospace);font-size:.8rem}.follow-up-input{grid-column:1/-1;min-width:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(10rem,.75fr) auto;align-items:end;gap:.65rem;margin-top:.75rem;padding:.8rem .85rem;background:var(--surface-lowest);border:1px solid var(--line);border-radius:var(--shape-lg,16px)}.follow-up-input h4{margin:0;font-size:.9rem;font-weight:600}.follow-up-input input{width:100%;min-height:2.75rem;box-sizing:border-box;padding:.45rem .6rem;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:var(--shape-md,12px)}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.edit-field input[type=checkbox]{width:2.75rem;height:2.75rem;min-height:2.75rem;margin:0;accent-color:var(--p);cursor:pointer}
@media (prefers-reduced-motion:reduce){.code-row--active,.active-note,.variable-row,.trace-output,.return-value,.copy-status,.value-changed{animation:none!important}.edit-panel summary svg,.all-notes summary svg,.reference-output summary svg{transition:none!important}button{transition:none!important}button:hover:not(:disabled),button:active:not(:disabled){transform:none!important}}
@container (max-width: 38rem){.follow-up-input{grid-template-columns:1fr}.follow-up-input .run-button{justify-self:start}}
</style>
