import type { PyodideInterface } from 'pyodide';

let runtime: PyodideInterface | undefined;

async function boot() {
  const pyodideUrl = new URL('/python-runtime/pyodide.mjs', self.location.origin).href;
  const { loadPyodide } = await import(/* @vite-ignore */ pyodideUrl);
  runtime = await loadPyodide({ indexURL: new URL('/python-runtime/', self.location.origin).href });
  self.postMessage({ type: 'ready' });
}

const runner = String.raw`
import ast, builtins, contextlib, io, json, math, os, sys, tempfile, types

_source = __lesson_source
_inputs = json.loads(__lesson_inputs_json)
_values = json.loads(__lesson_values_json)
_files = json.loads(__lesson_files_json)
_editable = json.loads(__lesson_editable_json)
_edits = json.loads(__lesson_edits_json)
_setup = __lesson_setup
_random_seed = json.loads(__lesson_random_seed_json)
_fixture_date = json.loads(__lesson_date_json)
_steps = []
_last_line = {}
_previous_values = {}
_line_count = 0
_max_steps = 1000
_max_stdout = 32768
_root = tempfile.mkdtemp(prefix="teelabandat-")
_old_cwd = os.getcwd()
os.chdir(_root)
sys.path.insert(0, _root)

for _path, _content in _files.items():
    _resolved = os.path.realpath(os.path.join(_root, str(_path)))
    if not _resolved.startswith(os.path.realpath(_root) + os.sep):
        continue
    os.makedirs(os.path.dirname(_resolved), exist_ok=True)
    with open(_resolved, "w", encoding="utf-8") as _file:
        _file.write(str(_content))

for _field in _editable:
    if _field.get("kind") == "input" and _field.get("id") in _edits:
        _target = str(_field.get("target", ""))
        if _target.startswith("stdin[") and _target.endswith("]"):
            try:
                _index = int(_target[6:-1])
                while len(_inputs) <= _index:
                    _inputs.append("")
                _inputs[_index] = str(_edits[_field["id"]])
            except (ValueError, TypeError):
                pass

_remaining_inputs = iter(_inputs)
_input_index = 0
_old_input = builtins.input
_output = io.StringIO()
_old_stdout = sys.stdout

class _LimitedOutput(io.StringIO):
    clipped = False
    written_bytes = 0
    def write(self, value):
        text = str(value)
        encoded = text.encode("utf-8")
        remaining = max(0, _max_stdout - self.written_bytes)
        if len(encoded) > remaining:
            accepted = encoded[:remaining].decode("utf-8", errors="ignore")
            super().write(accepted)
            self.written_bytes += len(accepted.encode("utf-8"))
            self.clipped = True
            return len(text)
        self.written_bytes += len(encoded)
        return super().write(text)

_output = _LimitedOutput()

class _InputNeeded(Exception):
    def __init__(self, index, prompt):
        super().__init__("โปรแกรมต้องการคำตอบเพิ่ม กรุณาใส่คำตอบแล้วลองอีกครั้ง")
        self.index = index
        self.prompt = str(prompt)

def _input(prompt=""):
    global _input_index
    try:
        value = next(_remaining_inputs)
        _input_index += 1
        return value
    except StopIteration:
        raise _InputNeeded(_input_index, prompt)

def _safe(value, depth=0):
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if value is None or isinstance(value, (str, int, float, bool)):
        if isinstance(value, str) and len(value) > 1200:
            return value[:1200] + "…"
        return value
    if depth >= 4:
        return type(value).__name__
    if isinstance(value, (list, tuple)):
        return [_safe(item, depth + 1) for item in value[:50]]
    if isinstance(value, dict):
        return {str(key): _safe(item, depth + 1) for key, item in list(value.items())[:50]}
    if hasattr(value, "__dict__") and not isinstance(value, (types.ModuleType, type)):
        return {"__class__": type(value).__name__, **{str(key): _safe(item, depth + 1) for key, item in list(vars(value).items())[:50]}}
    try:
        text = repr(value)
    except Exception:
        text = "<" + type(value).__name__ + ">"
    return text[:1200]

def _variables(frame):
    return {str(key): _safe(value) for key, value in frame.f_locals.items()
            if not str(key).startswith("__") and not isinstance(value, (types.ModuleType, type)) and not callable(value)}

def _record(frame, event, error=None, returned=None):
    global _line_count
    key = (frame, frame.f_code.co_name)
    line = _last_line.pop(id(frame), frame.f_lineno)
    current = _variables(frame)
    before = _previous_values.get(key, {})
    changed = []
    for name in sorted(set(before) | set(current)):
        if name not in current:
            changed.append({"name": name, "value": None, "scope": key[1], "change": "removed"})
        elif name not in before:
            changed.append({"name": name, "value": current[name], "scope": key[1], "change": "new"})
        elif before[name] != current[name]:
            changed.append({"name": name, "value": current[name], "scope": key[1], "change": "changed"})
        else:
            changed.append({"name": name, "value": current[name], "scope": key[1]})
    _previous_values[key] = current
    _line_count += 1
    if _line_count > _max_steps:
        sys.settrace(None)
        raise RuntimeError("หยุดตัวอย่างเพราะมีขั้นตอนมากเกินไป")
    _step = {"line": line, "scope": "main" if key[1] == "<module>" else key[1],
             "variables": changed, "stdout": _output.getvalue()}
    if event == "exception" or (event == "return" and frame.f_code.co_flags & 1):
        _step["event"] = event
    if event == "return" and frame.f_code.co_flags & 1:
        _step["returnValue"] = _safe(returned)
    if error:
        _step["event"] = "exception"
        _step["error"] = str(error)[:1500]
    _steps.append(_step)

def _trace(frame, event, arg):
    if frame.f_code.co_filename != "<lesson>":
        return _trace
    frame_id = id(frame)
    if event == "call" and frame.f_code.co_name == "<module>":
        _previous_values[(frame, frame.f_code.co_name)] = _variables(frame)
    elif event == "line":
        if frame_id in _last_line:
            _record(frame, event)
        _last_line[frame_id] = frame.f_lineno
    elif event == "return":
        if frame_id in _last_line:
            _record(frame, event, returned=arg)
    elif event == "exception":
        if frame_id in _last_line:
            _record(frame, event, arg[1] if arg else None)
    return _trace

_namespace = {"__name__": "__main__", **_values}
if _random_seed is not None:
    import random
    random.seed(_random_seed)
if _fixture_date:
    import datetime
    _real_date = datetime.date
    _fixed_date = _real_date.fromisoformat(_fixture_date)
    class _ScenarioDate(_real_date):
        @classmethod
        def today(cls):
            return cls(_fixed_date.year, _fixed_date.month, _fixed_date.day)
    datetime.date = _ScenarioDate
_overrides = {}
for _field in _editable:
    if _field.get("kind") == "value" and _field.get("id") in _edits:
        _value = _edits[_field["id"]]
        if _field.get("type") == "boolean" or isinstance(_field.get("initial"), bool):
            if str(_value).lower() not in ("true", "false"):
                raise ValueError("ค่าความจริงต้องเป็น True หรือ False")
            _value = str(_value).lower() == "true"
        elif _field.get("type") == "number" or isinstance(_field.get("initial"), (int, float)):
            _text = str(_value).strip()
            _value = float(_text) if any(char in _text.lower() for char in (".", "e")) else int(_text)
        _overrides[str(_field.get("target", ""))] = _value

class _Override(ast.NodeTransformer):
    def visit_Assign(self, node):
        self.generic_visit(node)
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id in _overrides:
                node.value = ast.copy_location(ast.Constant(value=_overrides.pop(target.id)), node.value)
                break
        return node
    def visit_AnnAssign(self, node):
        self.generic_visit(node)
        if isinstance(node.target, ast.Name) and node.target.id in _overrides:
            node.value = ast.copy_location(ast.Constant(value=_overrides.pop(node.target.id)), node.value)
        return node

_error = None
sys.stdout = _output
builtins.input = _input
try:
    if _setup:
        with contextlib.redirect_stdout(io.StringIO()):
            exec(compile(_setup, "<fixture>", "exec"), _namespace)
    _tree = _Override().visit(ast.parse(_source, filename="<lesson>"))
    ast.fix_missing_locations(_tree)
    _code = compile(_tree, "<lesson>", "exec")
    sys.settrace(_trace)
    exec(_code, _namespace)
except BaseException as _caught:
    _error = _caught
    if _steps:
        _steps[-1]["event"] = "exception"
        _steps[-1]["error"] = str(_caught)[:1500]
    else:
        _steps.append({"line": 1, "scope": "main", "variables": [], "stdout": _output.getvalue(), "event": "exception", "error": str(_caught)[:1500]})
finally:
    sys.settrace(None)
    builtins.input = _old_input
    sys.stdout = _old_stdout
    os.chdir(_old_cwd)
    sys.path.remove(_root)

if _output.clipped:
    _marker = "\n[ตัดผลลัพธ์ที่ยาวเกินกำหนด]"
    if _steps:
        _steps[-1]["stdout"] = _output.getvalue() + _marker
if _error and _steps:
    _steps[-1]["event"] = "exception"
    _steps[-1]["error"] = str(_error)[:1500]
    if isinstance(_error, _InputNeeded):
        _steps[-1]["needsInput"] = _error.index
        _steps[-1]["inputPrompt"] = _error.prompt
json.dumps(_steps, ensure_ascii=False)
`;

