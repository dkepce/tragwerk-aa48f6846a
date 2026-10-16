"""Builds js/tables.js (material tables for Tragwerk).  Run:  python tools/build_tables.py

Where the numbers come from (kept here so a later session can re-check them):
- I-sections (IPE, HEA, HEB, HEM): the standard dimensions h, b, tw, tf, r (EN 10365) are listed below; A, I, W, Wpl, i
  are CALCULATED here with the usual formulas including the root fillets. Checked against manufacturer tables
  (published IPE/HE data sheets): deviation <= 0.05 % for A, I, W, Wpl. Mass = A * 7850 kg/m3 (within 0.3 % of tables).
- UPN 100..320: values copied from the supplier data sheet "Technische Daten Profile UPN" (stad.fr, as of 13 Oct 2026).
  UPN 80 and 350..400 are left out (damaged / on other pages of the sheet).
- Concrete: EN 1992-1-1 Table 3.1 as reproduced on cdn.eurocodeapplied.com (concrete design properties).
- Timber: DIN EN 338:2016-07 (C24, C30) and DIN EN 14080:2013-09 (GL24c/h, GL28c/h), as printed in the design aid
  "Bemessungs- und Konstruktionshilfen fuer Holztafeln nach DIN EN 1995-1-1" (FH Bielefeld, Mai 2020).
- Steel grades fy: EN 1993-1-1 Table 3.1 (values agree in all sources checked; fu differs between editions for S355, so it is not listed).
- Reinforcing bars: calculated (area = pi d^2 / 4, mass with 7850 kg/m3); B500: fyk = 500 N/mm2, Es = 200 GPa (EN 1992-1-1).
"""
import json, math, os

