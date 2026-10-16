# Tragwerk

A small installable web app (PWA) for statics: place supports, loads and members, get the reactions and internal forces **with the calculation steps shown**. UI language is German (Festlager, Loslager, Einspannung, Gelenk, Einzellast, Streckenlast, Fachwerk, Stabkräfte …).

Plain HTML/CSS/JS, no build step, no server. Same pattern as Phoenix / LabGorilla / Hedgehog / Taupunkt.

## Run locally

```
python -m http.server 8140
```
then open http://localhost:8140/ (the service worker and install need http, not `file://`). Use a fresh port when the browser caches hard.

## What it does (version 1)

- **Träger:** horizontal beam, Festlager / Loslager / Einspannung / Gelenke, Einzellast (vertical + horizontal), Streckenlast (constant or linear), Moment. Output: Auflagerkräfte, N-, Q-, M-diagrams, max M, Rechenweg. Gerberträger work through the Gelenk conditions.
- **Träger sign modes:** "Gestrichelte Faser" (unten/oben) and "x von" (links/rechts), as in the German lecture scripts. Raw values (`B.internal`) are always for *Faser unten, x von links*; `B.signs(sys)` gives the factors for Q and M (N never changes). Diagrams, tables and Rechenweg use the chosen mode; the rule is: z points to the dashed fibre, positive M = tension there, positive N = tension, positive Q acts in +z at the positive Schnittufer (reversed at the negative one).
- **Schnitte:** tool/table entries `sys.cuts[{id,x}]` (x stored from the left, shown in the chosen x direction). The Rechenweg shows each cut worked out on the piece next to the origin of x, checked against the other piece (`B.cut`), plus a sketch of the positive N/Q/M on both cut faces (`B.sketch`, in `beam_ui.js`).
- **Bibliothek:** "★ In Bibliothek speichern" stores a copy in `D.library[{id,name,type,saved,sys}]` (part of the `.trw` file); the tab shows cards, "Öffnen" adds a fresh copy to the systems.
- **Tabellen:** steel profiles IPE/HEA/HEB/HEM (section values calculated from standard dimensions, checked against manufacturer data to 0,05 %) and UPN 100-320 (supplier data sheet), steel grades fy, timber classes C24/C30/GL24/GL28, concrete classes and B500 bar areas, with filters by required W/I. Look-up only; sources are shown under each table and in `tools/build_tables.py`.
- **Vorbemessung** (first sub-tab of Tabellen): takes max |M| and max |Q| of the current Träger (editable), applies a visible gamma_F, and lists the lightest steel profiles (Wpl or Wel, fy by flange thickness, gamma_M0, shear check with Av per EN 1993-1-1 6.2.6) or the smallest timber sections (fm,d = kmod*fm,k/gamma_M, bending and shear without k_cr, h/b limit). Not checked: deflection, buckling/LTB, section class, M-V interaction, national annex details. Code in `js/tables_ui.js` (`pvResult`).
- **Rahmen** (`js/frame.js`, `js/frame_ui.js`): 2D frames with the direct stiffness method (Euler-Bernoulli elements, member-end hinges by static condensation, nodal and uniform member loads, optional self weight), so statically indeterminate frames work too. Theory I order, or Theory II order with the geometric stiffness matrix (iterated), global sway imperfection phi = phi0*alpha_h*alpha_m and local bow e0 (equivalent loads, EN 1993-1-1 5.3.2, bow only if lambda-bar > 0,5*sqrt(A fy/N_Ed)), critical load factor alpha_cr (Sturm count + bisection), and class 1/2 cross-section checks with N-M interaction (6.2.9). Checked against hand cases: cantilever deflection, simply supported beam, alpha_cr of a cantilever column (6,293 vs 6,293), second-order amplification.
- **Stabilität tab** (`js/stability.js`, `js/stability_ui.js`): Knicknachweis am Ersatzstab (EN 1993-1-1 6.3.1, curves from Table 6.2, y and z axis), table of the compressed members of the current frame (L_cr,y from alpha_cr or L or beta*L, L_cr,z = beta_z*L), and the guide to the methods (a), (b), (c) with buttons that set the current frame to (b) or (c). Not included: N+M interaction (6.3.3), lateral-torsional buckling, 3D analysis (method a).
- **Fachwerk:** nodes, members, Festlager / Loslager (reaction vertical or horizontal), nodal loads. Output: Abzählkriterium (m + r = 2k), Auflagerkräfte, Stabkräfte (Zug / Druck / Nullstab) and a step-by-step Knotenpunktverfahren.
- Statically **indeterminate** or unstable systems are detected and reported (degree shown), but not solved yet.
- Drawing and tables are always in sync: click/drag in the drawing, or type numbers in the tables.

