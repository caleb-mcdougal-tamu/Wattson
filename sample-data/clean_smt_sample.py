# Turns a raw Smart Meter Texas 15-minute export into sample-data/SmartMeterTexas_IntervalData_sample.csv:
# replaces the ESIID with a placeholder, removes the repeated hour on the fall-back day,
# fills the blank spring-forward hour, and fixes an isolated estimated zero.
#
#   python sample-data/clean_smt_sample.py <raw export.csv> sample-data/SmartMeterTexas_IntervalData_sample.csv
import csv, sys
from datetime import datetime, timedelta

src, dst = sys.argv[1:3]
rows = list(csv.reader(open(src, newline="")))
hdr, data = rows[0], rows[1:]
ESIID, DATE, REV, START, END, KWH, EST, FLOW = range(8)
log = []

# 1. Placeholder meter ID.
for r in data:
    r[ESIID] = "'00000000000000000"

# 2. Fall back (repeated 1:00-2:00 hour): keep the first pass only. SMT labels the
#    second pass's first interval "2:00 -> 1:15", then repeats 1:15-2:00.
out, i = [], 0
while i < len(data):
    r = data[i]
    if r[START] == "2:00" and r[END] == "1:15":
        log.append(f"{r[DATE]}: removed repeated 1:00-2:00 hour (4 rows) from daylight saving fall back")
        i += 4
        continue
    out.append(r)
    i += 1
data = out

def minutes(t):
    h, m = map(int, t.split(":")); return h * 60 + m

# 3. Spring forward placeholders (blank readings): fill linearly between the readings
#    on either side and mark them estimated.
for i, r in enumerate(data):
    if r[KWH].strip() == "":
        j = i
        while data[j][KWH].strip() == "": j += 1
        k = i
        while data[k][KWH].strip() == "": k -= 1
        a, b = float(data[k][KWH]), float(data[j][KWH])
        frac = (i - k) / (j - k)
        r[KWH] = f"{a + (b - a) * frac:.3f}".rstrip("0").rstrip(".")
        r[EST] = "E"
        log.append(f"{r[DATE]} {r[START]}: filled blank reading with {r[KWH]} (interpolated, marked E)")

# 4. Isolated estimated zero between normal readings: an estimation artifact.
for i in range(1, len(data) - 1):
    r = data[i]
    if r[EST] == "E" and float(r[KWH]) == 0 and float(data[i - 1][KWH]) > 1 and float(data[i + 1][KWH]) > 1:
        r[KWH] = f"{(float(data[i - 1][KWH]) + float(data[i + 1][KWH])) / 2:.3f}"
        log.append(f"{r[DATE]} {r[START]}: replaced estimated 0 with {r[KWH]} (average of neighbours, still marked E)")

# Checks: every day has 96 intervals in order, no duplicates.
from collections import defaultdict
days = defaultdict(list)
for r in data: days[r[DATE]].append(minutes(r[START]))
for d, ms in days.items():
    assert ms == list(range(0, 1440, 15)), d
start = datetime.strptime(data[0][DATE], "%m/%d/%Y")
dates = sorted(datetime.strptime(d, "%m/%d/%Y") for d in days)
assert dates == [start + timedelta(days=n) for n in range(len(dates))]

with open(dst, "w", newline="") as fh:
    w = csv.writer(fh, lineterminator="\n")
    w.writerow(hdr); w.writerows(data)
print(f"{len(data)} rows, {len(days)} days, {sum(r[EST]=='E' for r in data)} estimated")
print("\n".join(log))