DIMS = [["IPE80", 80.0, 46.0, 3.8, 5.2, 5.0], ["IPE100", 100.0, 55.0, 4.1, 5.7, 7.0], ["IPE120", 120.0, 64.0, 4.4, 6.3, 7.0], ["IPE140", 140.0, 73.0, 4.7, 6.9, 7.0], ["IPE160", 160.0, 82.0, 5.0, 7.4, 9.0], ["IPE180", 180.0, 91.0, 5.3, 8.0, 9.0], ["IPE200", 200.0, 100.0, 5.6, 8.5, 12.0], ["IPE220", 220.0, 110.0, 5.9, 9.2, 12.0], ["IPE240", 240.0, 120.0, 6.2, 9.8, 15.0], ["IPE270", 270.0, 135.0, 6.6, 10.2, 15.0], ["IPE300", 300.0, 150.0, 7.1, 10.7, 15.0], ["IPE330", 330.0, 160.0, 7.5, 11.5, 18.0], ["IPE360", 360.0, 170.0, 8.0, 12.7, 18.0], ["IPE400", 400.0, 180.0, 8.6, 13.5, 21.0], ["IPE450", 450.0, 190.0, 9.4, 14.6, 21.0], ["IPE500", 500.0, 200.0, 10.2, 16.0, 21.0], ["IPE550", 550.0, 210.0, 11.1, 17.2, 24.0], ["IPE600", 600.0, 220.0, 12.0, 19.0, 24.0], ["HEA100", 96.0, 100.0, 5.0, 8.0, 12.0], ["HEA120", 114.0, 120.0, 5.0, 8.0, 12.0], ["HEA140", 133.0, 140.0, 5.5, 8.5, 12.0], ["HEA160", 152.0, 160.0, 6.0, 9.0, 15.0], ["HEA180", 171.0, 180.0, 6.0, 9.5, 15.0], ["HEA200", 190.0, 200.0, 6.5, 10.0, 18.0], ["HEA220", 210.0, 220.0, 7.0, 11.0, 18.0], ["HEA240", 230.0, 240.0, 7.5, 12.0, 21.0], ["HEA260", 250.0, 260.0, 7.5, 12.5, 24.0], ["HEA280", 270.0, 280.0, 8.0, 13.0, 24.0], ["HEA300", 290.0, 300.0, 8.5, 14.0, 27.0], ["HEA320", 310.0, 300.0, 9.0, 15.5, 27.0], ["HEA340", 330.0, 300.0, 9.5, 16.5, 27.0], ["HEA360", 350.0, 300.0, 10.0, 17.5, 27.0], ["HEA400", 390.0, 300.0, 11.0, 19.0, 27.0], ["HEA450", 440.0, 300.0, 11.5, 21.0, 27.0], ["HEA500", 490.0, 300.0, 12.0, 23.0, 27.0], ["HEA550", 540.0, 300.0, 12.5, 24.0, 27.0], ["HEA600", 590.0, 300.0, 13.0, 25.0, 27.0], ["HEA650", 640.0, 300.0, 13.5, 26.0, 27.0], ["HEA700", 690.0, 300.0, 14.5, 27.0, 27.0], ["HEA800", 790.0, 300.0, 15.0, 28.0, 30.0], ["HEA900", 890.0, 300.0, 16.0, 30.0, 30.0], ["HEA1000", 990.0, 300.0, 16.5, 31.0, 30.0], ["HEB100", 100.0, 100.0, 6.0, 10.0, 12.0], ["HEB120", 120.0, 120.0, 6.5, 11.0, 12.0], ["HEB140", 140.0, 140.0, 7.0, 12.0, 12.0], ["HEB160", 160.0, 160.0, 8.0, 13.0, 15.0], ["HEB180", 180.0, 180.0, 8.5, 14.0, 15.0], ["HEB200", 200.0, 200.0, 9.0, 15.0, 18.0], ["HEB220", 220.0, 220.0, 9.5, 16.0, 18.0], ["HEB240", 240.0, 240.0, 10.0, 17.0, 21.0], ["HEB260", 260.0, 260.0, 10.0, 17.5, 24.0], ["HEB280", 280.0, 280.0, 10.5, 18.0, 24.0], ["HEB300", 300.0, 300.0, 11.0, 19.0, 27.0], ["HEB320", 320.0, 300.0, 11.5, 20.5, 27.0], ["HEB340", 340.0, 300.0, 12.0, 21.5, 27.0], ["HEB360", 360.0, 300.0, 12.5, 22.5, 27.0], ["HEB400", 400.0, 300.0, 13.5, 24.0, 27.0], ["HEB450", 450.0, 300.0, 14.0, 26.0, 27.0], ["HEB500", 500.0, 300.0, 14.5, 28.0, 27.0], ["HEB550", 550.0, 300.0, 15.0, 29.0, 27.0], ["HEB600", 600.0, 300.0, 15.5, 30.0, 27.0], ["HEB650", 650.0, 300.0, 16.0, 31.0, 27.0], ["HEB700", 700.0, 300.0, 17.0, 32.0, 27.0], ["HEB800", 800.0, 300.0, 17.5, 33.0, 30.0], ["HEB900", 900.0, 300.0, 18.5, 35.0, 30.0], ["HEB1000", 1000.0, 300.0, 19.0, 36.0, 30.0], ["HEM100", 120.0, 106.0, 12.0, 20.0, 12.0], ["HEM120", 140.0, 126.0, 12.5, 21.0, 12.0], ["HEM140", 160.0, 146.0, 13.0, 22.0, 12.0], ["HEM160", 180.0, 166.0, 14.0, 23.0, 15.0], ["HEM180", 200.0, 186.0, 14.5, 24.0, 15.0], ["HEM200", 220.0, 206.0, 15.0, 25.0, 18.0], ["HEM220", 240.0, 226.0, 15.5, 26.0, 18.0], ["HEM240", 270.0, 248.0, 18.0, 32.0, 21.0], ["HEM260", 290.0, 268.0, 18.0, 32.5, 24.0], ["HEM280", 310.0, 288.0, 18.5, 33.0, 24.0], ["HEM300", 340.0, 310.0, 21.0, 39.0, 27.0], ["HEM320", 359.0, 309.0, 21.0, 40.0, 27.0], ["HEM340", 377.0, 309.0, 21.0, 40.0, 27.0], ["HEM360", 395.0, 308.0, 21.0, 40.0, 27.0], ["HEM400", 432.0, 307.0, 21.0, 40.0, 27.0], ["HEM450", 478.0, 307.0, 21.0, 40.0, 27.0], ["HEM500", 524.0, 306.0, 21.0, 40.0, 27.0], ["HEM550", 572.0, 306.0, 21.0, 40.0, 27.0], ["HEM600", 620.0, 305.0, 21.0, 40.0, 27.0], ["HEM650", 668.0, 305.0, 21.0, 40.0, 27.0], ["HEM700", 716.0, 304.0, 21.0, 40.0, 27.0], ["HEM800", 814.0, 303.0, 21.0, 40.0, 30.0], ["HEM900", 910.0, 302.0, 21.0, 40.0, 30.0], ["HEM1000", 1008.0, 302.0, 21.0, 40.0, 30.0]]   # name, h, b, tw, tf, r  [mm]

