import csv
import os
import sys
import argparse
from collections import defaultdict
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

# ── Palette (CNES theme from docx) ───────────────────────────────────────────
BLUE        = colors.HexColor("#005191")   # accent1 — primary headings, table headers
TEAL        = colors.HexColor("#4BACC6")   # accent5 — subtitle, secondary
ORANGE      = colors.HexColor("#EC7405")   # accent2 — warnings, highlights
GREEN       = colors.HexColor("#9BBB59")   # accent3
BEIGE_BG    = colors.HexColor("#EEECE1")   # lt2 — cover background
BLUE_LIGHT  = colors.HexColor("#D2EAF1")   # light blue (footer decoration)
WHITE       = colors.white
BLACK       = colors.HexColor("#1A1A1A")
GRAY_LIGHT  = colors.HexColor("#F4F6FB")
GRAY_MID    = colors.HexColor("#D0D7E8")
GRAY_DARK   = colors.HexColor("#6B7A99")
GRAY_ROW    = colors.HexColor("#EBF0F8")

SEV_COLORS = {
    "CRITICAL": colors.HexColor("#C0392B"),
    "MAJOR":    colors.HexColor("#EC7405"),
    "MINOR":    colors.HexColor("#F5D623"),
    "INFO":     colors.HexColor("#4BACC6"),
    "BLOCKER":  colors.HexColor("#8B0000"),
}
SEV_TEXT = {
    "CRITICAL": WHITE,
    "MAJOR":    WHITE,
    "MINOR":    BLACK,
    "INFO":     WHITE,
    "BLOCKER":  WHITE,
}
TYPE_COLORS = {
    "VULNERABILITY": colors.HexColor("#C0392B"),
    "BUG":           colors.HexColor("#EC7405"),
    "CODE_SMELL":    BLUE,
}


# ── Helpers ──────────────────────────────────────────────────────────────────
def parse_effort(e):
    if not e or e.strip() in ("0min", ""):
        return 0
    e = e.strip()
    total = 0
    if "h" in e:
        parts = e.split("h")
        total += int(parts[0]) * 60
        e = parts[1]
    if "min" in e:
        total += int(e.replace("min", ""))
    return total


def effort_str(minutes):
    if minutes == 0:
        return "0min"
    days = minutes // (8 * 60)
    rem = minutes % (8 * 60)
    hours = rem // 60
    mins = rem % 60
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    if mins:
        parts.append(f"{mins}min")
    return " ".join(parts)


def short_component(c):
    parts = c.split(":")
    return parts[-1] if parts else c


def parse_data(file_path):
    if not os.path.exists(file_path):
        print(f"Erreur : Le fichier {file_path} est introuvable.")
        sys.exit(1)
    issues = []
    with open(file_path, mode="r", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile, delimiter="\t")
        for row in reader:
            row["_effort_min"] = parse_effort(row.get("effort", "0min"))
            row["_file"] = short_component(row.get("component", ""))
            issues.append(row)
    return issues


