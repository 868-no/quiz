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
    if p["source"].get("internal_ohms") is not None and p["topology"] != "series":
        errors.append("source.internal_ohms: only drawn for a series circuit")


def _dc_quantities(p: dict[str, Any]) -> dict[str, dict[str, Any]]:
    u = p["source"]["voltage_v"]
    rs = [r["ohms"] for r in p["resistors"]]
    q: dict[str, dict[str, Any]] = {"U": {"value": u, "unit": "V", "shown": p["source"]["show_value"]}}
    for i, r in enumerate(p["resistors"]):
        q[f"R{i + 1}"] = {"value": r["ohms"], "unit": "Ω", "shown": r["show_value"] and not r["name_only"]}
    am, vm = p.get("ammeter"), p.get("voltmeter")
    r_int = p["source"].get("internal_ohms")
    if p["topology"] == "series":
        rt = sum(rs) + (r_int or 0)  # the source's internal resistance is in the loop
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
        q[f"P_{name}"] = {"value": branch_i[i] * branch_u[i], "unit": "W", "shown": False}
    if r_int is not None:
        q["r"] = {"value": r_int, "unit": "Ω", "shown": p["source"]["show_internal"]}
        q["U_r"] = {"value": i_main * r_int, "unit": "V", "shown": False}
    # what a voltmeter across the source's terminals reads (EMF minus the internal drop)
    q["U_terminal"] = {"value": u - i_main * (r_int or 0), "unit": "V",
                       "shown": bool(vm and vm["show_reading"] and vm["across"] == "source")}
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
        # the amplitude axis is labelled only together with a peak or peak-to-peak marker
        f"{sym}_p": {"value": a, "unit": unit,
                     "shown": show and ("peak" in p["markers"] or "peak_to_peak" in p["markers"])},
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
        elif any(o["into"] == s["into"] for o in p["side"][:i]):
            errors.append(f"side[{i}].into: chain block {s['into']} already has a side block")
    for i, e in enumerate(p["edge_labels"]):
        if e["after"] >= n - 1:
            errors.append(f"edge_labels[{i}].after: no connection after block {e['after']}")


# --- rlc-circuit ------------------------------------------------------------------

_UNIT = {"R": "Ω", "C": "F", "L": "H"}
_LIMITS = {"R": (0.1, 1e8), "C": (1e-15, 1.0), "L": (1e-12, 100.0)}


def rlc_names(p: dict[str, Any]) -> list[str]:
    """R, C, L when a kind occurs once; R1, R2 … when it occurs more often."""
    kinds = [c["kind"] for c in p["components"]]
    seen: dict[str, int] = {}
    out = []
    for k in kinds:
        seen[k] = seen.get(k, 0) + 1
        out.append(k if kinds.count(k) == 1 else f"{k}{seen[k]}")
    return out


def _rlc_reactances(p: dict[str, Any]) -> list[float | None]:
    """Reactance of each component: given directly, computed from f, or unknown (None)."""
    src = p["source"]
    f = src.get("frequency_hz") if src["kind"] == "ac" else None
    out: list[float | None] = []
    for c in p["components"]:
        if c["kind"] == "R":
            out.append(0.0)
        elif c.get("reactance_ohms") is not None:
            out.append(c["reactance_ohms"])
        elif f is not None and c.get("value") is not None:
            out.append(2 * math.pi * f * c["value"] if c["kind"] == "L" else 1 / (2 * math.pi * f * c["value"]))
        else:
            out.append(None)
    return out


def _rlc_rules(p: dict[str, Any], errors: list[str]) -> None:
    src = p["source"]
    for i, c in enumerate(p["components"]):
        if c.get("value") is None and c.get("reactance_ohms") is None:
            errors.append(f"components[{i}]: give a value or a reactance")
        if c["kind"] == "R" and c.get("reactance_ohms") is not None:
            errors.append(f"components[{i}]: a resistor has no reactance")
        if c.get("value") is not None:
            lo, hi = _LIMITS[c["kind"]]
            if not lo <= c["value"] <= hi:
                errors.append(f"components[{i}].value: {c['value']} is implausible for {c['kind']}")
    if src["kind"] == "ac" and src.get("frequency_hz") is None:
        errors.append("source.frequency_hz: required for an AC source")
    if src["kind"] == "none" and src.get("voltage_v") is not None:
        errors.append("source.voltage_v: a circuit without a source has no voltage")
    if p["switch"] and (p["topology"] != "series" or src["kind"] == "none"):
        errors.append("switch: only for a series circuit with a source")
    if p.get("current_arrow") is not None and (p["topology"] != "series" or src["kind"] == "none"):
        errors.append("current_arrow: only for a series circuit with a source")
    kinds = {c["kind"] for c in p["components"]}
    if p["label_style"] != "values" and p["total_label"] != "none":
        errors.append("total_label: only used with label_style 'values'")
    if p["total_label"] != "none":
        if len(kinds) > 1:
            if not (p["topology"] == "series" and None not in _rlc_reactances(p)):
                errors.append("total_label: for mixed components only defined as impedance in a series circuit "
                              "with known reactances")
        elif any(c.get("value") is None for c in p["components"]):
            errors.append("total_label: the total needs the component values")