UPN = [  # name, h, b, tw, tf, r [mm], m [kg/m], A [cm2], Iy [cm4], Wely, Wply [cm3], Iz [cm4], Welz, Wplz [cm3]
 ["UPN100",100,50,6,8.5,9,10.6,13.5,206,41.2,49.0,29.3,8.49,16.2],
 ["UPN120",120,55,7,9,9,13.3,17.0,364,60.7,72.6,43.2,11.1,21.2],
 ["UPN140",140,60,7,10,10,16.0,20.4,605,86.4,103,62.7,14.8,28.3],
 ["UPN160",160,65,7.5,10.5,11,18.8,24.0,925,116,138,85.3,18.3,35.2],
 ["UPN180",180,70,8,11,11,22.0,28.0,1350,150,179,114,22.4,42.9],
 ["UPN200",200,75,8.5,11.5,12,25.3,32.2,1910,191,228,148,27.0,51.8],
 ["UPN220",220,80,9,12.5,13,29.4,37.4,2690,245,292,197,33.6,64.1],
 ["UPN240",240,85,9.5,13,13,33.2,42.3,3600,300,358,248,39.6,75.7],
 ["UPN260",260,90,10,14,14,37.9,48.3,4820,371,442,317,47.7,91.6],
 ["UPN280",280,95,10,15,15,41.8,53.3,6280,448,532,399,57.2,109],
 ["UPN300",300,100,10,16,16,46.2,58.8,8030,535,632,495,67.8,130],
 ["UPN320",320,100,14,17.5,18,59.5,75.8,10870,679,826,597,80.6,152],
]

CONCRETE = {"classes": ["C12/15", "C16/20", "C20/25", "C25/30", "C30/37", "C35/45", "C40/50", "C45/55", "C50/60", "C55/67", "C60/75", "C70/85", "C80/95", "C90/105"], "fck": [12.0, 16.0, 20.0, 25.0, 30.0, 35.0, 40.0, 45.0, 50.0, 55.0, 60.0, 70.0, 80.0, 90.0], "fck,cube": [15.0, 20.0, 25.0, 30.0, 37.0, 45.0, 50.0, 55.0, 60.0, 67.0, 75.0, 85.0, 95.0, 105.0], "fcm": [20.0, 24.0, 28.0, 33.0, 38.0, 43.0, 48.0, 53.0, 58.0, 63.0, 68.0, 78.0, 88.0, 98.0], "fctm": [1.57, 1.9, 2.21, 2.56, 2.9, 3.21, 3.51, 3.8, 4.07, 4.21, 4.35, 4.61, 4.84, 5.04], "Ecm": [27085.0, 28608.0, 29962.0, 31476.0, 32837.0, 34077.0, 35220.0, 36283.0, 37278.0, 38214.0, 39100.0, 40743.0, 42244.0, 43631.0]}

# timber: value per class; None = not given in the source
TIMBER_CLASSES = ["C24", "C30", "GL24c", "GL24h", "GL28c", "GL28h"]
TIMBER_ROWS = [  # key, label, unit, values in the order of TIMBER_CLASSES
 ["fm",   "Biegung  f_m,k",                    "N/mm²", [24.0, 30.0, 24.0, 24.0, 28.0, 28.0]],
 ["ft0",  "Zug parallel  f_t,0,k",             "N/mm²", [14.5, 19.0, 17.0, 19.2, 19.5, 22.3]],
 ["ft90", "Zug rechtwinklig  f_t,90,k",        "N/mm²", [0.4, 0.4, 0.5, 0.5, 0.5, 0.5]],
 ["fc0",  "Druck parallel  f_c,0,k",           "N/mm²", [21.0, 24.0, 21.5, 24.0, 24.0, 28.0]],
 ["fc90", "Druck rechtwinklig  f_c,90,k",      "N/mm²", [2.5, 2.7, 2.5, 2.5, 2.5, 2.5]],
 ["fv",   "Schub und Torsion  f_v,k",          "N/mm²", [4.0, 4.0, 3.5, 3.5, 3.5, 3.5]],
 ["fr",   "Rollschub  f_R,k",                  "N/mm²", [None, None, 1.2, 1.2, 1.2, 1.2]],
 ["E0",   "E-Modul parallel  E_0,mean",        "N/mm²", [11000, 12000, 11000, 11500, 12500, 12600]],
 ["E90",  "E-Modul rechtwinklig  E_90,mean",   "N/mm²", [370, 400, 300, 300, 300, 300]],
 ["G",    "Schubmodul  G_mean",                "N/mm²", [690, 750, 650, 650, 650, 650]],
 ["rho",  "Rohdichte  ρ_k",                    "kg/m³", [350, 380, 365, 385, 390, 425]],
]