# ── Styles ────────────────────────────────────────────────────────────────────
def make_styles():
    s = {}
    s["cover_title"] = ParagraphStyle("cover_title", fontName="Helvetica-Bold",
        fontSize=28, textColor=BLUE, leading=36, alignment=TA_LEFT)
    s["cover_subtitle"] = ParagraphStyle("cover_subtitle", fontName="Helvetica",
        fontSize=14, textColor=TEAL, leading=20, alignment=TA_LEFT)
    s["cover_meta"] = ParagraphStyle("cover_meta", fontName="Helvetica",
        fontSize=10, textColor=GRAY_DARK, leading=15, alignment=TA_LEFT)
    s["h1"] = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=14,
        textColor=BLUE, leading=20, spaceBefore=10, spaceAfter=4,
        borderPad=0)
    s["h2"] = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11,
        textColor=BLUE, leading=16, spaceBefore=8, spaceAfter=3)
    s["normal"] = ParagraphStyle("normal", fontName="Helvetica", fontSize=9,
        textColor=BLACK, leading=13)
    s["small"] = ParagraphStyle("small", fontName="Helvetica", fontSize=7.5,
        textColor=GRAY_DARK, leading=11)
    s["th"] = ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=8,
        textColor=WHITE, leading=11, alignment=TA_CENTER)
    s["th_left"] = ParagraphStyle("th_left", fontName="Helvetica-Bold", fontSize=8,
        textColor=WHITE, leading=11, alignment=TA_LEFT)
    s["td"] = ParagraphStyle("td", fontName="Helvetica", fontSize=8,
        textColor=BLACK, leading=11)
    s["td_center"] = ParagraphStyle("td_center", fontName="Helvetica", fontSize=8,
        textColor=BLACK, leading=11, alignment=TA_CENTER)
    s["td_mono"] = ParagraphStyle("td_mono", fontName="Courier", fontSize=7.5,
        textColor=BLACK, leading=11)
    s["td_bold"] = ParagraphStyle("td_bold", fontName="Helvetica-Bold", fontSize=8,
        textColor=BLACK, leading=11)
    s["footer"] = ParagraphStyle("footer", fontName="Helvetica", fontSize=7.5,
        textColor=GRAY_DARK, alignment=TA_CENTER)
    s["bullet"] = ParagraphStyle("bullet", fontName="Helvetica", fontSize=9,
        textColor=BLACK, leading=13, leftIndent=10, spaceBefore=2)
    s["kpi_label"] = ParagraphStyle("kpi_label", fontName="Helvetica-Bold", fontSize=7,
        textColor=GRAY_DARK, leading=10, alignment=TA_CENTER)
    s["kpi_value"] = ParagraphStyle("kpi_value", fontName="Helvetica-Bold", fontSize=20,
        textColor=BLUE, leading=26, alignment=TA_CENTER)
    return s


# ── Header / Footer ───────────────────────────────────────────────────────────
def _draw_header(canvas, doc, first=False):
    W, H = A4
    margin = 15 * mm

    if first:
        # Solid blue banner for cover page
        canvas.setFillColor(BEIGE_BG)
        canvas.rect(0, H - 60 * mm, W, 60 * mm, fill=1, stroke=0)
        # Left blue accent bar
        canvas.setFillColor(BLUE)
        canvas.rect(margin, H - 58 * mm, 2 * mm, 44 * mm, fill=1, stroke=0)
    else:
        # Thin header bar
        canvas.setFillColor(BLUE)
        canvas.rect(0, H - 12 * mm, W, 12 * mm, fill=1, stroke=0)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(WHITE)
        canvas.drawString(margin, H - 8 * mm, "github:owasp:nodegoat")
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(W - margin, H - 8 * mm, "SonarQube — Rapport d'analyse")


def _draw_footer(canvas, doc):
    W, H = A4
    margin = 15 * mm

    # Footer background (very light)
    canvas.setFillColor(GRAY_LIGHT)
    canvas.rect(0, 0, W, 10 * mm, fill=1, stroke=0)

    # Blue accent line above footer
    canvas.setFillColor(BLUE)
    canvas.rect(0, 10 * mm, W, 0.8 * mm, fill=1, stroke=0)

    # Blue triangle decoration (bottom right, like the docx)
    canvas.setFillColor(BLUE_LIGHT)
    p = canvas.beginPath()
    p.moveTo(W - 20 * mm, 0)
    p.lineTo(W, 0)
    p.lineTo(W, 20 * mm)
    p.close()
    canvas.drawPath(p, fill=1, stroke=0)

    # Page number in triangle
    canvas.setFont("Helvetica-Bold", 9)
    canvas.setFillColor(BLUE)
    canvas.drawRightString(W - 2 * mm, 6 * mm, str(doc.page))

    # Footer text
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(GRAY_DARK)
    canvas.drawString(margin, 3.5 * mm,
        f"Confidentiel  —  Généré le {datetime.now().strftime('%d/%m/%Y %H:%M')}")