def _rlc_quantities(p: dict[str, Any]) -> dict[str, dict[str, Any]]:
    comps, names, src = p["components"], rlc_names(p), p["source"]
    style = p["label_style"]
    q: dict[str, dict[str, Any]] = {}
    for c, n in zip(comps, names):
        if c.get("value") is not None:
            q[n] = {"value": c["value"], "unit": _UNIT[c["kind"]],
                    "shown": c["show_value"] and style == "values" and c.get("reactance_ohms") is None}
    kinds = {c["kind"] for c in comps}
    shown_total = p["total_label"] == "value"
    if len(kinds) == 1 and all(c.get("value") is not None for c in comps):
        k = next(iter(kinds))
        vals = [c["value"] for c in comps]
        add = (k == "C") == (p["topology"] == "parallel")  # C adds in parallel; R and L add in series
        total = sum(vals) if add else 1 / sum(1 / v for v in vals)
        q[f"{k}_total"] = {"value": total, "unit": _UNIT[k], "shown": shown_total}
    src_shown = style in ("values", "source")
    if src.get("voltage_v") is not None:
        q["U"] = {"value": src["voltage_v"], "unit": "V", "shown": src["show_voltage"] and src_shown}
    if src["kind"] == "ac":
        q["f"] = {"value": src["frequency_hz"], "unit": "Hz", "shown": src["show_frequency"] and src_shown}
    xs = _rlc_reactances(p)
    for k in ("L", "C"):
        idx = [i for i, c in enumerate(comps) if c["kind"] == k]
        if idx and all(xs[i] is not None for i in idx):
            given = any(comps[i].get("reactance_ohms") is not None and comps[i]["show_value"] for i in idx)
            q[f"X_{k}"] = {"value": sum(xs[i] for i in idx), "unit": "Ω", "shown": given and style == "values"}
    if p["topology"] == "series" and None not in xs:
        r = sum(c["value"] for c in comps if c["kind"] == "R")
        x_l = sum(x for x, c in zip(xs, comps) if c["kind"] == "L")
        x_c = sum(x for x, c in zip(xs, comps) if c["kind"] == "C")
        if len(kinds) > 1:
            q["Z"] = {"value": math.hypot(r, x_l - x_c), "unit": "Ω", "shown": shown_total}
    rs = [c["value"] for c in comps if c["kind"] == "R"]
    cs = [c.get("value") for c in comps if c["kind"] == "C"]
    ls = [c.get("value") for c in comps if c["kind"] == "L"]
    if p["topology"] == "series" and len(rs) == 1 and len(cs) == 1 and not ls and cs[0] is not None:
        q["tau"] = {"value": rs[0] * cs[0], "unit": "s", "shown": False}
    if len(cs) == 1 and len(ls) == 1 and cs[0] is not None and ls[0] is not None:
        q["f0"] = {"value": 1 / (2 * math.pi * math.sqrt(ls[0] * cs[0])), "unit": "Hz", "shown": False}
    return q


# --- rectifier ---------------------------------------------------------------------

def _rect_rules(p: dict[str, Any], errors: list[str]) -> None:
    src = p["source"]
    if src.get("u_rms") is not None and src.get("u_peak") is not None:
        errors.append("source: give either u_rms or u_peak, not both")
    if not p["load"] and not p["capacitor"]:
        errors.append("load: a rectifier needs a load or a capacitor at the output")


def _rect_quantities(p: dict[str, Any]) -> dict[str, dict[str, Any]]:
    src, q = p["source"], {}
    if src.get("u_rms") is not None:
        q["U_rms"] = {"value": src["u_rms"], "unit": "V", "shown": src["show_value"]}
        q["U_p"] = {"value": src["u_rms"] * math.sqrt(2), "unit": "V", "shown": False}
    if src.get("u_peak") is not None:
        q["U_p"] = {"value": src["u_peak"], "unit": "V", "shown": src["show_value"]}
    return q


# --- transformer -------------------------------------------------------------------

def _tr_rules(p: dict[str, Any], errors: list[str]) -> None:
    if p["secondary_label"] != "none" and p.get("primary_voltage_v") is None:
        errors.append("secondary_label: needs primary_voltage_v")
    if p["input_label"] != "none" and p.get("load_ohms") is None:
        errors.append("input_label: needs load_ohms")


def _tr_quantities(p: dict[str, Any]) -> dict[str, dict[str, Any]]:
    n = p["turns_primary"] / p["turns_secondary"]
    show_turns = p["turns_display"] != "none"
    q = {"N_p": {"value": p["turns_primary"], "unit": "", "shown": p["turns_display"] == "numbers"},
         "N_s": {"value": p["turns_secondary"], "unit": "", "shown": p["turns_display"] == "numbers"},
         "ratio": {"value": n, "unit": "", "shown": show_turns}}
    if p.get("primary_voltage_v") is not None:
        q["U_p"] = {"value": p["primary_voltage_v"], "unit": "V", "shown": p["show_primary_voltage"]}
        q["U_s"] = {"value": p["primary_voltage_v"] / n, "unit": "V", "shown": p["secondary_label"] == "value"}
    if p.get("load_ohms") is not None:
        q["R_L"] = {"value": p["load_ohms"], "unit": "Ω", "shown": p["show_load"]}
        q["Z_p"] = {"value": p["load_ohms"] * n * n, "unit": "Ω", "shown": False}
    return q


# --- transistor-stage --------------------------------------------------------------