self.addEventListener('message', async (event: MessageEvent) => {
  if (event.data?.type !== 'run' || !runtime) return;
  try {
    const { code, inputs, values, files, editable, edits, setup, randomSeed, date } = event.data;
    runtime.globals.set('__lesson_source', code);
    runtime.globals.set('__lesson_inputs_json', JSON.stringify(inputs));
    runtime.globals.set('__lesson_values_json', JSON.stringify(values));
    runtime.globals.set('__lesson_files_json', JSON.stringify(files));
    runtime.globals.set('__lesson_editable_json', JSON.stringify(editable));
    runtime.globals.set('__lesson_edits_json', JSON.stringify(edits));
    runtime.globals.set('__lesson_setup', setup ?? '');
    runtime.globals.set('__lesson_random_seed_json', JSON.stringify(randomSeed ?? null));
    runtime.globals.set('__lesson_date_json', JSON.stringify(date ?? null));
    const result = runtime.runPython(runner) as string;
    self.postMessage({ type: 'done', trace: JSON.parse(result) });
  } catch (error) {
    console.error('Python playground setup failed', error);
    self.postMessage({ type: 'error', message: 'เตรียมตัวอย่างนี้ไม่สำเร็จ ลองคืนค่าเดิมแล้วรันอีกครั้งค่ะ' });
  }
});

boot().catch((error) => {
  console.error('Python runtime loading failed', error);
  self.postMessage({ type: 'error', message: 'โหลดพื้นที่ทดลอง Python ไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองอีกครั้งค่ะ' });
});
