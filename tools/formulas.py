"""Independent recomputation of calculation questions.

A calculation question declares which formula it uses and its inputs:

    "calculation": {
      "formula": "ohms_law_current",
      "inputs": {"U": [12, "V"], "R": [4.7, "kΩ"]},
      "answer": [2.55, "mA"],
      "answer_symbol": "I",
      "sig_figs": 3
    }

The verifier recomputes the answer from the inputs with the functions below (not
with anything the author or a language model wrote), rounds it as declared, and
checks that the correct option, the declared answer and the visual agree, and that
no distractor coincides with the answer.
"""
from __future__ import annotations

import math
from typing import Any, Callable

C_LIGHT = 299_792_458.0  # m/s

BASE_UNITS = {
    "V": "V", "A": "A", "Ω": "Ω", "W": "W", "Hz": "Hz", "F": "F", "H": "H", "s": "s", "m": "m",
    "C": "C", "J": "J", "Wh": "Wh", "Ah": "Ah", "dB": "dB", "%": "%", "°": "°", "S": "S",
}
PREFIX = {"G": 1e9, "M": 1e6, "k": 1e3, "m": 1e-3, "µ": 1e-6, "n": 1e-9, "p": 1e-12, "c": 1e-2}
EXTRA = {"h": (3600.0, "s"), "min": (60.0, "s"), "mAh": (1e-3, "Ah"), "kWh": (1e3, "Wh")}


def to_si(value: float, unit: str) -> tuple[float, str]:
    if unit in BASE_UNITS:
        return value, BASE_UNITS[unit]
    if unit in EXTRA:
        f, base = EXTRA[unit]
        return value * f, base
    if len(unit) > 1 and unit[0] in PREFIX and unit[1:] in BASE_UNITS:
        return value * PREFIX[unit[0]], BASE_UNITS[unit[1:]]
    raise ValueError(f"unknown unit {unit!r}")


def from_si(value: float, unit: str) -> float:
    factor, _ = to_si(1.0, unit)
    return value / factor


def round_sig(x: float, sig: int) -> float:
    if x == 0:
        return 0.0
    return round(x, sig - 1 - int(math.floor(math.log10(abs(x)))))


def _sum(*xs: float) -> float:
    return sum(xs)


def _recip_sum(*xs: float) -> float:
    return 1 / sum(1 / x for x in xs)