_NODE_Q = {"B": ("U_B", "V"), "E": ("U_E", "V"), "C": ("U_C", "V"), "IC": ("I_C", "A")}


def _ts_rules(p: dict[str, Any], errors: list[str]) -> None:
    nodes = [l["node"] for l in p["labels"]]
    if len(set(nodes)) != len(nodes):
        errors.append("labels: each node can be labelled once")
    if p["bypass_capacitor"] and p.get("re_ohms") is None:
        errors.append("bypass_capacitor: needs an emitter resistor (re_ohms)")
    if p["rc_ohms"] is None:
        errors.append("rc_ohms: required (the collector resistor is always drawn)")
    if p.get("base_resistor") and p["divider"]:
        errors.append("base_resistor: use either a base resistor from the supply or a divider, not both")


def _ts_quantities(p: dict[str, Any]) -> dict[str, dict[str, Any]]:
    q = {"U_CC": {"value": p["vcc_v"], "unit": "V", "shown": p["show_vcc"]}}
    for k, name in (("rc_ohms", "R_C"), ("re_ohms", "R_E")):
        if p.get(k) is not None:
            q[name] = {"value": p[k], "unit": "Ω", "shown": p["show_resistor_values"]}
    rb = p.get("base_resistor")
    if rb and rb.get("ohms") is not None:
        q["R_B"] = {"value": rb["ohms"], "unit": "Ω", "shown": rb["show_value"]}
    for l in p["labels"]:
        sym, unit = _NODE_Q[l["node"]]
        if l.get("value") is not None:
            q[sym] = {"value": l["value"], "unit": unit, "shown": True}
    return q


# --- series-regulator -------------------------------------------------------------

def _reg_rules(p: dict[str, Any], errors: list[str]) -> None:
    if p.get("u_in_v") is not None and p.get("u_out_v") is not None and p["u_out_v"] >= p["u_in_v"]:
        errors.append("u_out_v: a series regulator's output must be lower than its input")
    if len(set(p["unknown"])) != len(p["unknown"]):
        errors.append("unknown: duplicates")
    given = {"U_in": p.get("u_in_v"), "U_out": p.get("u_out_v"), "I_L": p.get("i_load_a")}
    for k in p["unknown"]:
        if k in given and given[k] is None:
            errors.append(f"unknown: {k} is marked '?' but has no value to check against")


def _reg_quantities(p: dict[str, Any]) -> dict[str, dict[str, Any]]:
    q: dict[str, dict[str, Any]] = {}
    unk = set(p["unknown"])
    for key, name, unit in (("u_in_v", "U_in", "V"), ("u_out_v", "U_out", "V"), ("i_load_a", "I_L", "A")):
        if p.get(key) is not None:
            q[name] = {"value": p[key], "unit": unit, "shown": name not in unk}
    if p.get("u_in_v") is not None and p.get("u_out_v") is not None:
        q["U_pass"] = {"value": p["u_in_v"] - p["u_out_v"], "unit": "V", "shown": False}
        if p.get("i_load_a") is not None:
            q["P_pass"] = {"value": (p["u_in_v"] - p["u_out_v"]) * p["i_load_a"], "unit": "W", "shown": False}
    return q


# --- zener-regulator --------------------------------------------------------------

def _zen_rules(p: dict[str, Any], errors: list[str]) -> None:
    if p["u_z_v"] >= p["u_in_v"]:
        errors.append("u_z_v: the zener voltage must be lower than the input voltage")
    if len(set(p["unknown"])) != len(p["unknown"]):
        errors.append("unknown: duplicates")
    if p.get("i_a") is None and ("I" in p["unknown"] or "R" in p["unknown"]):
        errors.append("unknown: I and R need i_a")


def _zen_quantities(p: dict[str, Any]) -> dict[str, dict[str, Any]]:
    unk = set(p["unknown"])
    u_r = p["u_in_v"] - p["u_z_v"]
    q: dict[str, dict[str, Any]] = {
        "U_in": {"value": p["u_in_v"], "unit": "V", "shown": "U_in" not in unk},
        "U_Z": {"value": p["u_z_v"], "unit": "V", "shown": "U_Z" not in unk},
        "U_R": {"value": u_r, "unit": "V", "shown": False},
    }
    if p.get("i_a") is not None:
        q["I"] = {"value": p["i_a"], "unit": "A", "shown": "I" not in unk}
        q["R"] = {"value": u_r / p["i_a"], "unit": "Ω", "shown": "R" not in unk}
    return q


# --- frequency-response -----------------------------------------------------------

_FR_PARTS = ("filters", "resonance", "band", "spectrum", "coupled")
_FR_NEEDS = {"filter": "filters", "resonance": "resonance", "spectrum": "spectrum", "coupled": "coupled"}


