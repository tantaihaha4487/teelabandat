<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import type { HighlightedCodeLine, QuizBank, QuizQuestion } from '../../lib/types';
import { displayCode } from '../../lib/code';

const props = defineProps<{
  bank: QuizBank;
  highlightedCode?: Record<number, HighlightedCodeLine[]>;
}>();

const selectedTopic = ref('all');
const pendingTopic = ref<string | null>(null);
const dialogAction = ref<'reset' | 'topic'>('reset');
const currentIndex = ref(0);
const answers = reactive<Record<string, number | null>>({});
const submitted = reactive<Record<string, boolean>>({});
const resetDialog = ref<HTMLDialogElement | null>(null);
const topicSelect = ref<HTMLSelectElement | null>(null);
const lastDialogTrigger = ref<HTMLElement | null>(null);
const quizId = computed(() => `quiz-${props.bank.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`);
const optionLetters = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ', 'ช', 'ซ', 'ฌ', 'ญ'];

const filteredQuestions = computed(() => {
  if (selectedTopic.value === 'all') return props.bank.questions;

  const topic = props.bank.topics.find((item) => item.id === selectedTopic.value);
  return props.bank.questions.filter((question) => question.topic === selectedTopic.value || question.topic === topic?.title);
});

const currentQuestion = computed<QuizQuestion | null>(() => filteredQuestions.value[currentIndex.value] ?? null);
const currentKey = computed(() => (currentQuestion.value ? questionKey(currentQuestion.value) : ''));
const currentAnswer = computed(() => (currentKey.value ? answers[currentKey.value] ?? null : null));
const currentSubmitted = computed(() => (currentKey.value ? submitted[currentKey.value] === true : false));
const currentCorrect = computed(() => Boolean(currentQuestion.value && currentAnswer.value === currentQuestion.value.correctIndex));
const currentCodeLines = computed(() => {
  if (!currentQuestion.value) return [];
  return displayCode(currentQuestion.value.code).replace(/\r\n?/g, '\n').split('\n');
});
const currentHighlightedLines = computed(() => {
  const sourceId = currentQuestion.value?.sourceId;
  return sourceId === undefined ? undefined : props.highlightedCode?.[sourceId];
});

const checkedCount = computed(() => filteredQuestions.value.filter((question) => submitted[questionKey(question)] === true).length);
const score = computed(() => filteredQuestions.value.reduce((total, question) => {
  const key = questionKey(question);
  return total + (submitted[key] && answers[key] === question.correctIndex ? 1 : 0);
}, 0));
const hasAnswers = computed(() => props.bank.questions.some((question) => {
  const key = questionKey(question);
  return answers[key] !== null && answers[key] !== undefined || submitted[key] === true;
}));
const topicComplete = computed(() => filteredQuestions.value.length > 0 && filteredQuestions.value.every((question) => submitted[questionKey(question)] === true));

function highlightedLineAt(index: number) {
  return currentHighlightedLines.value?.[index];
}

function tokenStyles(token: { content: string; color?: string; fontStyle?: number }) {
  const style: Record<string, string> = {};

  if (token.color) style.color = token.color;

  // TextMate's fontStyle uses a bit mask: italic, bold, underline, strike-through.
  // A value of -1 means that the tokenizer did not set a style.
  if (token.fontStyle !== undefined && token.fontStyle >= 0) {
    if (token.fontStyle & 1) style.fontStyle = 'italic';
    if (token.fontStyle & 2) style.fontWeight = '700';
    const decorations = [
      token.fontStyle & 4 ? 'underline' : '',
      token.fontStyle & 8 ? 'line-through' : '',
    ].filter(Boolean);
    if (decorations.length) style.textDecoration = decorations.join(' ');
  }

  return style;
}

function topicTitle(topic: string) {
  return props.bank.topics.find((item) => item.id === topic || item.title === topic)?.title ?? topic;
}

function topicIdForQuestion(question: QuizQuestion) {
  return props.bank.topics.find((topic) => topic.id === question.topic || topic.title === question.topic)?.id;
}

