import type { CodeExampleData, CodeTeachingData, TraceSnapshot } from './types';

export interface PythonRunRequest {
  example: CodeExampleData;
  teaching: CodeTeachingData;
  edits: Record<string, string>;
  signal?: AbortSignal;
  onPhase?: (phase: 'loading' | 'running') => void;
}

/** Runs only after the learner explicitly opens and starts the Python playground. */
export function runPythonExample({ example, teaching, edits, onPhase, signal }: PythonRunRequest): Promise<TraceSnapshot[]> {
  return new Promise((resolve, reject) => {
    for (const field of teaching.editable ?? []) {
      const value = edits[field.id];
      if (value !== undefined && field.kind === 'value' && (field.type === 'number' || typeof field.initial === 'number') && (!value.trim() || !Number.isFinite(Number(value)))) {
        reject(new Error(`กรอกตัวเลขที่ถูกต้องสำหรับ ${field.label}`));
        return;
      }
    }
    if (signal?.aborted) {
      reject(new DOMException('ยกเลิกการทดลองแล้ว', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('../workers/python.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error, trace?: TraceSnapshot[]) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      worker.terminate();
      if (error) reject(error);
      else resolve(trace ?? []);
    };
    const cancel = () => finish(new DOMException('ยกเลิกการทดลองแล้ว', 'AbortError'));
    signal?.addEventListener('abort', cancel, { once: true });

    onPhase?.('loading');
    timer = setTimeout(() => finish(new Error('โหลด Python ไม่สำเร็จภายในเวลาที่กำหนด ลองอีกครั้งได้ค่ะ')), 30_000);
    worker.addEventListener('error', () => finish(new Error('เปิดพื้นที่ทดลอง Python ไม่สำเร็จ ลองอีกครั้งได้ค่ะ')));
    worker.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.type === 'ready') {
        if (timer) clearTimeout(timer);
        onPhase?.('running');
        timer = setTimeout(() => finish(new Error('ตัวอย่างใช้เวลานานเกินไป จึงหยุดการทำงานแล้วค่ะ')), 3_000);
        worker.postMessage({
          type: 'run',
          code: example.code,
          inputs: teaching.inputs ?? [],
          values: teaching.values ?? {},
          files: teaching.files ?? {},
          setup: teaching.setup ?? '',
          randomSeed: teaching.randomSeed,
          date: teaching.date,
          editable: teaching.editable ?? [],
          edits,
        });
      } else if (event.data?.type === 'done') {
        finish(undefined, event.data.trace as TraceSnapshot[]);
      } else if (event.data?.type === 'error') {
        finish(new Error(String(event.data.message ?? 'รันโค้ดไม่สำเร็จ')));
      }
    });
  });
}