def _fr_rules(p: dict[str, Any], errors: list[str]) -> None:
    kind = p["kind"]
    allowed = {_FR_NEEDS[kind]} | ({"band"} if kind == "resonance" else set())
    for part in _FR_PARTS:
        if part not in allowed and p.get(part):
            errors.append(f"{part}: not used with kind '{kind}'")
    if not p.get(_FR_NEEDS[kind]):
        errors.append(f"{_FR_NEEDS[kind]}: required for kind '{kind}'")
        return
    if kind in ("resonance", "spectrum") and p.get("center_hz") is None:
        errors.append(f"center_hz: required for kind '{kind}'")
        return
    if p["center_label"] == "value" and p.get("center_hz") is None:
        errors.append("center_label: 'value' needs center_hz")
    if kind == "filter":
        fs = p["filters"]
        for i, f in enumerate(fs):
            if f["bw60_hz"] <= f["bw6_hz"]:
                errors.append(f"filters[{i}]: the −60 dB width must be larger than the −6 dB width")
        if len(fs) == 2 and (not fs[0]["name"] or not fs[1]["name"] or fs[0]["name"] == fs[1]["name"]):
            errors.append("filters: two filters need different names")
    elif kind == "resonance":
        r = p["resonance"]
        if not r["f_low_hz"] < p["center_hz"] < r["f_high_hz"]:
            errors.append("resonance: the half-power points must lie on each side of center_hz")
    elif kind == "spectrum":
        s = p["spectrum"]
        if s["mode"] == "am" and s["index"] > 1:
            errors.append("spectrum.index: an AM modulation index above 1 is overmodulation")
        if p["center_hz"] <= 15 * s["mod_hz"]:
            errors.append("spectrum: the carrier must be far above the tone frequency")
        if s["mode"] == "fm" and s["freq_labels"] == "all":
            errors.append("spectrum.freq_labels: 'all' is only for AM (FM has too many lines)")


def _fr_quantities(p: dict[str, Any]) -> dict[str, dict[str, Any]]:
    q: dict[str, dict[str, Any]] = {}
    vis = not p["blank"]
    kind = p["kind"]
    if kind == "filter":
        fs = p["filters"]
        for i, f in enumerate(fs):
            suf = "" if len(fs) == 1 else f"_{f['name']}"
            q[f"B6{suf}"] = {"value": f["bw6_hz"], "unit": "Hz", "shown": vis and f["bw6_label"] == "value"}
            q[f"B60{suf}"] = {"value": f["bw60_hz"], "unit": "Hz", "shown": vis and f["bw60_label"] == "value"}
            q[f"SF{suf}"] = {"value": f["bw60_hz"] / f["bw6_hz"], "unit": "", "shown": False}
    elif kind == "resonance":
        r, f0 = p["resonance"], p["center_hz"]
        b = r["f_high_hz"] - r["f_low_hz"]
        q["f0"] = {"value": f0, "unit": "Hz", "shown": vis and p["center_label"] == "value"}
        q["f1"] = {"value": r["f_low_hz"], "unit": "Hz", "shown": vis and r["points_label"] == "value"}
        q["f2"] = {"value": r["f_high_hz"], "unit": "Hz", "shown": vis and r["points_label"] == "value"}
        q["B"] = {"value": b, "unit": "Hz", "shown": False}
        q["Q"] = {"value": f0 / b, "unit": "", "shown": vis and r["q_label"] == "value"}
    elif kind == "spectrum":
        s, fc = p["spectrum"], p["center_hz"]
        q["f_c"] = {"value": fc, "unit": "Hz", "shown": vis and s["freq_labels"] != "none"}
        q["f_m"] = {"value": s["mod_hz"], "unit": "Hz", "shown": vis and s["spacing_label"]}
        if s["mode"] == "am":
            q["f_lsb"] = {"value": fc - s["mod_hz"], "unit": "Hz", "shown": vis and s["freq_labels"] == "all"}
            q["f_usb"] = {"value": fc + s["mod_hz"], "unit": "Hz", "shown": vis and s["freq_labels"] == "all"}
        else:
            q["deviation"] = {"value": s["index"] * s["mod_hz"], "unit": "Hz", "shown": False}
    return q


# --- time-signal ------------------------------------------------------------------

_TS_TRACES = {"conduction": {"A", "AB", "B", "C"}, "keying": {"hard", "soft"}, "envelope": {"speech", "processed", "rtty"},
              "am": {"normal", "overdriven"}, "fsk": {"fsk"}, "chirp": {"chirp", "stable"},
              "drift": {"warmup"}}


def _ts_rules_time(p: dict[str, Any], errors: list[str]) -> None:
    allowed = _TS_TRACES[p["kind"]]
    if not p["traces"]:
        errors.append("traces: at least one")
    for t in p["traces"]:
        if t not in allowed:
            errors.append(f"traces: '{t}' is not used with kind '{p['kind']}'")
    if len(set(p["traces"])) != len(p["traces"]):
        errors.append("traces: duplicates")
    if p["markers"] and p["kind"] != "envelope":
        errors.append("markers: only for kind 'envelope'")
    if p["kind"] == "fsk" and not re.fullmatch(r"[01]{2,10}", p["bits"]):
        errors.append("bits: 2–10 characters of 0 and 1")


# --- spectrum -----------------------------------------------------------------------

def _spectrum_rules(p: dict[str, Any], errors: list[str]) -> None:
    lo, hi = p["x_min_hz"], p["x_max_hz"]
    if not hi > lo:
        errors.append("x_max_hz: must be above x_min_hz")
    if not p["blank"] and not p["panels"]:
        errors.append("panels: at least one")
    for i, pa in enumerate(p["panels"]):
        for j, ln in enumerate(pa["lines"]):
            if not lo <= ln["f_hz"] <= hi:
                errors.append(f"panels[{i}].lines[{j}]: outside the axis")
        for j, b in enumerate(pa["bands"]):
            if not (b["to_hz"] > b["from_hz"] and lo <= b["from_hz"] <= hi and lo <= b["to_hz"] <= hi):
                errors.append(f"panels[{i}].bands[{j}]: must lie on the axis, from below to")
        if pa.get("filter") and not pa["filter"]["to_hz"] > pa["filter"]["from_hz"]:
            errors.append(f"panels[{i}].filter: to_hz must be above from_hz")
        if pa.get("skirt") and not lo <= pa["skirt"]["center_hz"] <= hi:
            errors.append(f"panels[{i}].skirt: outside the axis")


