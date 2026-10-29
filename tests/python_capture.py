# Runs python/15MinData_Visualizations_2026.py unmodified on the sample data and
# records the numbers it plots, for comparison with the JavaScript port.
# Needs pandas, numpy and matplotlib (pd.read_excel is replaced, so no openpyxl).
#
#   python tests/python_capture.py sample-data/SmartMeterTexas_IntervalData_sample.csv python/15MinData_Visualizations_2026.py py_out.json
#   node tests/compare-python.mjs py_out.json
import json, sys, re
import pandas as pd, numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

csv, script, out = sys.argv[1:4]
smt = pd.read_csv(csv, dtype=str)
smt = smt[smt["USAGE_KWH"].notna()]
def frac(t):
    h, m = t.split(":"); return (int(h) * 60 + int(m)) / 1440
template = pd.DataFrame({
    "Date": pd.to_datetime(smt["USAGE_DATE"], format="%m/%d/%Y"),
    "Time": smt["USAGE_START_TIME"].map(frac).astype("float64"),
    "Usage (kWh)": smt["USAGE_KWH"].astype("float64"),
}).reset_index(drop=True)
pd.read_excel = lambda *a, **k: template.copy()

captured = []
def show(*a, **k):
    for num in plt.get_fignums():
        fig = plt.figure(num)
        ax = fig.axes[0] if fig.axes else None
        if ax is None: continue
        title = ax.get_title()
        if "Daily" not in title: continue  # only the time-of-day plots
        lines = {l.get_label(): [list(map(float, l.get_xdata())), list(map(float, l.get_ydata()))]
                 for l in ax.get_lines() if l.get_label() in ("Average Demand", "Peak Demand", "Lowest Nonzero Demand")}
        captured.append({"title": title, "lines": lines})
    plt.close("all")
plt.show = show

src = open(script, encoding="utf-8").read()
src = re.sub(r"data_file_paths = \[.*?\]", 'data_file_paths = ["sample.xlsx"]', src, count=1)
src = src.replace("time_step = 60", "time_step = 15").replace('demand_type = "kVA"', 'demand_type = "kW"')
g = {"__name__": "__main__"}
exec(compile(src, "script", "exec"), g)
p = g["utility_data"]["Power (kW)"]
counts, edges = np.histogram(p, bins=30)
months = [g["utility_data"][g["utility_data"]["month"] == m]["Power (kW)"].median() for m in range(1, 13)]
json.dump({"peak": float(g["peak_power"]), "avg": float(g["avg_power"]), "min": float(g["min_power"]),
           "hist": counts.tolist(), "monthMedians": months, "plots": captured}, open(out, "w"))
print("python plots captured:", len(captured))