# name -> (input symbols (None = variadic list), output base unit, function, human description)
FORMULAS: dict[str, tuple[list[str] | None, str, Callable[..., float], str]] = {
    "ohms_law_current": (["U", "R"], "A", lambda U, R: U / R, "I = U / R"),
    "ohms_law_voltage": (["I", "R"], "V", lambda I, R: I * R, "U = I · R"),
    "ohms_law_resistance": (["U", "I"], "Ω", lambda U, I: U / I, "R = U / I"),
    "power_ui": (["U", "I"], "W", lambda U, I: U * I, "P = U · I"),
    "power_i2r": (["I", "R"], "W", lambda I, R: I * I * R, "P = I² · R"),
    "power_u2r": (["U", "R"], "W", lambda U, R: U * U / R, "P = U² / R"),
    "current_from_power": (["P", "U"], "A", lambda P, U: P / U, "I = P / U"),
    "series_resistance": (None, "Ω", _sum, "R = R1 + R2 + …"),
    "parallel_resistance": (None, "Ω", _recip_sum, "1/R = 1/R1 + 1/R2 + …"),
    "parallel_capacitance": (None, "F", _sum, "C = C1 + C2 + …"),
    "series_capacitance": (None, "F", _recip_sum, "1/C = 1/C1 + 1/C2 + …"),
    "series_inductance": (None, "H", _sum, "L = L1 + L2 + … (no mutual coupling)"),
    "voltage_divider": (["U", "R1", "R2"], "V", lambda U, R1, R2: U * R2 / (R1 + R2), "U2 = U · R2 / (R1 + R2)"),
    "charge": (["I", "t"], "C", lambda I, t: I * t, "Q = I · t"),
    "energy": (["P", "t"], "J", lambda P, t: P * t, "W = P · t"),
    "capacitive_reactance": (["f", "C"], "Ω", lambda f, C: 1 / (2 * math.pi * f * C), "X_C = 1 / (2πfC)"),
    "inductive_reactance": (["f", "L"], "Ω", lambda f, L: 2 * math.pi * f * L, "X_L = 2πfL"),
    "resonance_frequency": (["L", "C"], "Hz", lambda L, C: 1 / (2 * math.pi * math.sqrt(L * C)), "f = 1 / (2π√(LC))"),
    "time_constant_rc": (["R", "C"], "s", lambda R, C: R * C, "τ = R · C"),
    "time_constant_lr": (["L", "R"], "s", lambda L, R: L / R, "τ = L / R"),
    "period": (["f"], "s", lambda f: 1 / f, "T = 1 / f"),
    "frequency_from_period": (["T"], "Hz", lambda T: 1 / T, "f = 1 / T"),
    "wavelength": (["f"], "m", lambda f: C_LIGHT / f, "λ = c / f"),
    "wavelength_approx": (["f"], "m", lambda f: 3e8 / f, "λ ≈ 300 / f(MHz) (c ≈ 3·10⁸ m/s)"),
    "rms_from_peak": (["U_p"], "V", lambda U_p: U_p / math.sqrt(2), "U_eff = U_p / √2 (sine)"),
    "peak_from_rms": (["U_eff"], "V", lambda U_eff: U_eff * math.sqrt(2), "U_p = U_eff · √2 (sine)"),
    "peak_to_peak": (["U_p"], "V", lambda U_p: 2 * U_p, "U_pp = 2 · U_p"),
    "db_power_ratio": (["P1", "P2"], "dB", lambda P1, P2: 10 * math.log10(P2 / P1), "10 · log10(P2 / P1)"),
    "if_difference": (["f_RF", "f_LO"], "Hz", lambda f_RF, f_LO: abs(f_LO - f_RF), "f_MF = |f_LO − f_RF|"),
    "image_frequency_high_lo": (["f_RF", "f_IF"], "Hz", lambda f_RF, f_IF: f_RF + 2 * f_IF,
                                "f_speil = f_RF + 2·f_MF (LO over signalet)"),
    "fm_carson_bandwidth": (["deviation", "f_mod"], "Hz", lambda deviation, f_mod: 2 * (deviation + f_mod),
                            "B ≈ 2 (Δf + f_mod)"),
    "modulation_index": (["deviation", "f_mod"], "", lambda deviation, f_mod: deviation / f_mod, "m = Δf / f_mod"),
    "efficiency_percent": (["P_out", "P_in"], "%", lambda P_out, P_in: 100 * P_out / P_in, "η = P_ut / P_inn · 100 %"),
    "harmonic_frequency": (["f", "n"], "Hz", lambda f, n: n * f, "f_n = n · f"),
    # the book's rule of thumb for the radio horizon: d (km) ≈ 4 · √h (m), per station
    "radio_range": (["h1", "h2"], "m", lambda h1, h2: 4000 * (math.sqrt(h1) + math.sqrt(h2)),
                    "d ≈ 4 · (√h1 + √h2) km, h i meter"),
    # a converter with n bits has 2^n levels
    "quantization_levels": (["n"], "", lambda n: 2 ** n, "N = 2^n"),
    "quantization_step": (["U_range", "n"], "V", lambda U_range, n: U_range / 2 ** n, "ΔU = U_område / 2^n"),
    "nyquist_frequency": (["f_s"], "Hz", lambda f_s: f_s / 2, "f_N = f_s / 2"),
    "db_voltage_ratio": (["U1", "U2"], "dB", lambda U1, U2: 20 * math.log10(U2 / U1),
                         "20 · log10(U2 / U1) (same impedance)"),
    "power_from_dbw": (["L"], "W", lambda L: 10 ** (L / 10), "P = 1 W · 10^(L/10) (L in dBW)"),
    "power_gain_db": (["P", "G"], "W", lambda P, G: P * 10 ** (G / 10), "P_ut = P_inn · 10^(G/10) (G in dB)"),
    "power_from_peak_voltage": (["U_p", "R"], "W", lambda U_p, R: U_p * U_p / (2 * R),
                                "P = U_p² / (2R) (sine)"),
    "ppm_offset": (["f", "ppm"], "Hz", lambda f, ppm: f * ppm / 1e6, "Δf = f · ppm / 10⁶"),
    # effective radiated power from the power into the antenna and its gain over a dipole (dBd)
    "erp_dbd": (["P", "G"], "W", lambda P, G: P * 10 ** (G / 10), "ERP = P · 10^(G/10), G i dBd"),
    "turns_impedance": (["Z1", "n1", "n2"], "Ω", lambda Z1, n1, n2: Z1 * (n2 / n1) ** 2, "Z2 = Z1 · (n2 / n1)²"),
    "quarter_wave_transformer": (["Z0", "Z_L"], "Ω", lambda Z0, Z_L: Z0 ** 2 / Z_L,
                                 "Z_inn = Z0² / Z_ut (kvartbølgetransformator)"),
    "swr_from_voltages": (["U_fwd", "U_ref"], "", lambda U_fwd, U_ref: (U_fwd + U_ref) / (U_fwd - U_ref),
                          "SWR = (U_forover + U_tilbake) / (U_forover − U_tilbake)"),
    "power_after_loss": (["P", "L"], "W", lambda P, L: P * 10 ** (-L / 10), "P_ut = P_inn · 10^(−L/10), L i dB"),
    "cable_length": (["f", "k", "part"], "m", lambda f, k, part: 3e8 / f * part * k,
                     "l = (c / f) · andel av bølgelengden · k (c ≈ 3·10⁸ m/s)"),
    "dipole_length": (["f"], "m", lambda f: 143e6 / f, "L ≈ 143 / f(MHz) (halvbølgedipol, k = 0,95)"),
}