watch(filteredQuestions, (questions) => {
  currentIndex.value = Math.min(currentIndex.value, Math.max(questions.length - 1, 0));
});

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  const requestedTopic = params.get('topic');
  const requestedQuestion = params.get('question') ?? params.get('questionId');
  const validTopic = requestedTopic && props.bank.topics.some((topic) => topic.id === requestedTopic) ? requestedTopic : 'all';
  const questionNumber = requestedQuestion && /^\d+$/.test(requestedQuestion) ? Number(requestedQuestion) : null;
  const requestedQuestionData = questionNumber === null ? null : props.bank.questions.find((question) => question.sourceId === questionNumber);

  selectedTopic.value = validTopic;

  if (requestedQuestionData) {
    const questionTopic = topicIdForQuestion(requestedQuestionData);
    if (validTopic !== 'all' && questionTopic && validTopic !== questionTopic) {
      selectedTopic.value = questionTopic;
    }

    await nextTick();
    const questionIndex = filteredQuestions.value.findIndex((question) => question.sourceId === requestedQuestionData.sourceId);
    if (questionIndex >= 0) currentIndex.value = questionIndex;
  }
});

function questionKey(question: QuizQuestion) {
  return `${props.bank.id}:${question.sourceId}`;
}

function optionId(question: QuizQuestion, index: number) {
  return `${quizId.value}-q${question.sourceId}-option${index}`;
}

function optionLabel(index: number) {
  return optionLetters[index] ?? `${index + 1}`;
}

function questionIsAnswered(question: QuizQuestion) {
  const key = questionKey(question);
  return answers[key] !== null && answers[key] !== undefined;
}

function questionIsChecked(question: QuizQuestion) {
  return submitted[questionKey(question)] === true;
}

function goToQuestion(index: number) {
  if (index < 0 || index >= filteredQuestions.value.length) return;
  currentIndex.value = index;
}

function previousQuestion() {
  goToQuestion(currentIndex.value - 1);
}

function nextQuestion() {
  goToQuestion(currentIndex.value + 1);
}

function applyTopic(topic: string) {
  selectedTopic.value = topic;
  currentIndex.value = 0;
}

function requestTopicChange(event: Event) {
  const select = event.currentTarget as HTMLSelectElement;
  const nextTopic = select.value;
  if (nextTopic === selectedTopic.value || (nextTopic !== 'all' && !props.bank.topics.some((topic) => topic.id === nextTopic))) return;

  select.value = selectedTopic.value;
  pendingTopic.value = nextTopic;

  if (!hasAnswers.value) {
    applyTopic(nextTopic);
    pendingTopic.value = null;
    return;
  }

  dialogAction.value = 'topic';
  lastDialogTrigger.value = select;
  resetDialog.value?.showModal();
}

function selectAnswer(index: number) {
  if (!currentQuestion.value || currentSubmitted.value) return;
  answers[currentKey.value] = index;
}

function checkAnswer() {
  if (!currentQuestion.value || currentSubmitted.value || currentAnswer.value === null) return;
  submitted[currentKey.value] = true;
}

function resetAll() {
  for (const question of props.bank.questions) {
    const key = questionKey(question);
    delete answers[key];
    delete submitted[key];
  }
  currentIndex.value = 0;
}

function requestReset(event: MouseEvent) {
  lastDialogTrigger.value = event.currentTarget as HTMLButtonElement;

  if (!hasAnswers.value) {
    resetAll();
    return;
  }

  dialogAction.value = 'reset';
  resetDialog.value?.showModal();
}

function confirmDialogAction() {
  resetAll();
  if (dialogAction.value === 'topic' && pendingTopic.value) applyTopic(pendingTopic.value);
  pendingTopic.value = null;
  resetDialog.value?.close('confirm');
}

function closeResetDialog() {
  resetDialog.value?.close('cancel');
}