# --- semiconductor --------------------------------------------------------------------

def _semi_rules(p: dict[str, Any], errors: list[str]) -> None:
    if p["dopant"] != "none" and p["kind"] != "lattice":
        errors.append("dopant: only for kind 'lattice'")
    if p["bias"] != "none" and p["kind"] != "junction":
        errors.append("bias: only for kind 'junction'")
    if p["compare"] and p["kind"] == "lattice":
        errors.append("compare: not for kind 'lattice'")
    if p["kind"] == "junction" and p["bias"] == "forward" and p["depletion"] == "wide":
        errors.append("depletion: forward bias narrows the layer, it cannot be wide")


# --- illustration ---------------------------------------------------------------------

def _illu_rules(p: dict[str, Any], errors: list[str]) -> None:
    if p["kind"] == "prefixes" and p["from"] == p["to"]:
        errors.append("to: must differ from from")
    if p["kind"] == "s_meter" and not (1 <= p["from_s"] < p["to_s"] <= 9):
        errors.append("from_s/to_s: two S-units 1–9, from below to")
    if p["kind"] == "tolerance" and p.get("nominal") is None:
        errors.append("nominal: required for kind tolerance")
    if p["kind"] == "band_edge" and (p.get("edge_khz") is None or p.get("dial_khz") is None):
        errors.append("edge_khz/dial_khz: required for kind band_edge")


# --- pi-network, ratio-detector, stage --------------------------------------------

def _no_rules(p: dict[str, Any], errors: list[str]) -> None:
    pass  # every combination of the parameters can be drawn


# --- code-breakdown (new) ---

def _code_breakdown_rules(p: dict[str, Any], errors: list[str]) -> None:
    if sum(len(x["text"]) for x in p["parts"]) > 16:
        errors.append("parts: the whole code is at most 16 characters")
    for i, x in enumerate(p["parts"]):
        if x["hidden"] and not x["label"]:
            errors.append(f"parts[{i}].label: a hidden part needs a label to show after answering")
    if not any(x["label"] for x in p["parts"]):
        errors.append("parts: at least one part needs a label")

# --- end code-breakdown ---


# --- instrument (new) ---

def _instrument_rules(p: dict[str, Any], errors: list[str]) -> None:
    if p["kind"] == "scope":
        if not p["traces"]:
            errors.append("traces: kind scope needs 1–2 traces")
        for i, t in enumerate(p["traces"]):
            if t["shape"] == "am" and t["carrier_hz"] is None:
                errors.append(f"traces[{i}].carrier_hz: required for an AM trace")
            if t["shape"] == "am" and t["carrier_hz"] is not None and not t["carrier_hz"] >= 4 * t["frequency_hz"]:
                errors.append(f"traces[{i}].carrier_hz: must be at least 4 times the modulating frequency")
            if t["shape"] != "am" and t["carrier_hz"] is not None:
                errors.append(f"traces[{i}].carrier_hz: only for an AM trace")
            periods = 10 * p["time_per_div_s"] * t["frequency_hz"]
            if periods < 0.25 or periods > 40:
                errors.append(f"traces[{i}].frequency_hz: shows {periods:.3g} periods on the screen; use 0,25–40")
            top = (abs(t["offset_v"]) + t["amplitude_v"] * (1 + t["depth"] if t["shape"] == "am" else 1)) / p["volt_per_div_v"]
            if top > 4:
                errors.append(f"traces[{i}].amplitude_v: the trace goes off the screen (more than 4 divisions from the middle)")
    elif p["traces"]:
        errors.append("traces: only for kind scope")
    if p["kind"] == "meter_series" and p["range_v"] is None:
        errors.append("range_v: required for kind meter_series")
    if p["kind"] == "meter_shunt" and p["range_a"] is None:
        errors.append("range_a: required for kind meter_shunt")
    if p["kind"] == "meter_series" and p["range_v"] is not None:
        um = p["meter"]["full_scale_a"] * (p["meter"]["coil_ohms"] or 0)
        if not p["range_v"] > um:
            errors.append("range_v: must be above the voltage over the meter at full scale")
    if p["kind"] == "meter_shunt":
        if p["meter"]["coil_ohms"] is None:
            errors.append("meter.coil_ohms: a shunt needs the meter resistance")
        if p["range_a"] is not None and not p["range_a"] > p["meter"]["full_scale_a"]:
            errors.append("range_a: must be above the meter full-scale current")
    if p["kind"] == "voltmeter_loading" and p["supply_v"] is None:
        errors.append("supply_v: required for kind voltmeter_loading")


