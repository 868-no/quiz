"""Visual template registry: parameter validation and computed quantities.

The parameter schemas live in content/visuals/templates.json and are shared with
the browser renderer (web/js/visuals/schema.js implements the same subset). The
template-specific rules and the physics (`quantities`) here are implemented
independently of the JavaScript renderer; tests/fixtures/visual-cases.json is run
through both implementations so they cannot silently diverge.
"""
from __future__ import annotations

import copy
import math
import re
from typing import Any

from .common import Paths, ToolError, read_json

SI_PREFIX = {"G": 1e9, "M": 1e6, "k": 1e3, "": 1.0, "m": 1e-3, "µ": 1e-6, "n": 1e-9, "p": 1e-12}


def load_templates(paths: Paths) -> dict[str, dict[str, Any]]:
    data = read_json(paths.templates_file)
    out = {}
    for t in data.get("templates", []):
        key = f"{t['id']}@{t['version']}"
        if key in out:
            raise ToolError(f"duplicate visual template {key}")
        out[key] = t
    return out


# --- schema subset -----------------------------------------------------------

def _validate(schema: dict[str, Any], value: Any, where: str, errors: list[str], tpl: dict[str, Any]) -> Any:
    """Validate `value`; return a copy with defaults filled in."""
    if value is None:
        if schema.get("nullable"):
            return None
        errors.append(f"{where}: required value is null")
        return None
    t = schema.get("type")
    if t == "object":
        if not isinstance(value, dict):
            errors.append(f"{where}: expected object")
            return value
        props = schema.get("properties", {})
        out = {}
        for key in value:
            if key not in props:
                errors.append(f"{where}.{key}: unknown parameter")
        for key in schema.get("required", []):
            if key not in value:
                errors.append(f"{where}.{key}: required")
        for key, sub in props.items():
            if key in value:
                out[key] = _validate(sub, value[key], f"{where}.{key}", errors, tpl)
            elif "default" in sub:
                out[key] = copy.deepcopy(sub["default"])
        return out
    if t == "array":
        if not isinstance(value, list):
            errors.append(f"{where}: expected array")
            return value
        if len(value) < schema.get("minItems", 0):
            errors.append(f"{where}: needs at least {schema['minItems']} item(s)")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            errors.append(f"{where}: at most {schema['maxItems']} item(s)")
        return [_validate(schema["items"], v, f"{where}[{i}]", errors, tpl) for i, v in enumerate(value)]
    if t in ("number", "integer"):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            errors.append(f"{where}: expected a finite number")
            return value
        if t == "integer" and not float(value).is_integer():
            errors.append(f"{where}: expected an integer")
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{where}: {value} is below the minimum {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{where}: {value} is above the maximum {schema['maximum']}")
        return value
    if t == "string":
        if not isinstance(value, str):
            errors.append(f"{where}: expected a string")
            return value
        enum = schema.get("enum") or (list(tpl.get(schema["enum_from"], {})) if "enum_from" in schema else None)
        if enum is not None and value not in enum:
            errors.append(f"{where}: {value!r} is not one of {enum}")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            errors.append(f"{where}: longer than {schema['maxLength']} characters")
        if "pattern" in schema and not re.match(schema["pattern"], value):
            errors.append(f"{where}: does not match {schema['pattern']}")
        if re.search(r"[<>&]", value):
            errors.append(f"{where}: characters < > & are not allowed")
        return value
    if t == "boolean":
        if not isinstance(value, bool):
            errors.append(f"{where}: expected true/false")
        return value
    errors.append(f"{where}: schema has unsupported type {t!r}")
    return value


# --- template-specific rules and physics ---------------------------------------

def _dc_rules(p: dict[str, Any], errors: list[str]) -> None:
    n = len(p["resistors"])
    if p["topology"] == "parallel" and n < 2:
        errors.append("resistors: a parallel circuit needs at least 2 resistors")
    names = {f"R{i + 1}" for i in range(n)}
    am = p.get("ammeter")
    if am:
        if p["topology"] == "series" and am["branch"] != "main":
            errors.append("ammeter.branch: in a series circuit the ammeter is in the main loop ('main')")
        if am["branch"] != "main" and am["branch"] not in names:
            errors.append(f"ammeter.branch: {am['branch']} does not exist")
    vm = p.get("voltmeter")
    if vm and vm["across"] != "source" and vm["across"] not in names:
        errors.append(f"voltmeter.across: {vm['across']} does not exist")


def _dc_quantities(p: dict[str, Any]) -> dict[str, dict[str, Any]]:
    u = p["source"]["voltage_v"]
    rs = [r["ohms"] for r in p["resistors"]]
    q: dict[str, dict[str, Any]] = {"U": {"value": u, "unit": "V", "shown": p["source"]["show_value"]}}
    for i, r in enumerate(p["resistors"]):
        q[f"R{i + 1}"] = {"value": r["ohms"], "unit": "Ω", "shown": r["show_value"]}
    am, vm = p.get("ammeter"), p.get("voltmeter")
    if p["topology"] == "series":
        rt = sum(rs)
        i_main = u / rt
        branch_i = [i_main] * len(rs)
        branch_u = [i_main * r for r in rs]
    else:
        rt = 1 / sum(1 / r for r in rs)
        branch_i = [u / r for r in rs]
        branch_u = [u] * len(rs)
        i_main = sum(branch_i)
    q["R_total"] = {"value": rt, "unit": "Ω", "shown": False}
    q["I"] = {"value": i_main, "unit": "A",
              "shown": bool(am and am["branch"] == "main" and am["show_reading"])}
    for i in range(len(rs)):
        name = f"R{i + 1}"
        q[f"I_{name}"] = {"value": branch_i[i], "unit": "A",
                          "shown": bool(am and am["show_reading"] and
                                        (am["branch"] == name or (p["topology"] == "series" and am["branch"] == "main")))}
        q[f"U_{name}"] = {"value": branch_u[i], "unit": "V",
                          "shown": bool(vm and vm["show_reading"] and vm["across"] == name)}
    q["P"] = {"value": u * i_main, "unit": "W", "shown": False}
    return q


def _ac_rules(p: dict[str, Any], errors: list[str]) -> None:
    if p["component"]["kind"] == "R" and p["reactance_label"] != "none":
        errors.append("reactance_label: a resistor has no reactance; use 'none'")
    kind, v = p["component"]["kind"], p["component"]["value"]
    limits = {"R": (0.1, 1e8), "C": (1e-15, 1.0), "L": (1e-12, 100.0)}[kind]
    if not limits[0] <= v <= limits[1]:
        errors.append(f"component.value: {v} is implausible for {kind} (expected {limits[0]}–{limits[1]} in SI units)")


def _ac_quantities(p: dict[str, Any]) -> dict[str, dict[str, Any]]:
    f = p["source"]["frequency_hz"]
    kind, v = p["component"]["kind"], p["component"]["value"]
    unit = {"R": "Ω", "C": "F", "L": "H"}[kind]
    q = {
        "f": {"value": f, "unit": "Hz", "shown": p["source"]["show_frequency"]},
        kind: {"value": v, "unit": unit, "shown": p["component"]["show_value"]},
    }
    if kind == "C":
        x = 1 / (2 * math.pi * f * v)
        q["X_C"] = {"value": x, "unit": "Ω", "shown": p["reactance_label"] == "value"}
    elif kind == "L":
        x = 2 * math.pi * f * v
        q["X_L"] = {"value": x, "unit": "Ω", "shown": p["reactance_label"] == "value"}
    else:
        x = v
    u = p["source"].get("voltage_v")
    if u is not None:
        q["U"] = {"value": u, "unit": "V", "shown": p["source"]["show_voltage"]}
        q["I"] = {"value": u / x, "unit": "A", "shown": False}
    return q


def _wave_rules(p: dict[str, Any], errors: list[str]) -> None:
    if len(set(p["markers"])) != len(p["markers"]):
        errors.append("markers: duplicates")
    if "rms" in p["markers"] and p["traces"][0]["shape"] != "sine":
        errors.append("markers: the RMS marker is only defined here for sine waves")
    if len(p["traces"]) == 2 and p["traces"][0]["unit"] != p["traces"][1]["unit"] and p["show_values"]:
        errors.append("traces: two traces with different units need show_values=false (no shared scale)")
    if len(p["traces"]) == 2 and p["traces"][0]["unit"] != p["traces"][1]["unit"] and p["markers"]:
        errors.append("markers: not available when the traces use different units")


def _wave_quantities(p: dict[str, Any]) -> dict[str, dict[str, Any]]:
    t = p["traces"][0]
    scale = 1e-3 if t["unit"].startswith("m") else 1.0
    sym = "I" if t["unit"].endswith("A") else "U"
    unit = "A" if sym == "I" else "V"
    a = t["amplitude"] * scale
    show = p["show_values"]
    q = {
        f"{sym}_p": {"value": a, "unit": unit, "shown": show and "peak" in p["markers"]},
        f"{sym}_pp": {"value": 2 * a, "unit": unit, "shown": show and "peak_to_peak" in p["markers"]},
        "T": {"value": 1 / t["frequency_hz"], "unit": "s", "shown": show and "period" in p["markers"]},
        "f": {"value": t["frequency_hz"], "unit": "Hz", "shown": False},
    }
    if t["shape"] == "sine":
        q[f"{sym}_rms"] = {"value": a / math.sqrt(2), "unit": unit, "shown": show and "rms" in p["markers"]}
    if len(p["traces"]) == 2:
        q["phase_difference_deg"] = {"value": p["traces"][1]["phase_deg"] - t["phase_deg"], "unit": "°",
                                     "shown": False}
    return q


def _block_rules(p: dict[str, Any], errors: list[str]) -> None:
    n = len(p["chain"])
    for i, b in enumerate(p["chain"] + p["side"]):
        if b["kind"] == "custom" and not b.get("label"):
            errors.append(f"block {i}: kind 'custom' needs a label")
    for i, s in enumerate(p["side"]):
        if s["into"] >= n:
            errors.append(f"side[{i}].into: no chain block {s['into']}")
    for i, e in enumerate(p["edge_labels"]):
        if e["after"] >= n - 1:
            errors.append(f"edge_labels[{i}].after: no connection after block {e['after']}")


RULES = {"dc-circuit": _dc_rules, "ac-circuit": _ac_rules, "waveform": _wave_rules, "block-diagram": _block_rules}
QUANTITIES = {"dc-circuit": _dc_quantities, "ac-circuit": _ac_quantities, "waveform": _wave_quantities}


def validate_visual(templates: dict[str, dict[str, Any]], visual: Any, where: str = "visual"
                    ) -> tuple[list[str], dict[str, Any] | None, dict[str, Any] | None]:
    """Return (errors, params_with_defaults, params_after_with_defaults)."""
    errors: list[str] = []
    if not isinstance(visual, dict):
        return [f"{where}: expected an object"], None, None
    unknown = set(visual) - {"template", "version", "params", "params_after", "caption"}
    if unknown:
        errors.append(f"{where}: unknown keys {sorted(unknown)}")
    key = f"{visual.get('template')}@{visual.get('version')}"
    tpl = templates.get(key)
    if tpl is None:
        return errors + [f"{where}: unknown visual template {key}"], None, None
    if "caption" in visual and (not isinstance(visual["caption"], str) or len(visual["caption"]) > 200):
        errors.append(f"{where}.caption: must be a string of at most 200 characters")
    params = _validate(tpl["params"], visual.get("params"), f"{where}.params", errors, tpl)
    after = None
    if not errors:
        RULES[tpl["id"]](params, errors)
    if "params_after" in visual:
        if not isinstance(visual["params_after"], dict):
            errors.append(f"{where}.params_after: expected an object of overrides")
        else:
            merged = deep_merge(visual.get("params") or {}, visual["params_after"])
            after = _validate(tpl["params"], merged, f"{where}.params_after", errors, tpl)
            if not errors:
                RULES[tpl["id"]](after, errors)
    return errors, (params if not errors else None), (after if not errors else None)


def deep_merge(base: Any, over: Any) -> Any:
    if isinstance(base, dict) and isinstance(over, dict):
        out = dict(base)
        for k, v in over.items():
            out[k] = deep_merge(base.get(k), v) if k in base else v
        return out
    return copy.deepcopy(over)


def quantities(template_id: str, params: dict[str, Any]) -> dict[str, dict[str, Any]]:
    fn = QUANTITIES.get(template_id)
    return fn(params) if fn else {}