function restoreResetFocus() {
  pendingTopic.value = null;
  nextTick(() => lastDialogTrigger.value?.focus());
}
</script>

<template>
  <section class="quiz-runner" :aria-labelledby="`${quizId}-title`">
    <header class="quiz-header">
      <div>
        <p class="eyebrow">แบบฝึกหัด{{ bank.title ? ` · ${bank.title}` : '' }}</p>
        <h2 :id="`${quizId}-title`">ลองตอบ แล้วค่อยดูเหตุผล</h2>
      </div>
      <button v-if="hasAnswers" class="reset-button" type="button" @click="requestReset">เริ่มใหม่</button>
    </header>

    <noscript>
      <p class="no-script-note">แบบฝึกหัดนี้ต้องเปิด JavaScript เพื่อเลือกตรวจคำตอบและดูเหตุผล หลังจากเปิดแล้ว คำตอบจะอยู่เฉพาะในหน้านี้และไม่ถูกบันทึกไว้</p>
    </noscript>

    <div class="quiz-toolbar">
      <label class="topic-filter" :for="`${quizId}-topic`">
        <span>เลือกหัวข้อ</span>
        <select ref="topicSelect" :id="`${quizId}-topic`" :value="selectedTopic" @change="requestTopicChange">
          <option value="all">ทุกหัวข้อ</option>
          <option v-for="topic in bank.topics" :key="topic.id" :value="topic.id">{{ topic.title }}</option>
        </select>
      </label>

      <p class="progress-summary" aria-live="polite">
        ตรวจแล้ว {{ checkedCount }} / {{ filteredQuestions.length }} ข้อ · ได้ {{ score }} คะแนน
      </p>
    </div>

    <details class="question-navigation">
      <summary class="navigation-label">เลือกข้อจากรายการ ({{ filteredQuestions.length }} ข้อ)</summary>
      <nav :aria-label="`เลือกข้อใน ${bank.title}`">
      <ol>
        <li v-for="(question, index) in filteredQuestions" :key="questionKey(question)">
          <button
            type="button"
            :class="{ 'is-current': index === currentIndex, 'is-answered': questionIsAnswered(question), 'is-checked': questionIsChecked(question) }"
            :aria-current="index === currentIndex ? 'step' : undefined"
            :aria-label="`ข้อ ${question.sourceId}${questionIsChecked(question) ? ' ตรวจแล้ว' : questionIsAnswered(question) ? ' เลือกคำตอบแล้ว' : ''}`"
            @click="goToQuestion(index)"
          >
            {{ question.sourceId }}
          </button>
        </li>
      </ol>
      </nav>
    </details>

    <div v-if="currentQuestion" class="question-area">
      <div class="question-meta">
        <span>ข้อ {{ currentQuestion.sourceId }} · ลำดับ {{ currentIndex + 1 }} / {{ filteredQuestions.length }}</span>
        <span>{{ topicTitle(currentQuestion.topic) }}</span>
      </div>

      <fieldset class="answer-group" :aria-describedby="currentSubmitted ? `${quizId}-feedback` : undefined">
        <legend>{{ currentQuestion.prompt }}</legend>
        <p v-if="currentQuestion.context" class="question-context">{{ currentQuestion.context }}</p>
        <pre v-if="currentQuestion.code" class="question-code"><code><span
          v-for="(line, index) in currentCodeLines"
          :key="`${currentQuestion.sourceId}-code-line-${index + 1}`"
          class="question-code-line"
        ><template v-if="highlightedLineAt(index)?.length"><span
            v-for="(token, tokenIndex) in highlightedLineAt(index)"
            :key="`${currentQuestion.sourceId}-code-line-${index + 1}-token-${tokenIndex}`"
            :style="tokenStyles(token)"
          >{{ token.content }}</span></template><template v-else>{{ line || ' ' }}</template></span></code></pre>

        <label
          v-for="(option, index) in currentQuestion.options"
          :key="optionId(currentQuestion, index)"
          class="answer-option"
          :class="{ 'is-selected': currentAnswer === index, 'is-correct': currentSubmitted && index === currentQuestion.correctIndex, 'is-wrong': currentSubmitted && currentAnswer === index && index !== currentQuestion.correctIndex }"
          :for="optionId(currentQuestion, index)"
        >
          <input
            :id="optionId(currentQuestion, index)"
            :name="`${quizId}-${currentQuestion.sourceId}`"
            type="radio"
            :value="index"
            :checked="currentAnswer === index"
            :disabled="currentSubmitted"
            @change="selectAnswer(index)"
          />
          <span class="option-letter" aria-hidden="true">{{ optionLabel(index) }}</span>
          <span class="option-text">{{ displayCode(option) }}</span>
        </label>
      </fieldset>

      <details :key="currentQuestion.sourceId" class="hint-details">
        <summary>ดูคำใบ้</summary>
        <p>{{ currentQuestion.hint }}</p>
      </details>

      <div class="question-actions">
        <button class="action-button action-button--primary" type="button" :disabled="currentAnswer === null || currentSubmitted" @click="checkAnswer">
          {{ currentSubmitted ? 'ตรวจแล้ว' : 'ตรวจคำตอบ' }}
        </button>
        <div class="step-actions" role="group" aria-label="เปลี่ยนข้อ">
          <button class="action-button" type="button" :disabled="currentIndex === 0" @click="previousQuestion">ข้อก่อนหน้า</button>
          <button class="action-button" type="button" :disabled="currentIndex >= filteredQuestions.length - 1" @click="nextQuestion">ข้อถัดไป</button>
        </div>
      </div>

      <div v-if="topicComplete" class="completion-summary" role="status" aria-live="polite">
        <picture class="feedback-mascot" aria-hidden="true"><source srcset="/mascot/anim/sparkling.webp" media="(prefers-reduced-motion: no-preference)"/><img src="/mascot/sparkling.webp" alt="" width="384" height="384" decoding="async"/></picture>
        <strong>ทำหัวข้อนี้ครบแล้ว</strong>
        <p>ตรวจคำตอบครบ {{ filteredQuestions.length }} ข้อ ได้ {{ score }} คะแนน</p>
      </div>

      <div v-if="currentSubmitted" :id="`${quizId}-feedback`" class="feedback" :class="currentCorrect ? 'feedback--correct' : 'feedback--error'" role="status" aria-live="polite">
        <picture :key="currentCorrect ? 'blep' : 'cry'" class="feedback-mascot" aria-hidden="true"><source :srcset="`/mascot/anim/${currentCorrect ? 'blep' : 'cry'}.webp`" media="(prefers-reduced-motion: no-preference)"/><img :src="`/mascot/${currentCorrect ? 'blep' : 'cry'}.webp`" alt="" width="384" height="384" decoding="async"/></picture>
        <strong>{{ currentCorrect ? 'ถูกต้อง' : 'ยังไม่ถูก' }}</strong>
        <p v-if="!currentCorrect">คำตอบที่ถูกคือ {{ optionLabel(currentQuestion.correctIndex) }}: {{ currentQuestion.options[currentQuestion.correctIndex] }}</p>
        <ol v-if="currentQuestion.reasoningSteps.length">
          <li v-for="step in currentQuestion.reasoningSteps" :key="step">{{ step }}</li>
        </ol>
      </div>
    </div>

    <p v-else class="empty-state">ยังไม่มีโจทย์ในหัวข้อนี้</p>

    <dialog ref="resetDialog" class="reset-dialog" :aria-labelledby="`${quizId}-reset-title`" @close="restoreResetFocus">
      <form method="dialog">
        <h3 :id="`${quizId}-reset-title`">{{ dialogAction === 'topic' ? 'เปลี่ยนหัวข้อหรือไม่' : 'เริ่มแบบฝึกหัดใหม่หรือไม่' }}</h3>
        <p>{{ dialogAction === 'topic' ? 'คำตอบที่เลือกและคะแนนจะถูกล้างออก แล้วเปิดหัวข้อที่เลือก' : 'คำตอบที่เลือกและคะแนนบนหน้านี้จะถูกล้างออก แล้วเริ่มจากข้อแรก' }}</p>
        <div class="dialog-actions">
          <button type="button" @click="closeResetDialog">ยกเลิก</button>
          <button class="action-button--primary" type="button" @click="confirmDialogAction">{{ dialogAction === 'topic' ? 'ล้างคำตอบและเปลี่ยนหัวข้อ' : 'ล้างคำตอบ' }}</button>
        </div>
      </form>
    </dialog>
  </section>