STEEL_GRADES = [  # name, fy for t <= 40 mm, fy for 40 < t <= 80 mm [N/mm2]
 ["S235", 235, 215], ["S275", 275, 255], ["S355", 355, 335],
]
REBAR_D = [6, 8, 10, 12, 14, 16, 20, 25, 28, 32, 40]

def spandrel(r):
    A = r * r * (1 - math.pi / 4); n = 20000; dx = r / n; Sy = 0.0; I0 = 0.0
    for i in range(n):
        x = (i + 0.5) * dx; y0 = r - math.sqrt(max(r * r - (r - x) ** 2, 0.0))
        Sy += y0 * y0 / 2 * dx; I0 += y0 ** 3 / 3 * dx
    cy = Sy / A
    return A, cy, I0 - A * cy * cy

def i_section(h, b, tw, tf, r):
    hw = h - 2 * tf; Af, c, Ic = spandrel(r)
    A = 2 * b * tf + hw * tw + 4 * Af
    dy = hw / 2 - c; dz = tw / 2 + c
    Iy = b * h ** 3 / 12 - (b - tw) * hw ** 3 / 12 + 4 * (Ic + Af * dy ** 2)
    Iz = 2 * tf * b ** 3 / 12 + hw * tw ** 3 / 12 + 4 * (Ic + Af * dz ** 2)
    return dict(A=A, Iy=Iy, Iz=Iz, Wely=Iy / (h / 2), Welz=Iz / (b / 2),
                Wply=b * tf * (h - tf) + tw * hw ** 2 / 4 + 4 * Af * dy,
                Wplz=tf * b ** 2 / 2 + hw * tw ** 2 / 4 + 4 * Af * dz)

def r_(v, d): return round(v, d)

profiles = []
for name, h, b, tw, tf, r in DIMS:
    p = i_section(h, b, tw, tf, r)
    A = p["A"] / 100.0            # cm2
    Iy = p["Iy"] / 1e4; Iz = p["Iz"] / 1e4
    profiles.append([name, name.rstrip("0123456789"), h, b, tw, tf, r, r_(A * 0.785, 1), r_(A, 2),
                     r_(Iy, 1), r_(p["Wely"] / 1e3, 1), r_(p["Wply"] / 1e3, 1),
                     r_(Iz, 1), r_(p["Welz"] / 1e3, 1), r_(p["Wplz"] / 1e3, 1),
                     r_(math.sqrt(Iy / A), 2), r_(math.sqrt(Iz / A), 2)])
for u in UPN:
    name, h, b, tw, tf, r, m, A, Iy, Wy, Wply, Iz, Wz, Wplz = u
    profiles.append([name, "UPN", h, b, tw, tf, r, m, A, Iy, Wy, Wply, Iz, Wz, Wplz, r_(math.sqrt(Iy / A), 2), r_(math.sqrt(Iz / A), 2)])

rebar = [[d, r_(math.pi * d * d / 400, 2), r_(math.pi * d * d / 400 * 0.785, 3)] for d in REBAR_D]

data = {
  "steel": {"cols": ["name", "series", "h", "b", "tw", "tf", "r", "m", "A", "Iy", "Wely", "Wply", "Iz", "Welz", "Wplz", "iy", "iz"],
            "profiles": profiles, "grades": STEEL_GRADES, "E": 210000, "G": 81000},
  "timber": {"classes": TIMBER_CLASSES, "rows": TIMBER_ROWS},
  "concrete": CONCRETE,
  "rebar": {"fyk": 500, "Es": 200000, "gammaS": 1.15, "bars": rebar},
}
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "tables.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("/* GENERATED by tools/build_tables.py - do not edit by hand. Sources are listed at the top of that script. */\n")
    f.write("window.APP = window.APP || {};\nwindow.APP.tables = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("wrote", out, len(profiles), "profiles")