Sign conventions are listed in the app's *Info* tab (loads ↓ positive, A<sub>z</sub> ↑ positive, M sagging positive, Zug positive).

## Data

Everything lives in `APP.D = { systems: [...], cur }` and is saved to the browser (localStorage) and optionally into one JSON file `Tragwerk.trw` in a folder the user picks (File System Access API: Chrome / Edge / Brave with the flag). File format: `{ app: "tragwerk", version, saved, settings, data }`. `fixData()` in `js/store.js` calls `beam.fix` / `truss.fix` so old files keep opening when fields are added.

A system is `{ id, type: "beam"|"truss", name, ... }`:
- beam: `L, snap, supports[{id,t:fest|los|einsp,x}], hinges[{id,x}], loads[{id,t:"F",x,fz,fx} | {t:"q",a,b,q1,q2} | {t:"M",x,m}]`
- truss: `W, H, snap, nodes[{id,x,z}], members[{id,a,b}], supports[{id,n,t:fest|los,dir:z|x}], loads[{id,n,fx,fz}]` (z points up)

## Files

| File | What |
|---|---|
| `index.html`, `style.css` | page shell and look (colours are CSS variables) |
| `manifest.webmanifest`, `sw.js`, `icons/` | installable app, offline cache (network first) |
| `js/util.js` | helpers: `U.fmt` (German numbers), `U.parse`, `U.solve` (Gauss solver), toast |
| `js/beam.js` | beam maths: reactions, internal forces N/Q/M, extremes, Rechenweg text (no DOM) |
| `js/truss.js` | truss maths: Abzählkriterium, reactions, member forces, Knotenpunktverfahren text (no DOM) |
| `js/store.js` | data model, `fixData`, autosave, folder/file sync, backup/restore |
| `js/svg.js` | small SVG drawing helpers (arrows, moment arc, hatch) |
| `js/beam_ui.js`, `js/truss_ui.js` | drawing, diagrams, tables and mouse handling per system type |
| `js/frame.js`, `js/frame_ui.js` | frame maths (stiffness method, second order, alpha_cr, checks) and the frame screen |
| `js/stability.js`, `js/stability_ui.js` | Knicknachweis, frame columns, method guide (tab Stabilität) |
| `js/tables.js` | GENERATED material tables (steel profiles, timber classes, concrete, rebar); do not edit by hand |
| `js/tables_ui.js` | the Tabellen tab: look-up with filters by W / I |
| `tools/build_tables.py` | builds `js/tables.js`; the sources and checks are written at the top of the script |
| `js/app.js` | tabs, system list, toolbar, event handling |
| `js/init.js` | start-up (keep last) |

Every new JS file goes into three places: a `<script>` tag in `index.html` (order matters), the `SHELL` list in `sw.js`, and this table.

## Ideas for later

Deflection and stability checks in the Vorbemessung, more timber classes (C16, C18, D, GL30/32), UPN 350-400, Ritter-Schnitt for trusses, statically indeterminate beams/frames (stiffness method), inclined beams and frames, Eurocode load combinations, PDF export (browser print already works).