</template>

<style scoped>
.quiz-runner {
  color: var(--md-on-surface);
  background: var(--md-surface-container-low);
  border-radius: var(--shape-2xl);
  overflow: hidden;
}

.quiz-header,
.quiz-toolbar,
.question-actions,
.step-actions,
.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.quiz-header {
  align-items: flex-start;
  padding: 1.75rem 1.75rem 1rem;
}

.eyebrow,
.navigation-label {
  margin: 0 0 0.25rem;
  color: var(--md-on-surface-variant);
  font-size: 0.85rem;
  font-weight: 600;
}

h2,
h3,
legend {
  font-family: var(--body);
  font-weight: 700;
}

h2,
h3 {
  margin: 0;
}

h2 {
  font-size: clamp(1.5rem, 2.4vw, 2rem);
  line-height: 1.35;
}

button,
select {
  position: relative;
  min-height: 3rem;
  color: var(--md-primary);
  background: transparent;
  border: 1px solid var(--md-outline-variant);
  border-radius: var(--shape-full);
  font: inherit;
  font-size: 0.95rem;
  font-weight: 600;
}

button {
  padding: 0.55rem 1.25rem;
  cursor: pointer;
  transition: transform var(--dur-click) var(--ease-expressive-spatial);
}

button:active:not(:disabled) {
  transform: scale(0.95);
  transition-duration: var(--dur-fast);
  transition-timing-function: var(--ease-effects);
}