# ── Section heading with blue bottom border ────────────────────────────────────
def section_heading(title, s, level=1):
    style = s["h1"] if level == 1 else s["h2"]
    items = [Paragraph(title, style)]
    if level == 1:
        items.append(HRFlowable(width="100%", thickness=1.5, color=BLUE, spaceAfter=4))
    else:
        items.append(HRFlowable(width="100%", thickness=0.5, color=TEAL, spaceAfter=3))
    return items


# ── Table helpers ──────────────────────────────────────────────────────────────
TABLE_BASE = TableStyle([
    ("BACKGROUND",    (0, 0), (-1, 0), BLUE),
    ("TEXTCOLOR",     (0, 0), (-1, 0), WHITE),
    ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE",      (0, 0), (-1, -1), 8),
    ("TOPPADDING",    (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("LEFTPADDING",   (0, 0), (-1, -1), 7),
    ("RIGHTPADDING",  (0, 0), (-1, -1), 7),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, GRAY_ROW]),
    ("GRID",          (0, 0), (-1, -1), 0.3, GRAY_MID),
    ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ("LINEBELOW",     (0, 0), (-1, 0), 0.5, GRAY_MID),
])


def sev_badge(sev, s):
    bg = SEV_COLORS.get(sev, GRAY_MID)
    txt = SEV_TEXT.get(sev, BLACK)
    style = ParagraphStyle("badge", fontName="Helvetica-Bold", fontSize=7,
        textColor=txt, leading=9, alignment=TA_CENTER)
    t = Table([[Paragraph(sev, style)]], colWidths=[18 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), bg),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING",   (0, 0), (-1, -1), 2),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 2),
    ]))
    return t


def type_badge(tp, s):
    c = TYPE_COLORS.get(tp, GRAY_MID)
    label = tp.replace("_", " ")
    style = ParagraphStyle("tbadge", fontName="Helvetica-Bold", fontSize=7,
        textColor=WHITE, leading=9, alignment=TA_CENTER)
    t = Table([[Paragraph(label, style)]], colWidths=[24 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), c),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING",   (0, 0), (-1, -1), 2),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 2),
    ]))
    return t


# ── KPI card ──────────────────────────────────────────────────────────────────
def kpi_card(label, value, color=BLUE, s=None):
    rows = [
        [Paragraph(label, s["kpi_label"])],
        [Paragraph(str(value), ParagraphStyle("kpiv", fontName="Helvetica-Bold",
            fontSize=20, textColor=color, leading=26, alignment=TA_CENTER))],
    ]
    t = Table(rows, colWidths=[32 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), WHITE),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("BOX",           (0, 0), (-1, -1), 0.5, GRAY_MID),
        ("LINEBELOW",     (0, 0), (-1, 0), 2, color),
    ]))
    return t


