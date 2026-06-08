#!/usr/bin/env python3
"""
Generate the downloadable resource PDFs for downloads.html.

Outputs (into ./downloads/):
  cnc-tolerance-guide.pdf
  material-selection-guide.pdf
  surface-finish-guide.pdf
  equipment-list.pdf
  company-profile.pdf
  quality-documentation-sample.pdf

Branded, consistent layout. Technical content is generic-accurate; company
specifics (equipment counts, sample report values) are clearly marked as
representative/placeholder so the WFX team can replace with real figures.
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "downloads")
os.makedirs(OUT, exist_ok=True)

PRIMARY = colors.HexColor("#0052CC")
DARK = colors.HexColor("#0a1628")
GRAY = colors.HexColor("#475569")
LIGHT = colors.HexColor("#f1f5f9")

COMPANY = "WFX — Dongguan Wanfuxin Intelligent Manufacturing"
CONTACT = "wanfuxin-dg.com  |  lucindaz@wanfuxin.com  |  +86 134 3145 1998  |  Dongguan, Guangdong, China"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle("WFXTitle", parent=styles["Title"], textColor=DARK, fontSize=22, spaceAfter=4))
styles.add(ParagraphStyle("WFXSub", parent=styles["Normal"], textColor=PRIMARY, fontSize=11, spaceAfter=14))
styles.add(ParagraphStyle("WFXH2", parent=styles["Heading2"], textColor=DARK, fontSize=13, spaceBefore=12, spaceAfter=6))
styles.add(ParagraphStyle("WFXBody", parent=styles["Normal"], textColor=GRAY, fontSize=10, leading=15, spaceAfter=8))
styles.add(ParagraphStyle("WFXNote", parent=styles["Normal"], textColor=GRAY, fontSize=8.5, leading=12, spaceBefore=6))
styles.add(ParagraphStyle("WFXCell", parent=styles["Normal"], fontSize=9, leading=12, textColor=DARK))
styles.add(ParagraphStyle("WFXCellC", parent=styles["WFXCell"], alignment=TA_CENTER))


def _header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    # header band
    canvas.setFillColor(PRIMARY)
    canvas.rect(0, h - 18 * mm, w, 18 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 13)
    canvas.drawString(18 * mm, h - 12 * mm, "WFX")
    canvas.setFont("Helvetica", 8)
    canvas.drawString(30 * mm, h - 12 * mm, "Precision CNC Machining")
    canvas.drawRightString(w - 18 * mm, h - 12 * mm, doc.title)
    # footer
    canvas.setStrokeColor(LIGHT)
    canvas.line(18 * mm, 15 * mm, w - 18 * mm, 15 * mm)
    canvas.setFillColor(GRAY)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(18 * mm, 10 * mm, CONTACT)
    canvas.drawRightString(w - 18 * mm, 10 * mm, "Page %d" % doc.page)
    canvas.restoreState()


def doc_for(filename, title):
    path = os.path.join(OUT, filename)
    d = SimpleDocTemplate(path, pagesize=A4,
                          topMargin=26 * mm, bottomMargin=20 * mm,
                          leftMargin=18 * mm, rightMargin=18 * mm,
                          title=title, author="WFX Wanfuxin")
    return d, path


def title_block(title, subtitle):
    return [Paragraph(title, styles["WFXTitle"]),
            Paragraph(subtitle, styles["WFXSub"])]


def P(t):
    return Paragraph(t, styles["WFXBody"])


def H(t):
    return Paragraph(t, styles["WFXH2"])


def make_table(header, rows, col_widths=None, highlight_col=None):
    data = [[Paragraph(c, styles["WFXCellC"]) for c in header]]
    for r in rows:
        data.append([Paragraph(str(c), styles["WFXCell"] if i == 0 else styles["WFXCellC"])
                     for i, c in enumerate(r)])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    st = [
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ]
    if highlight_col is not None:
        st.append(("TEXTCOLOR", (highlight_col, 1), (highlight_col, -1), PRIMARY))
        st.append(("FONTNAME", (highlight_col, 1), (highlight_col, -1), "Helvetica-Bold"))
    t.setStyle(TableStyle(st))
    return t


def build():
    made = []

    # ---------- 1. CNC Tolerance Guide ----------
    d, path = doc_for("cnc-tolerance-guide.pdf", "CNC Tolerance Guide")
    s = title_block("CNC Machining Tolerance Guide",
                    "Standard, precision and best-capability tolerances with inspection methods")
    s += [P("This guide summarizes the dimensional tolerances WFX holds across our CNC processes. "
            "Achievable tolerance depends on part geometry, material and feature size. "
            "<b>±0.005&nbsp;mm (±0.0002\")</b> is our benchmark best capability on selected critical "
            "features, confirmed per part during DFM review &mdash; a case-by-case maximum, not a "
            "blanket guarantee.")]
    s += [H("Tolerance by process")]
    s += [make_table(
        ["Process", "Standard", "Precision", "Best capability", "Inspection"],
        [["CNC Milling", "±0.05 mm (±0.002\")", "±0.01 mm (±0.0004\")", "±0.005 mm (±0.0002\")", "CMM"],
         ["CNC Turning", "±0.05 mm (±0.002\")", "±0.01 mm (±0.0004\")", "±0.005 mm (±0.0002\")", "CMM"],
         ["5-Axis Machining", "±0.03 mm (±0.0012\")", "±0.01 mm (±0.0004\")", "±0.005 mm (±0.0002\")", "CMM"],
         ["Precision Grinding", "±0.01 mm (±0.0004\")", "±0.005 mm (±0.0002\")", "±0.002 mm (±0.00008\")", "CMM"],
         ["Surface Finish (Ra)", "Ra 1.6 µm", "Ra 0.8 µm", "Ra 0.4 µm", "Profilometer"]],
        col_widths=[34 * mm, 33 * mm, 33 * mm, 33 * mm, 24 * mm], highlight_col=3)]
    s += [H("General (linear) tolerances when not specified — ISO 2768-m guidance")]
    s += [make_table(
        ["Nominal size", "Permissible deviation"],
        [["0.5 – 6 mm", "±0.1 mm"], ["6 – 30 mm", "±0.2 mm"], ["30 – 120 mm", "±0.3 mm"],
         ["120 – 400 mm", "±0.5 mm"], ["400 – 1000 mm", "±0.8 mm"]],
        col_widths=[60 * mm, 60 * mm])]
    s += [H("Inspection & verification")]
    s += [P("All critical dimensions are verified on Zeiss and Hexagon coordinate measuring machines "
            "(CMM) with measurement accuracy to ~0.0009 mm. We can supply a full dimensional report or "
            "an AS9102-style First Article Inspection (FAI) report on request.")]
    s += [Paragraph("Representative standards for reference only. Confirm part-specific tolerances with "
                    "WFX engineering during DFM review.", styles["WFXNote"])]
    d.build(s, onFirstPage=_header_footer, onLaterPages=_header_footer)
    made.append(path)

    # ---------- 2. Material Selection Guide ----------
    d, path = doc_for("material-selection-guide.pdf", "Material Selection Guide")
    s = title_block("Material Selection Guide",
                    "Common CNC materials — properties, typical uses and machinability")
    s += [P("A quick reference to the materials we machine most. Choose based on strength, "
            "corrosion resistance, weight, temperature and cost; we will confirm the optimal grade "
            "and temper during DFM review.")]
    s += [H("Aluminum alloys")]
    s += [make_table(
        ["Grade", "Key properties", "Typical use", "Machinability"],
        [["6061-T6", "Good strength, weldable, anodizes well, corrosion resistant", "Brackets, housings, plates", "Excellent"],
         ["7075-T6", "Very high strength-to-weight, not weldable", "Aerospace structure", "Good"],
         ["5052", "Excellent corrosion resistance, formable", "Sheet, enclosures", "Good"],
         ["2024", "High fatigue strength", "Aircraft fittings", "Good"]],
        col_widths=[22 * mm, 62 * mm, 40 * mm, 27 * mm])]
    s += [H("Stainless & steel")]
    s += [make_table(
        ["Grade", "Key properties", "Typical use", "Machinability"],
        [["303", "Free-machining, lower corrosion resistance", "Fittings, shafts (non-welded)", "Excellent"],
         ["304", "General purpose, weldable, corrosion resistant", "Enclosures, food-contact", "Fair"],
         ["316L", "Superior corrosion resistance (chlorides)", "Medical, marine, chemical", "Fair"],
         ["4140", "High strength alloy steel, heat-treatable", "Shafts, gears, tooling", "Good"]],
        col_widths=[22 * mm, 62 * mm, 40 * mm, 27 * mm])]
    s += [H("Titanium, copper & plastics")]
    s += [make_table(
        ["Material", "Key properties", "Typical use"],
        [["Ti-6Al-4V", "High strength-to-weight, biocompatible, corrosion resistant", "Aerospace, medical implants"],
         ["C110 copper", "Excellent thermal/electrical conductivity", "Bus bars, heat sinks"],
         ["Brass C360", "Free-machining, good conductivity", "Fittings, connectors"],
         ["PEEK", "High-temp engineering plastic, biocompatible", "Medical, electrical insulators"],
         ["Acetal (POM)", "Low friction, dimensionally stable", "Gears, bushings"]],
        col_widths=[28 * mm, 75 * mm, 48 * mm])]
    d.build(s, onFirstPage=_header_footer, onLaterPages=_header_footer)
    made.append(path)

    # ---------- 3. Surface Finish Guide ----------
    d, path = doc_for("surface-finish-guide.pdf", "Surface Finish Guide")
    s = title_block("Surface Finish & Coating Guide",
                    "Anodizing, plating, passivation, polishing and more")
    s += [P("Surface finishing improves corrosion resistance, wear, conductivity and appearance. "
            "This guide lists the finishes we offer and where each is used.")]
    s += [make_table(
        ["Finish", "Materials", "Function", "Notes"],
        [["Type II anodizing", "Aluminum", "Corrosion & wear, color", "Many RAL/Pantone colors"],
         ["Type III hard anodize", "Aluminum", "Hard, wear-resistant layer", "25–50 µm typical"],
         ["Electroless nickel", "Steel, aluminum", "Uniform corrosion/wear coat", "Even on complex shapes"],
         ["Zinc plating", "Steel", "Corrosion protection", "Clear/yellow/black"],
         ["Passivation", "Stainless steel", "Restores corrosion resistance", "Per ASTM A967"],
         ["Bead blasting", "Most metals", "Uniform matte texture", "Cosmetic / pre-coat"],
         ["Polishing", "Most metals", "Smooth, reflective finish", "Down to Ra 0.1–0.4 µm"],
         ["Powder coating", "Steel, aluminum", "Durable colored finish", "Thick, tough layer"],
         ["Black oxide", "Steel", "Mild corrosion, low glare", "Minimal dimensional change"]],
        col_widths=[34 * mm, 32 * mm, 50 * mm, 38 * mm])]
    s += [H("Surface roughness reference")]
    s += [make_table(
        ["Process", "Typical Ra (µm)"],
        [["As-milled / turned", "1.6 – 3.2"], ["Fine machining", "0.8 – 1.6"],
         ["Bead blasted", "1.0 – 2.0"], ["Ground", "0.2 – 0.8"], ["Polished", "0.1 – 0.4"]],
        col_widths=[80 * mm, 50 * mm])]
    s += [Paragraph("Color, thickness and spec callouts (e.g. MIL-A-8625, ASTM B733) can be matched to "
                    "your drawing. Confirm requirements during DFM review.", styles["WFXNote"])]
    d.build(s, onFirstPage=_header_footer, onLaterPages=_header_footer)
    made.append(path)

    # ---------- 4. Equipment List ----------
    d, path = doc_for("equipment-list.pdf", "Equipment List")
    s = title_block("Equipment List",
                    "Machine fleet — brands, types and working envelopes")
    s += [P("Representative summary of WFX machining capacity across our Dongguan facility. "
            "Quantities are indicative; contact us for a current, project-specific capability statement.")]
    s += [make_table(
        ["Category", "Brands", "Type", "Working envelope (typ.)"],
        [["3-axis milling", "Mazak, Brother, FANUC", "Vertical machining centers", "up to 1000 × 500 × 500 mm"],
         ["4-axis milling", "Mazak, DMG MORI", "VMC + rotary", "up to 800 × 500 mm"],
         ["5-axis milling", "Mazak, DMG MORI", "Simultaneous 5-axis", "up to Ø600 mm parts"],
         ["CNC turning", "Mazak, Doosan", "2-axis & live-tool lathes", "Ø610 mm × 1219 mm (24\" × 48\")"],
         ["Swiss turning", "Citizen, Tsugami", "Sliding-head lathes", "Ø2 – 32 mm bar"],
         ["Surface grinding", "Okamoto", "Precision grinding", "to ±0.002 mm"],
         ["EDM", "Sodick", "Wire & sinker EDM", "fine features, hard metals"],
         ["Inspection", "Zeiss, Hexagon", "CMM", "accuracy ~0.0009 mm"]],
        col_widths=[30 * mm, 36 * mm, 40 * mm, 48 * mm])]
    s += [P("Facility: ~20,000 m² self-built plant, 300+ CNC machines, ISO 9001 and IATF 16949 certified, "
            "serving customers in 10+ countries.")]
    s += [Paragraph("Brands and counts are representative; replace with the verified current fleet before "
                    "distributing externally.", styles["WFXNote"])]
    d.build(s, onFirstPage=_header_footer, onLaterPages=_header_footer)
    made.append(path)

    # ---------- 5. Company Profile ----------
    d, path = doc_for("company-profile.pdf", "Company Profile")
    s = title_block("Company Profile",
                    "WFX — Dongguan Wanfuxin Intelligent Manufacturing")
    s += [P("WFX is a precision CNC manufacturer founded in 2007, based in Dongguan, Guangdong, China. "
            "We provide CNC milling, turning, 5-axis machining, finishing and assembly from prototype to "
            "production for customers in aerospace, medical, electronics, liquid cooling, industrial and "
            "robotics industries worldwide.")]
    s += [H("At a glance")]
    s += [make_table(
        ["", ""],
        [["Founded", "2007"],
         ["Facility", "~20,000 m² self-built plant"],
         ["Equipment", "300+ CNC machines"],
         ["Certifications", "ISO 9001:2015, IATF 16949:2016"],
         ["Tolerance capability", "to ±0.005 mm (±0.0002\")"],
         ["Markets served", "10+ countries"],
         ["Inspection", "Zeiss & Hexagon CMM, full traceability"]],
        col_widths=[55 * mm, 95 * mm])]
    s += [H("Capabilities")]
    s += [P("• CNC milling (3, 4 and 5-axis) &nbsp; • CNC & Swiss turning &nbsp; • Precision grinding & EDM<br/>"
            "• Surface finishing (anodizing, plating, passivation, polishing) &nbsp; • Assembly & turnkey<br/>"
            "• 50+ materials: aluminum, stainless, steel, titanium, copper, brass and engineering plastics")]
    s += [H("Why WFX")]
    s += [P("Certified quality systems, full material and process traceability, CMM-verified dimensional "
            "reports and FAI on request, and a free 24-hour DFM review on uploaded STEP files. Upload your "
            "design at wanfuxin-dg.com to get engineering feedback and pricing fast.")]
    d.build(s, onFirstPage=_header_footer, onLaterPages=_header_footer)
    made.append(path)

    # ---------- 6. Quality Documentation Sample ----------
    d, path = doc_for("quality-documentation-sample.pdf", "Quality Documentation Sample")
    s = title_block("Quality Documentation Samples",
                    "Representative CMM report, FAI summary and Certificate of Conformance")
    s += [Paragraph("<b>Sample document.</b> Values, part numbers and customer names below are "
                    "placeholders for illustration. Real reports are issued per order with actual "
                    "measured data; sensitive customer information is redacted.", styles["WFXNote"])]
    s += [H("1. CMM dimensional report (excerpt)")]
    s += [make_table(
        ["Char.", "Feature", "Nominal", "Tol.", "Measured", "Result"],
        [["1", "Bore Ø", "12.000", "±0.010", "12.004", "PASS"],
         ["2", "Slot width", "8.000", "±0.020", "8.011", "PASS"],
         ["3", "True position", "0.000", "0.050", "0.021", "PASS"],
         ["4", "Flatness", "0.000", "0.015", "0.008", "PASS"],
         ["5", "Overall length", "85.000", "±0.050", "84.982", "PASS"]],
        col_widths=[14 * mm, 40 * mm, 24 * mm, 22 * mm, 26 * mm, 22 * mm], highlight_col=5)]
    s += [H("2. First Article Inspection (FAI) summary")]
    s += [make_table(
        ["", ""],
        [["Part number", "WFX-XXXX-000 (sample)"],
         ["Revision", "A"],
         ["Material", "Aluminum 6061-T6 (cert on file)"],
         ["Characteristics checked", "42 / 42"],
         ["Result", "ACCEPTED"],
         ["Equipment", "Zeiss CONTURA CMM"],
         ["Format", "AS9102-style"]],
        col_widths=[55 * mm, 95 * mm])]
    s += [H("3. Certificate of Conformance (CoC)")]
    s += [P("We certify that the parts supplied under the referenced purchase order were manufactured and "
            "inspected in accordance with the applicable drawings and specifications, and conform to the "
            "stated requirements. Material certifications and inspection records are retained and available "
            "on request. <i>(Signatory, dates and PO details appear on the issued certificate.)</i>")]
    s += [Paragraph("These are illustrative templates. Request order-specific documentation from WFX.",
                    styles["WFXNote"])]
    d.build(s, onFirstPage=_header_footer, onLaterPages=_header_footer)
    made.append(path)

    return made


if __name__ == "__main__":
    files = build()
    for f in files:
        print("  %-48s %6.1f KB" % (os.path.basename(f), os.path.getsize(f) / 1024))
    print("Generated %d PDFs into downloads/" % len(files))