select {
  width: 100%;
  padding: 0.5rem 2.5rem 0.5rem 1.1rem;
  color: var(--md-on-surface);
  background: var(--md-surface-container-lowest);
  border-radius: var(--shape-md);
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--md-primary) 8%, transparent);
}

button:focus-visible,
select:focus-visible,
input:focus-visible,
summary:focus-visible {
  outline: 3px solid var(--md-primary);
  outline-offset: 2px;
}

button:disabled {
  color: var(--md-on-surface-variant);
  opacity: 0.45;
  cursor: not-allowed;
}

.reset-button {
  flex: none;
}

.no-script-note {
  margin: 0;
  padding: 0.8rem 1.75rem;
  color: var(--md-on-surface-variant);
  background: var(--md-surface-container);
}

.quiz-toolbar {
  align-items: flex-end;
  margin: 0 1rem;
  padding: 1rem 1.25rem;
  background: var(--md-surface-container-high);
  border-radius: var(--shape-xl);
}

.topic-filter {
  display: grid;
  gap: 0.35rem;
  min-width: min(17rem, 100%);
  color: var(--md-on-surface-variant);
  font-size: 0.9rem;
  font-weight: 600;
}

.progress-summary {
  margin: 0;
  padding: 0.35rem 0.9rem;
  color: var(--md-on-secondary-container);
  background: var(--md-secondary-container);
  border-radius: var(--shape-full);
  font-size: 0.92rem;
  font-weight: 600;
}

.question-navigation {
  margin: 0.75rem 1rem 0;
  padding: 0 1.25rem;
  border-radius: var(--shape-xl);
}

.question-navigation > summary {
  min-height: 3rem;
  padding: 0.5rem 0;
  cursor: pointer;
  color: var(--md-primary);
}

.question-navigation ol {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0 0 0.75rem;
  padding: 0;
  list-style: none;
}