# ── Main ──────────────────────────────────────────────────────────────────────
def build_pdf(input_csv, output_pdf):
    issues = parse_data(input_csv)
    s = make_styles()
    W, H = A4
    margin = 15 * mm
    usable = W - 2 * margin

    # Aggregates
    total = len(issues)
    by_type = defaultdict(int)
    by_sev = defaultdict(int)
    by_file = defaultdict(int)
    by_rule = defaultdict(list)
    total_effort = 0

    for iss in issues:
        by_type[iss["type"]] += 1
        by_sev[iss["severity"]] += 1
        by_file[iss["_file"]] += 1
        rule_key = (iss.get("message", "").strip('"')[:80],
                    iss.get("type", ""),
                    iss.get("severity", ""))
        by_rule[rule_key].append(iss)
        total_effort += iss["_effort_min"]

    vuln_count  = by_type.get("VULNERABILITY", 0)
    bug_count   = by_type.get("BUG", 0)
    smell_count = by_type.get("CODE_SMELL", 0)
    crit_count  = by_sev.get("CRITICAL", 0)
    h_str = effort_str(total_effort)

    doc = SimpleDocTemplate(
        output_pdf, pagesize=A4,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
        leftMargin=margin, rightMargin=margin,
    )

    story = []

    # ──────────────────────────────────────────────────────────────────────────
    # COVER content (under banner drawn by first_page callback)
    # ──────────────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 4 * mm))
    story.append(Spacer(1, 45 * mm))
    
    # KPI row
    kpi_data = [[
        kpi_card("TOTAL ISSUES",   total,       BLUE,   s=s),
        kpi_card("VULNÉRABILITÉS", vuln_count,  colors.HexColor("#C0392B"), s=s),
        kpi_card("BUGS",           bug_count,   ORANGE, s=s),
        kpi_card("CODE SMELLS",    smell_count, TEAL,   s=s),
        kpi_card("CRITIQUES",      crit_count,  colors.HexColor("#C0392B"), s=s),
        kpi_card("EFFORT TOTAL",   h_str,       BLUE,   s=s),
    ]]
    kpi_row = Table(kpi_data, colWidths=[usable / 6] * 6, hAlign="LEFT")
    kpi_row.setStyle(TableStyle([
        ("LEFTPADDING",  (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(kpi_row)
    story.append(Spacer(1, 8 * mm))

    # ──────────────────────────────────────────────────────────────────────────
    # 1. INTRODUCTION
    # ──────────────────────────────────────────────────────────────────────────
    for el in section_heading("Introduction", s, level=1):
        story.append(el)
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Ce document contient les résultats de l'analyse du code de "
        "<b>github:owasp:nodegoat</b>.", s["normal"]))
    story.append(Spacer(1, 5 * mm))

    # ──────────────────────────────────────────────────────────────────────────
    # 2. CONFIGURATION
    # ──────────────────────────────────────────────────────────────────────────
    for el in section_heading("Configuration", s, level=1):
        story.append(el)
    story.append(Spacer(1, 2 * mm))

    config_rows = [
        [Paragraph("Paramètre", s["th_left"]), Paragraph("Valeur", s["th_left"])],
        [Paragraph("Projet",           s["td"]), Paragraph("github:owasp:nodegoat", s["td_mono"])],
        [Paragraph("Branche",          s["td"]), Paragraph("main",                  s["td"])],
        [Paragraph("Portée",           s["td"]), Paragraph("MAIN",                  s["td"])],
        [Paragraph("Statut",           s["td"]), Paragraph("OPEN",                  s["td"])],
        [Paragraph("Quality Profiles", s["td"]),
         Paragraph("Sonar way [Docker] ; Sonar way [JavaScript] ; Sonar way [HTML]", s["td"])],
        [Paragraph("Quality Gate",     s["td"]), Paragraph("Sonar way",              s["td"])],
        [Paragraph("Date d'analyse",   s["td"]), Paragraph("2026-05-22",             s["td"])],
    ]
    ctable = Table(config_rows, colWidths=[usable * 0.3, usable * 0.7])
    ctable.setStyle(TABLE_BASE)
    story.append(ctable)
    story.append(Spacer(1, 6 * mm))

    # ──────────────────────────────────────────────────────────────────────────
    # 3. SYNTHÈSE
    # ──────────────────────────────────────────────────────────────────────────
    for el in section_heading("Synthèse", s, level=1):
        story.append(el)
    story.append(Spacer(1, 2 * mm))

    # 3a. Status analytique
    for el in section_heading("Statut de l'analyse", s, level=2):
        story.append(el)

    status_rows = [
        [Paragraph("Fiabilité", s["th"]),
         Paragraph("Sécurité", s["th"]),
         Paragraph("Revue de sécurité", s["th"]),
         Paragraph("Maintenabilité", s["th"])],
        [Paragraph(f"{bug_count + vuln_count} problèmes", s["td_center"]),
         Paragraph(f"{vuln_count} vulnérabilité(s)", s["td_center"]),
         Paragraph("—", s["td_center"]),
         Paragraph(f"{smell_count} code smell(s)", s["td_center"])],
    ]
    st = Table(status_rows, colWidths=[usable / 4] * 4)
    st.setStyle(TABLE_BASE)
    story.append(st)
    story.append(Spacer(1, 4 * mm))

    # 3b. Métriques clés
    for el in section_heading("Métriques", s, level=2):
        story.append(el)

    # Count languages from files
    lang_count = defaultdict(int)
    for iss in issues:
        comp = iss.get("component", "")
        # Attempt to guess language from file extension
        f = iss.get("_file", "")
        ext = f.rsplit(".", 1)[-1].lower() if "." in f else "unknown"
        lang_count[ext] += 1

    met_rows = [
        [Paragraph("Métrique", s["th_left"]), Paragraph("Valeur", s["th_left"])],
        [Paragraph("Duplication",                       s["td"]), Paragraph("3.5 %",  s["td_bold"])],
        [Paragraph("Densité de commentaires",           s["td"]), Paragraph("9.5 %",  s["td_bold"])],
        [Paragraph("Médiane de lignes par fichier",     s["td"]), Paragraph("58",     s["td_bold"])],
        [Paragraph("Respect du standard de codage",     s["td"]), Paragraph("98.9 %", s["td_bold"])],
        [Paragraph("Couverture des tests",              s["td"]), Paragraph("0.0 %",  s["td_bold"])],
    ]
    mt = Table(met_rows, colWidths=[usable * 0.6, usable * 0.4])
    mt.setStyle(TABLE_BASE)
    story.append(mt)
    story.append(Spacer(1, 4 * mm))

    # 3c. Dette technique
    for el in section_heading("Dette technique détaillée", s, level=2):
        story.append(el)

    fiabilite = effort_str(sum(
        iss["_effort_min"] for iss in issues if iss.get("type") == "BUG"))
    securite = effort_str(sum(
        iss["_effort_min"] for iss in issues if iss.get("type") == "VULNERABILITY"))
    maintien = effort_str(sum(
        iss["_effort_min"] for iss in issues if iss.get("type") == "CODE_SMELL"))

    debt_rows = [
        [Paragraph("Fiabilité", s["th"]),
         Paragraph("Sécurité", s["th"]),
         Paragraph("Maintenabilité", s["th"]),
         Paragraph("Total", s["th"])],
        [Paragraph(fiabilite, s["td_center"]),
         Paragraph(securite, s["td_center"]),
         Paragraph(maintien, s["td_center"]),
         Paragraph(h_str, ParagraphStyle("bold_c", fontName="Helvetica-Bold",
             fontSize=8, textColor=BLUE, leading=11, alignment=TA_CENTER))],
    ]
    dt = Table(debt_rows, colWidths=[usable / 4] * 4)
    dt.setStyle(TABLE_BASE)
    story.append(dt)
    story.append(Spacer(1, 4 * mm))

    # 3d. Top fichiers affectés
    for el in section_heading("Fichiers les plus affectés (Top 8)", s, level=2):
        story.append(el)

    top_files = sorted(by_file.items(), key=lambda x: -x[1])[:8]
    max_f = top_files[0][1] if top_files else 1

    file_rows = [
        [Paragraph("Fichier", s["th_left"]),
         Paragraph("Issues", s["th"]),
         Paragraph("Proportion", s["th_left"])]
    ]
    for fname, cnt in top_files:
        # Calculer le ratio par rapport au max, et multiplier par une longueur fixe
        bar_pct = cnt / max_f
        bar_len = int(bar_pct * 20)  # Réduit à 20 pour mieux tenir dans la colonne
        bar = ("█" * bar_len)
        bar_style = ParagraphStyle("bar", fontName="Courier", fontSize=8,
            textColor=BLUE, leading=10)
        file_rows.append([
            Paragraph(fname, s["td_mono"]),
            Paragraph(str(cnt), s["td_center"]),
            Paragraph(bar, bar_style),
        ])

    ftable = Table(file_rows, colWidths=[usable * 0.52, usable * 0.1, usable * 0.38])
    ftable.setStyle(TABLE_BASE)
    story.append(ftable)

    # ──────────────────────────────────────────────────────────────────────────
    # PAGE 2 : ISSUES
    # ──────────────────────────────────────────────────────────────────────────
    story.append(PageBreak())

    for el in section_heading("Issues", s, level=1):
        story.append(el)
    story.append(Spacer(1, 2 * mm))

    # 4a. Répartition par sévérité et type
    for el in section_heading("Nombre d'issues par sévérité et par type", s, level=2):
        story.append(el)

    sev_order  = ["INFO", "MINOR", "MAJOR", "CRITICAL", "BLOCKER"]
    type_order = ["BUG", "VULNERABILITY", "CODE_SMELL"]

    # Build cross-table sev × type
    cross = defaultdict(lambda: defaultdict(int))
    for iss in issues:
        cross[iss["type"]][iss["severity"]] += 1

    cross_header = [Paragraph("Type / Criticité", s["th_left"])] + \
        [Paragraph(sv, s["th"]) for sv in sev_order]
    cross_rows = [cross_header]
    for tp in type_order:
        row = [Paragraph(tp.replace("_", " "), s["td"])]
        for sv in sev_order:
            v = cross[tp][sv]
            cell_style = s["td_center"]
            if v > 0 and sv in ("CRITICAL", "BLOCKER"):
                cell_style = ParagraphStyle("hot", fontName="Helvetica-Bold",
                    fontSize=8, textColor=colors.HexColor("#C0392B"),
                    leading=11, alignment=TA_CENTER)
            row.append(Paragraph(str(v) if v > 0 else "—", cell_style))
        cross_rows.append(row)

    col_ws = [usable * 0.28] + [usable * 0.72 / len(sev_order)] * len(sev_order)
    ctable2 = Table(cross_rows, colWidths=col_ws)
    ctable2.setStyle(TABLE_BASE)
    story.append(ctable2)
    story.append(Spacer(1, 4 * mm))

    # 4b. Liste regroupée des issues
    for el in section_heading("Liste des issues", s, level=2):
        story.append(el)

    # Group by (message, type, severity) and count
    rule_summary = {}
    for iss in issues:
        key = (
            iss.get("message", "").strip('"')[:90],
            iss.get("type", ""),
            iss.get("severity", ""),
        )
        if key not in rule_summary:
            rule_summary[key] = {"count": 0, "effort": 0}
        rule_summary[key]["count"] += 1
        rule_summary[key]["effort"] += iss["_effort_min"]

    sev_sort = {"CRITICAL": 0, "BLOCKER": 1, "MAJOR": 2, "MINOR": 3, "INFO": 4}
    sorted_rules = sorted(rule_summary.items(),
        key=lambda x: (sev_sort.get(x[0][2], 5), x[0][1], x[0][0]))

    list_rows = [[
        Paragraph("Nom", s["th_left"]),
        Paragraph("Type", s["th"]),
        Paragraph("Criticité", s["th"]),
        Paragraph("Nombre", s["th"]),
        Paragraph("Effort", s["th"]),
    ]]
    for (msg, tp, sev), info in sorted_rules:
        sev_c = SEV_COLORS.get(sev, GRAY_MID)
        sev_t = SEV_TEXT.get(sev, BLACK)
        badge_s = ParagraphStyle("bs", fontName="Helvetica-Bold", fontSize=7,
            textColor=sev_t, leading=9, alignment=TA_CENTER)
        list_rows.append([
            Paragraph(msg, s["td"]),
            Paragraph(tp.replace("_", " "), s["td_center"]),
            Paragraph(sev, badge_s),
            Paragraph(str(info["count"]), s["td_center"]),
            Paragraph(effort_str(info["effort"]), s["td_center"]),
        ])

    # Apply per-row severity colors to the severity column
    list_style_cmds = list(TABLE_BASE._cmds)
    for i, ((msg, tp, sev), info) in enumerate(sorted_rules, start=1):
        sev_c = SEV_COLORS.get(sev, GRAY_MID)
        list_style_cmds.append(("BACKGROUND", (2, i), (2, i), sev_c))

    list_col_ws = [usable * 0.48, usable * 0.14, usable * 0.12, usable * 0.1, usable * 0.16]
    ltable = Table(list_rows, colWidths=list_col_ws, repeatRows=1)
    ltable.setStyle(TableStyle(list_style_cmds))
    story.append(ltable)

    # ──────────────────────────────────────────────────────────────────────────
    # PAGE 3 : DÉTAIL LIGNE À LIGNE
    # ──────────────────────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Spacer(1, 3 * mm))

    for el in section_heading("Détail des problèmes", s, level=1):
        story.append(el)
    story.append(Spacer(1, 2 * mm))

    det_rows = [[
        Paragraph("Sévérité",      s["th"]),
        Paragraph("Type",          s["th"]),
        Paragraph("Règle",         s["th_left"]),
        Paragraph("Fichier / Ligne", s["th_left"]),
        Paragraph("Message",       s["th_left"]),
        Paragraph("Effort",        s["th"]),
    ]]

    sorted_issues = sorted(issues,
        key=lambda x: (sev_sort.get(x["severity"], 5), x["_file"]))

    det_style_cmds = list(TABLE_BASE._cmds)

    for i, iss in enumerate(sorted_issues, start=1):
        sev  = iss.get("severity", "")
        tp   = iss.get("type", "")
        rule = iss.get("rule", "").replace("javascript:", "").replace("Web:", "")
        try:
            line = int(float(iss.get("line", 0)))
        except Exception:
            line = 0
        loc = f"{iss['_file']} L.{line}"
        msg = iss.get("message", "").strip('"').replace('""', '"')[:80]
        eff = iss.get("effort", "—")

        sev_c = SEV_COLORS.get(sev, GRAY_MID)
        sev_t = SEV_TEXT.get(sev, BLACK)
        badge_s = ParagraphStyle("bs2", fontName="Helvetica-Bold", fontSize=7,
            textColor=sev_t, leading=9, alignment=TA_CENTER)

        det_rows.append([
            Paragraph(sev, badge_s),
            Paragraph(tp.replace("_", " "), s["td_center"]),
            Paragraph(rule, s["td_mono"]),
            Paragraph(loc, s["td_mono"]),
            Paragraph(msg, s["td"]),
            Paragraph(eff, s["td_center"]),
        ])
        det_style_cmds.append(("BACKGROUND", (0, i), (0, i), sev_c))

    det_col_ws = [usable * p for p in [0.1, 0.11, 0.14, 0.22, 0.36, 0.07]]
    dtable = Table(det_rows, colWidths=det_col_ws, repeatRows=1)
    dtable.setStyle(TableStyle(det_style_cmds))
    story.append(dtable)

    # ──────────────────────────────────────────────────────────────────────────
    # Build with callbacks
    # ──────────────────────────────────────────────────────────────────────────
    def first_page(c, d):
        # Beige/light cover banner
        _draw_header(c, d, first=True)
        # Title text on cover
        c.setFont("Helvetica-Bold", 28)
        c.setFillColor(BLUE)
        c.drawString(margin + 6 * mm, H - 20 * mm, "Rapport d'analyse")
        c.setFont("Helvetica-Bold", 14)
        c.setFillColor(TEAL)
        c.drawString(margin + 6 * mm, H - 33 * mm, "SonarQube")
        c.setFont("Helvetica", 10)
        c.setFillColor(GRAY_DARK)
        c.drawString(margin + 6 * mm, H - 44 * mm, "Projet :  github:owasp:nodegoat")
        c.drawString(margin + 6 * mm, H - 53 * mm,
            f"Généré le :  {datetime.now().strftime('%d %B %Y à %H:%M')}")
        _draw_footer(c, d)

    def later_page(c, d):
        _draw_header(c, d, first=False)
        _draw_footer(c, d)

    doc.build(story, onFirstPage=first_page, onLaterPages=later_page)
    print(f"PDF généré : {output_pdf}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Générer un rapport PDF depuis un CSV SonarQube.")
    parser.add_argument("input", help="Chemin vers le fichier CSV source")
    parser.add_argument("output", help="Chemin pour le fichier PDF de sortie")
    args = parser.parse_args()
    build_pdf(args.input, args.output)