def parse_quantity(spec: Any, where: str) -> tuple[float, str]:
    if (not isinstance(spec, list) or len(spec) != 2 or isinstance(spec[0], bool)
            or not isinstance(spec[0], (int, float)) or not isinstance(spec[1], str)):
        raise ValueError(f"{where}: expected [number, \"unit\"]")
    return float(spec[0]), spec[1]


def _si_or_plain(value: float, unit: str) -> float:
    if unit in ("", "-"):
        return value
    return to_si(value, unit)[0]


def compute(calc: dict[str, Any]) -> tuple[float, str]:
    """Return (answer in the declared answer unit, unrounded) or raise ValueError."""
    name = calc.get("formula")
    if name not in FORMULAS:
        raise ValueError(f"unknown formula {name!r}; known: {', '.join(sorted(FORMULAS))}")
    symbols, out_unit, fn, _ = FORMULAS[name]
    inputs = calc.get("inputs")
    if not isinstance(inputs, dict) or not inputs:
        raise ValueError("calculation.inputs must be an object")
    si = {k: _si_or_plain(*parse_quantity(v, f"inputs.{k}")) for k, v in inputs.items()}
    if symbols is None:
        result = fn(*si.values())
    else:
        missing = set(symbols) - set(si)
        extra = set(si) - set(symbols)
        if missing or extra:
            raise ValueError(f"formula {name} needs inputs {symbols}; missing {sorted(missing)}, extra {sorted(extra)}")
        result = fn(**{s: si[s] for s in symbols})
    ans_value, ans_unit = parse_quantity(calc.get("answer"), "answer")
    if out_unit in ("", "dB", "%", "°"):
        if ans_unit not in (out_unit, ""):
            raise ValueError(f"answer unit {ans_unit!r} does not match formula output {out_unit!r}")
        return result, ans_unit
    _, base = to_si(1.0, ans_unit)
    if base != out_unit:
        raise ValueError(f"answer unit {ans_unit!r} is not a {out_unit} unit")
    return from_si(result, ans_unit), ans_unit


def describe(name: str) -> str:
    return FORMULAS[name][3] if name in FORMULAS else name