.question-navigation button {
  min-width: 2.85rem;
  min-height: 2.85rem;
  padding: 0.35rem 0.55rem;
  color: var(--md-on-surface-variant);
  background: var(--md-surface-container-lowest);
  border-color: transparent;
  border-radius: var(--shape-md);
  font-family: var(--font-code);
  font-size: 0.85rem;
}

.question-navigation button.is-current {
  color: var(--md-on-primary);
  background: var(--md-primary);
  border-color: var(--md-primary);
  border-radius: var(--shape-full);
}

.question-navigation button.is-answered:not(.is-current) {
  color: var(--md-on-primary-container);
  border-color: var(--md-primary);
}

.question-navigation button.is-checked:not(.is-current) {
  color: var(--md-on-success-container);
  background: var(--md-success-container);
  border-color: transparent;
}

.question-area {
  margin: 1rem;
  padding: clamp(1.1rem, 3vw, 2rem);
  background: var(--md-surface-container-lowest);
  border-radius: var(--shape-xl);
}

.question-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-bottom: 1rem;
  color: var(--md-on-surface-variant);
  font-size: 0.9rem;
  font-weight: 600;
}

.question-meta span:last-child {
  padding: 0.1rem 0.75rem;
  color: var(--md-on-tertiary-container);
  background: var(--md-tertiary-container);
  border-radius: var(--shape-full);
}

.answer-group {
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

legend {
  max-width: 70ch;
  padding: 0;
  font-size: 1.2rem;
  font-weight: 600;
  line-height: 1.75;
}

.question-context {
  max-width: 70ch;
  margin: 0.75rem 0 0;
  padding: 0.85rem 1rem;
  color: var(--md-on-primary-container);
  background: var(--md-primary-container);
  border-radius: var(--shape-xs) var(--shape-lg) var(--shape-lg) var(--shape-lg);
  line-height: 1.75;
}

.question-code {
  overflow-x: auto;
  margin: 1rem 0;
  padding: 1rem 1.15rem;
  color: var(--code-ink);
  background: var(--code-bg);
  border-radius: var(--shape-lg);
  font-family: var(--font-code);
  font-size: 0.88rem;
  line-height: 1.75;
  white-space: pre;
}

.question-code-line {
  display: block;
  min-height: 1.75em;
}

.answer-option {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  margin-top: 0.5rem;
  padding: 0.95rem 1.1rem;
  background: var(--md-surface-container);
  border: 2px solid transparent;
  border-radius: var(--shape-lg);
  line-height: 1.7;
  cursor: pointer;
  transition: transform var(--dur-click) var(--ease-expressive-spatial);
}

.answer-option::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--md-on-surface);
  opacity: 0;
  transition: opacity var(--dur-hover) var(--ease-standard);
}

.answer-option:hover:has(input:not(:disabled))::before {
  opacity: 0.06;
}

.answer-option:active:has(input:not(:disabled)) {
  transform: scale(0.98);
  transition-duration: var(--dur-fast);
}

.answer-option.is-selected {
  color: var(--md-on-primary-container);
  background: var(--md-primary-container);
  border-color: var(--md-primary);
}

.answer-option.is-correct {
  color: var(--md-on-success-container);
  background: var(--md-success-container);
  border-color: var(--md-success);
}

.answer-option.is-wrong {
  color: var(--md-on-error-container);
  background: var(--md-error-container);
  border-color: var(--md-error);
}

.answer-option input {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  margin: 0.2rem 0 0;
  accent-color: var(--md-primary);
}

.option-letter {
  flex: none;
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  color: var(--md-on-primary);
  background: var(--md-primary);
  border-radius: var(--shape-full);
  font-size: 0.85rem;
  font-weight: 700;
}

.is-correct .option-letter { background: var(--md-success); color: var(--md-on-success); }
.is-wrong .option-letter { background: var(--md-error); color: var(--md-on-error); }

.hint-details {
  margin-top: 1rem;
  padding: 0 1rem;
  color: var(--md-on-surface-variant);
  background: var(--md-surface-container);
  border-radius: var(--shape-lg);
}