def _instrument_quantities(p: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Independent of web/js/visuals/instrument.js; the quantity names match the
    calculation inputs they illustrate (U, I, R for the meters, T and f)."""
    q: dict[str, dict[str, Any]] = {}
    k = p["kind"]
    if k == "scope":
        t = p["traces"][0]
        q["f"] = {"value": t["frequency_hz"], "unit": "Hz", "shown": False}
        q["T"] = {"value": 1 / t["frequency_hz"], "unit": "s", "shown": False}
        q["U_p"] = {"value": t["amplitude_v"], "unit": "V", "shown": False}
        q["U_pp"] = {"value": 2 * t["amplitude_v"], "unit": "V", "shown": False}
        q["time_per_div"] = {"value": p["time_per_div_s"], "unit": "s", "shown": p["show_settings"]}
        q["volt_per_div"] = {"value": p["volt_per_div_v"], "unit": "V", "shown": p["show_settings"]}
        q["div_per_period"] = {"value": 1 / (t["frequency_hz"] * p["time_per_div_s"]), "unit": "", "shown": False}
    elif k == "meter_series":
        m = p["meter"]
        rm = m["coil_ohms"] or 0
        q["I"] = {"value": m["full_scale_a"], "unit": "A", "shown": m["show_full_scale"]}
        q["R_m"] = {"value": rm, "unit": "Ω", "shown": m["coil_ohms"] is not None and m["show_coil"]}
        q["U"] = {"value": p["range_v"], "unit": "V", "shown": p["show_range"]}
        q["R"] = {"value": p["range_v"] / m["full_scale_a"] - rm, "unit": "Ω", "shown": p["show_resistor"]}
    elif k == "meter_shunt":
        m = p["meter"]
        um = m["full_scale_a"] * m["coil_ohms"]
        q["I_m"] = {"value": m["full_scale_a"], "unit": "A", "shown": m["show_full_scale"]}
        q["R_m"] = {"value": m["coil_ohms"], "unit": "Ω", "shown": m["show_coil"]}
        q["U"] = {"value": um, "unit": "V", "shown": False}
        q["I"] = {"value": p["range_a"], "unit": "A", "shown": p["show_range"]}
        q["I_sh"] = {"value": p["range_a"] - m["full_scale_a"], "unit": "A", "shown": False}
        q["R"] = {"value": um / (p["range_a"] - m["full_scale_a"]), "unit": "Ω", "shown": p["show_resistor"]}
    elif k == "voltmeter_loading":
        rp = 1 / (1 / p["r2_ohms"] + 1 / p["meter_ohms"])
        q["U_s"] = {"value": p["supply_v"], "unit": "V", "shown": True}
        q["R_upper"] = {"value": p["r1_ohms"], "unit": "Ω", "shown": True}
        q["R_lower"] = {"value": p["r2_ohms"], "unit": "Ω", "shown": True}
        q["R_i"] = {"value": p["meter_ohms"], "unit": "Ω", "shown": p["show_meter_ohms"]}
        q["R_p"] = {"value": rp, "unit": "Ω", "shown": False}
        q["U_m"] = {"value": p["supply_v"] * rp / (p["r1_ohms"] + rp), "unit": "V", "shown": p["show_reading"]}
        q["U_0"] = {"value": p["supply_v"] * p["r2_ohms"] / (p["r1_ohms"] + p["r2_ohms"]), "unit": "V", "shown": False}
    elif k == "gate":
        q["T"] = {"value": p["gate_s"], "unit": "s", "shown": True}
        q["f"] = {"value": 1 / p["gate_s"], "unit": "Hz", "shown": p["show_resolution"]}
    return q

# --- end instrument ---


# --- antenna (new) ---

def _antenna_rules(p: dict[str, Any], errors: list[str]) -> None:
    k = p["kind"]
    if (p["show_current"] or p["show_voltage"]) and k not in ("dipole", "loaded_vertical"):
        errors.append("show_current/show_voltage: only for dipole and loaded_vertical")
    if p["show_voltage"] and k == "loaded_vertical":
        errors.append("show_voltage: only for dipole")
    if p.get("phase_deg") is not None and not (k == "dipole" and (p["show_current"] or p["show_voltage"])):
        errors.append("phase_deg: only for a dipole with current or voltage shown")
    a = p["radial_angle"]
    if k == "ground_plane" and p["show_impedance"] and not (a == 0 or 35 <= a <= 55):
        errors.append("show_impedance: radials horizontal (0°) or about 45° (35–55°)")
    if k == "ground_plane" and p["compare"] and a < 20:
        errors.append("compare: radial_angle must be at least 20° to differ from the horizontal radials")
    if k == "pattern" and p["beamwidth"] and p["shape"] == "vertical":
        errors.append("beamwidth: a vertical seen from above radiates equally all round")
    if k == "pattern" and p["compass"] and p["shape"] == "directional":
        errors.append("compass: not for the directional pattern (it is drawn with front and back)")
    if k != "trap_dipole" and p["active"] != "all":
        errors.append("active: only for trap_dipole")

# --- end antenna ---


# --- propagation (new) ---

def _propagation_rules(p: dict[str, Any], errors: list[str]) -> None:
    if p["compare"] and p["kind"] != "layers":
        errors.append("compare: only for kind layers")
    if p["kind"] == "sky_wave":
        if not p["angles"]:
            errors.append("angles: at least one")
        if len(set(p["angles"])) != len(p["angles"]):
            errors.append("angles: each angle once")
        if not p["ground_wave_km"] < p["range_km"]:
            errors.append("ground_wave_km: must be below range_km")
    if p["kind"] == "hops" and p["hops"] * 2 * p["layer_km"] / math.tan(math.radians(p["elevation_deg"])) > 40000:
        errors.append("elevation_deg: the hops would go more than once round the earth")

# --- end propagation ---


# --- sampling (new) ---

def _sampling_rules(p: dict[str, Any], errors: list[str]) -> None:
    if p["kind"] == "samples" and p["f_hz"] > 2 * p["fs_hz"]:
        errors.append("f_hz: at most twice fs_hz")
    if p["kind"] == "quantize" and not p["range_max_v"] > p["range_min_v"]:
        errors.append("range_max_v: must be above range_min_v")
    if p["show_reconstruction"] and p["kind"] != "samples":
        errors.append("show_reconstruction: only for kind 'samples'")
    if p["kind"] != "quantize" and (p["show_error"] or p["levels_label"] or p["step_label"] != "none"):
        errors.append("show_error, levels_label, step_label: only for kind 'quantize'")

# --- end sampling ---


# --- feedline (new) ---

def _feedline_reflection(p: dict[str, Any]) -> float:
    if p["load"] == "open":
        return 1.0
    if p["load"] == "short":
        return -1.0
    if p["load"] == "resistive":
        return (p["load_ratio"] - 1) / (p["load_ratio"] + 1)
    return 0.0


def _feedline_dir_gamma(p: dict[str, Any]) -> float:
    return math.sqrt(p["reflected"] / p["forward"]) if p["unit"] == "W" else p["reflected"] / p["forward"]


def _feedline_rules(p: dict[str, Any], errors: list[str]) -> None:
    if p["kind"] == "standing_wave":
        if p["show_minmax"] and p["envelope"] == "none":
            errors.append("show_minmax: needs an envelope")
        if p["show_minmax"] and _feedline_reflection(p) == 0:
            errors.append("show_minmax: a matched line has no maxima or minima")
        if p["swr_label"] == "value" and p["load"] in ("open", "short"):
            errors.append("swr_label: an open or short line has infinite SWR")
    if p["kind"] == "cable":
        if p["dimensions"] and p["cable"] == "ladder":
            errors.append("dimensions: only for a coax cable")
        if p["currents"] and p["cable"] == "coax":
            errors.append("currents: only for a ladder line")
    if p["kind"] == "directional":
        if not p["reflected"] < p["forward"]:
            errors.append("reflected: must be below forward")
        if p["return_loss_label"] != "none" and p["reflected"] == 0:
            errors.append("return_loss_label: needs a reflected wave")


def _feedline_quantities(p: dict[str, Any]) -> dict[str, dict[str, Any]]:
    swr = lambda g: (1 + abs(g)) / (1 - abs(g))  # noqa: E731
    if p["kind"] == "standing_wave":
        g = _feedline_reflection(p)
        q = {"Z0": {"value": p["z0_ohms"], "unit": "Ω", "shown": p["show_z0"]}}
        if abs(g) < 1:
            q["SWR"] = {"value": swr(g), "unit": "", "shown": p["swr_label"] == "value"}
        if p["load"] == "resistive":
            q["R_L"] = {"value": p["load_ratio"] * p["z0_ohms"], "unit": "Ω", "shown": p["show_load"]}
        return q
    if p["kind"] == "quarter_wave":
        return {"Z0": {"value": p["z0_ohms"], "unit": "Ω", "shown": p["show_z0"]},
                "Z_L": {"value": p["z_load_ohms"], "unit": "Ω", "shown": p["show_load"]},
                "Z_inn": {"value": p["z0_ohms"] ** 2 / p["z_load_ohms"], "unit": "Ω", "shown": p["input_label"] == "value"}}
    if p["kind"] == "directional":
        f, r, u = ("P_fwd", "P_ref", "W") if p["unit"] == "W" else ("U_fwd", "U_ref", "V")
        g = _feedline_dir_gamma(p)
        q = {f: {"value": p["forward"], "unit": u, "shown": p["show_readings"]},
             r: {"value": p["reflected"], "unit": u, "shown": p["show_readings"]},
             "SWR": {"value": swr(g), "unit": "", "shown": p["swr_label"] == "value"}}
        if p["reflected"] > 0:
            q["RL"] = {"value": -20 * math.log10(g), "unit": "dB", "shown": p["return_loss_label"] == "value"}
        return q
    return {}

# --- end feedline ---


# --- safety (new) ---

def _safety_rules(p: dict[str, Any], errors: list[str]) -> None:
    if p["highlight"] != "none" and p["kind"] != "body_paths":
        errors.append("highlight: only for kind body_paths")
    if p.get("leak_ma") is not None and p["protection"] != "fuse_rcd":
        errors.append("leak_ma: only with protection fuse_rcd")
    if (p.get("leak_ma") is not None or p.get("fuse_a") is not None) and p["kind"] != "earth_fault":
        errors.append("fuse_a/leak_ma: only for kind earth_fault")

# --- end safety ---


RULES = {"dc-circuit": _dc_rules, "ac-circuit": _ac_rules, "waveform": _wave_rules, "block-diagram": _block_rules,
         "rlc-circuit": _rlc_rules, "rectifier": _rect_rules, "transformer": _tr_rules, "transistor-stage": _ts_rules,
         "series-regulator": _reg_rules, "zener-regulator": _zen_rules,
         "frequency-response": _fr_rules, "pi-network": _no_rules,
         "ratio-detector": _no_rules, "time-signal": _ts_rules_time,
         "spectrum": _spectrum_rules, "semiconductor": _semi_rules,
         "stage": _no_rules, "illustration": _illu_rules, "code-breakdown": _code_breakdown_rules, "instrument": _instrument_rules, "antenna": _antenna_rules, "propagation": _propagation_rules, "sampling": _sampling_rules, "feedline": _feedline_rules, "safety": _safety_rules}
QUANTITIES = {"dc-circuit": _dc_quantities, "ac-circuit": _ac_quantities, "waveform": _wave_quantities,
              "rlc-circuit": _rlc_quantities, "rectifier": _rect_quantities, "transformer": _tr_quantities,
              "transistor-stage": _ts_quantities, "series-regulator": _reg_quantities, "zener-regulator": _zen_quantities,
              "frequency-response": _fr_quantities, "feedline": _feedline_quantities, "instrument": _instrument_quantities}


def validate_visual(templates: dict[str, dict[str, Any]], visual: Any, where: str = "visual"
                    ) -> tuple[list[str], dict[str, Any] | None, dict[str, Any] | None]:
    """Return (errors, params_with_defaults, params_after_with_defaults)."""
    errors: list[str] = []
    if not isinstance(visual, dict):
        return [f"{where}: expected an object"], None, None
    unknown = set(visual) - {"template", "version", "params", "params_after", "caption", "animation", "after_only"}
    if unknown:
        errors.append(f"{where}: unknown keys {sorted(unknown)}")
    key = f"{visual.get('template')}@{visual.get('version')}"
    tpl = templates.get(key)
    if tpl is None:
        return errors + [f"{where}: unknown visual template {key}"], None, None
    if "after_only" in visual and not isinstance(visual["after_only"], bool):
        errors.append(f"{where}.after_only: true or false")
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
    if "animation" in visual and not errors:
        _validate_animation(tpl, visual, errors, where)
    return errors, (params if not errors else None), (after if not errors else None)


ANIMATION_FRAMES = 24
_ANIM_KEYS = {"param", "from", "to", "phase", "mode", "params", "text"}


def _animation_value(anim: dict[str, Any], k: int) -> float:
    n = ANIMATION_FRAMES
    share = k / (n - 1) if anim.get("mode") == "loop" else (k if k <= n / 2 else n - k) / (n / 2)
    return anim["from"] + (anim["to"] - anim["from"]) * share


def _set_path(obj: Any, path: str, value: float) -> None:
    keys = path.split(".")
    for k in keys[:-1]:
        obj = obj[int(k)] if k.isdigit() else obj[k]
    last = keys[-1]
    if last.isdigit():
        obj[int(last)] = value
    elif isinstance(obj, dict):
        obj[last] = value
    else:
        raise KeyError(last)


def _validate_animation(tpl: dict[str, Any], visual: dict[str, Any], errors: list[str], where: str) -> None:
    """A parameter animation: every one of the 24 frames must be a valid figure."""
    anim = visual["animation"]
    w = f"{where}.animation"
    if not isinstance(anim, dict):
        errors.append(f"{w}: expected an object")
        return
    if set(anim) - _ANIM_KEYS:
        errors.append(f"{w}: unknown keys {sorted(set(anim) - _ANIM_KEYS)}")
    if not isinstance(anim.get("param"), str) or not re.fullmatch(r"[a-z_0-9]+(\.[a-z_0-9]+)*", anim.get("param", "")):
        errors.append(f"{w}.param: a dotted parameter path, e.g. band.center_hz")
    for key in ("from", "to"):
        if not isinstance(anim.get(key), (int, float)) or isinstance(anim.get(key), bool):
            errors.append(f"{w}.{key}: a number")
    if anim.get("phase", "both") not in ("before", "after", "both"):
        errors.append(f"{w}.phase: before, after or both")
    if anim.get("mode", "bounce") not in ("bounce", "loop"):
        errors.append(f"{w}.mode: bounce or loop")
    text = anim.get("text")
    if not isinstance(text, str) or not 10 <= len(text) <= 240:
        errors.append(f"{w}.text: say in a sentence what the animation shows (10–240 characters)")
    if "params" in anim and not isinstance(anim["params"], dict):
        errors.append(f"{w}.params: an object of overrides")
    if errors:
        return
    anim = {"phase": "both", "mode": "bounce", **anim}
    phases = ["before", "after"] if anim["phase"] == "both" else [anim["phase"]]
    for phase in phases:
        base = visual.get("params") or {}
        if phase == "after" and "params_after" in visual:
            base = deep_merge(base, visual["params_after"])
        for k in range(ANIMATION_FRAMES):
            raw = copy.deepcopy(deep_merge(base, anim.get("params", {})))  # never touch the figure's own params
            try:
                _set_path(raw, anim["param"], _animation_value(anim, k))
            except (KeyError, IndexError, TypeError):
                errors.append(f"{w}.param: {anim['param']!r} is not a parameter of this figure")
                return
            frame_errors: list[str] = []
            params = _validate(tpl["params"], raw, f"{w} frame {k}", frame_errors, tpl)
            if not frame_errors:
                RULES[tpl["id"]](params, frame_errors)
            if frame_errors:
                errors.append(f"{w}: frame {k} ({phase}) is not a valid figure: {frame_errors[0]}")
                return


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
