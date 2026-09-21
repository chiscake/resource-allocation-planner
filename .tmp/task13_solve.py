"""
Задача 13 — оптимизация выпуска средств измерений (ЛП).
Решение через scipy.optimize.linprog (HiGHS) + анализ чувствительности
по пунктам а), б), в). Результат сохраняется в task13_results.json
для сравнения в unit-тестах.
"""

import json
from dataclasses import dataclass, asdict

from scipy.optimize import linprog

# ---------------------------------------------------------------------------
# Исходные данные
# ---------------------------------------------------------------------------

PRODUCTS = ["Осциллограф", "Частотомер", "Генератор", "Вольтметр"]
RESOURCES = ["Труд", "Сырье", "Оборудование"]

# Нормы расхода ресурса (строка) на единицу изделия (столбец)
A0 = [
    [7, 2, 2, 6],   # Труд
    [5, 8, 4, 3],   # Сырье
    [2, 4, 1, 8],   # Оборудование
]
B0 = [80, 480, 130]      # Наличие ресурсов
C0 = [3, 4, 3, 1]        # Цена единицы изделия, тыс. р.

TOL = 1e-6


@dataclass
class Solution:
    x: list
    z: float
    resource_usage: list
    slack: list


def solve(c, A, b) -> Solution:
    """max c*x при A*x <= b, x >= 0."""
    res = linprog([-v for v in c], A_ub=A, b_ub=b,
                   bounds=[(0, None)] * len(c), method="highs")
    if not res.success:
        raise RuntimeError(f"LP не решена: {res.message}")
    x = [round(v, 6) for v in res.x]
    z = round(-res.fun, 6)
    usage = [round(sum(A[i][j] * x[j] for j in range(len(x))), 6)
              for i in range(len(A))]
    slack = [round(b[i] - usage[i], 6) for i in range(len(b))]
    return Solution(x=x, z=z, resource_usage=usage, slack=slack)


def shadow_prices(c, A, b) -> list:
    """Двойственные оценки (теневые цены) ограничений через HiGHS marginals."""
    res = linprog([-v for v in c], A_ub=A, b_ub=b,
                   bounds=[(0, None)] * len(c), method="highs")
    # marginals для ineqlin — со знаком минус к теневой цене задачи максимизации
    return [round(-m, 6) for m in res.ineqlin.marginals]


def main():
    results = {}

    base = solve(C0, A0, B0)
    duals = shadow_prices(C0, A0, B0)
    critical = [RESOURCES[i] for i, d in enumerate(duals) if abs(d) > TOL]
    non_critical = [RESOURCES[i] for i, d in enumerate(duals) if abs(d) <= TOL]

    results["base_solution"] = {
        "x": dict(zip(PRODUCTS, base.x)),
        "Z_max": base.z,
        "resource_usage": dict(zip(RESOURCES, base.resource_usage)),
        "resource_slack": dict(zip(RESOURCES, base.slack)),
        "shadow_prices": dict(zip(RESOURCES, duals)),
        "critical_resources": critical,
        "non_critical_resources": non_critical,
    }

    # -- а) изменение запаса ресурса на +-10% -------------------------------
    part_a = {}
    for i, rname in enumerate(RESOURCES):
        entry = {}
        for pct, lbl in [(1.10, "+10%"), (0.90, "-10%")]:
            b = list(B0)
            b[i] = round(B0[i] * pct, 6)
            sol = solve(C0, A0, b)
            dZ = round(sol.z - base.z, 6)
            entry[lbl] = {
                "b_new": b[i],
                "x": dict(zip(PRODUCTS, sol.x)),
                "Z": sol.z,
                "dZ": dZ,
                "shadow_price_realized": round(dZ / (b[i] - B0[i]), 6) if abs(b[i]-B0[i]) > TOL else 0.0,
            }
        part_a[rname] = entry
    results["part_a_resource_change"] = part_a

    # -- б) снижение удельного расхода ресурса на 10% (модернизация) --------
    part_b = {}
    for i, rname in enumerate(RESOURCES):
        A = [row[:] for row in A0]
        A[i] = [round(v * 0.9, 6) for v in A[i]]
        sol = solve(C0, A, B0)
        dZ = round(sol.z - base.z, 6)
        part_b[rname] = {
            "x": dict(zip(PRODUCTS, sol.x)),
            "Z": sol.z,
            "dZ_allowable_modernization_price": dZ,
        }
    results["part_b_modernization"] = part_b

    # -- в) изменение цены изделия на +-15% ----------------------------------
    part_c = {}
    for j, pname in enumerate(PRODUCTS):
        entry = {}
        for pct, lbl in [(1.15, "+15%"), (0.85, "-15%")]:
            c = list(C0)
            c[j] = round(C0[j] * pct, 6)
            sol = solve(c, A0, B0)
            entry[lbl] = {
                "c_new": c[j],
                "x": dict(zip(PRODUCTS, sol.x)),
                "Z": sol.z,
                "plan_changed": any(
                    abs(sol.x[k] - base.x[k]) > TOL for k in range(len(PRODUCTS))
                ),
            }
        part_c[pname] = entry
    results["part_c_price_change"] = part_c

    with open("task13_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