.hint-details summary {
  min-height: 3rem;
  padding: 0.7rem 0;
  font-weight: 600;
  color: var(--md-primary);
  cursor: pointer;
}

.hint-details p {
  margin: 0 0 0.9rem;
  line-height: 1.75;
}

.question-actions {
  align-items: center;
  margin-top: 1.25rem;
}

.step-actions {
  justify-content: flex-end;
}

.action-button--primary {
  min-height: 3.25rem;
  padding-inline: 1.6rem;
  color: var(--md-on-primary);
  background: var(--md-primary);
  border-color: var(--md-primary);
}

.action-button--primary:disabled {
  color: color-mix(in srgb, var(--md-on-surface) 62%, transparent);
  background: color-mix(in srgb, var(--md-on-surface) 12%, transparent);
  border-color: transparent;
  opacity: 1;
}

.action-button--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--md-primary) 88%, var(--md-on-surface));
}

.feedback {
  margin-top: 1.25rem;
  padding: 1.1rem 1.25rem;
  border-radius: var(--shape-xl);
}

.feedback,
.completion-summary {
  display: flow-root;
}

.feedback-mascot img {
  float: right;
  width: 5.5rem;
  height: auto;
  margin: -0.6rem -0.4rem 0 0.75rem;
  pointer-events: none;
  user-select: none;
}

.feedback > strong {
  font-size: 1.15rem;
}

.feedback--correct {
  color: var(--md-on-success-container);
  background: var(--md-success-container);
}

.feedback--error {
  color: var(--md-on-error-container);
  background: var(--md-error-container);
}

.feedback p {
  margin: 0.45rem 0 0;
}

.feedback ol {
  margin: 0.7rem 0 0;
  padding-inline-start: 1.25rem;
}

.feedback li + li {
  margin-top: 0.4rem;
}

.completion-summary {
  margin-top: 1rem;
  padding: 1rem 1.25rem;
  color: var(--md-on-tertiary-container);
  background: var(--md-tertiary-container);
  border-radius: var(--shape-xl);
}

.completion-summary p {
  margin: 0.35rem 0 0;
}

.empty-state {
  margin: 1rem;
  padding: 1.25rem;
  color: var(--md-on-surface-variant);
  background: var(--md-surface-container);
  border-radius: var(--shape-xl);
}

.reset-dialog {
  max-width: min(32rem, calc(100% - 2rem));
  padding: 1.5rem;
  color: var(--md-on-surface);
  background: var(--md-surface-container-high);
  border: 0;
  border-radius: var(--shape-xl);
}

.reset-dialog::backdrop {
  background: rgb(var(--md-scrim) / 45%);
}

.reset-dialog h3 {
  font-size: 1.35rem;
}

.reset-dialog p {
  margin: 0.75rem 0 0;
  color: var(--md-on-surface-variant);
  line-height: 1.75;
}

.dialog-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.dialog-actions button:not(.action-button--primary) {
  border-color: transparent;
}

@media (prefers-reduced-motion: reduce) {
  button,
  .answer-option {
    transition: none;
  }

  button:active:not(:disabled),
  .answer-option:active:has(input:not(:disabled)) {
    transform: none;
  }
}

@media (max-width: 42rem) {
  .quiz-runner {
    border-radius: var(--shape-xl);
  }

  .quiz-header {
    padding: 1.25rem 1.1rem 0.75rem;
  }

  .quiz-toolbar,
  .question-navigation,
  .question-area {
    margin-inline: 0.5rem;
  }

  .quiz-toolbar,
  .question-navigation {
    padding-inline: 0.9rem;
  }

  .question-area {
    padding: 1rem;
  }

  .quiz-header,
  .quiz-toolbar,
  .question-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .progress-summary {
    align-self: flex-start;
  }

  .topic-filter {
    width: 100%;
  }

  .step-actions {
    justify-content: stretch;
    width: 100%;
  }

  .step-actions button {
    flex: 1;
  }
}
.option-text { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
