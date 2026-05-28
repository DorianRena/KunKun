import csv
import os
import sys
import json
import argparse
from collections import defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo
from xml.sax.saxutils import escape as xml_escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, Image
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

import locale
try:
    locale.setlocale(locale.LC_TIME, 'fr_FR.UTF-8')
except locale.Error:
    locale.setlocale(locale.LC_TIME, '')
now = datetime.now(ZoneInfo("Europe/Paris"))

# ── Palette ───────────────────────────────────────────────────────────────────
BLUE        = colors.HexColor("#005191")
TEAL        = colors.HexColor("#4BACC6")
ORANGE      = colors.HexColor("#EC7405")
GREEN       = colors.HexColor("#9BBB59")
BEIGE_BG    = colors.HexColor("#EEECE1")
BLUE_LIGHT  = colors.HexColor("#D2EAF1")
WHITE       = colors.white
BLACK       = colors.HexColor("#1A1A1A")
GRAY_LIGHT  = colors.HexColor("#F4F6FB")
GRAY_MID    = colors.HexColor("#D0D7E8")
GRAY_DARK   = colors.HexColor("#6B7A99")
GRAY_ROW    = colors.HexColor("#EBF0F8")
RED         = colors.HexColor("#C0392B")
DARK_RED    = colors.HexColor("#8B0000")
PURPLE      = colors.HexColor("#7B2D8B")

SEV_COLORS = {
    "CRITICAL": RED,
    "MAJOR":    ORANGE,
    "MINOR":    colors.HexColor("#F5D623"),
    "INFO":     TEAL,
    "BLOCKER":  DARK_RED,
    "ERROR":    RED,
    "WARNING":  ORANGE,
    "HIGH":     RED,
    "MEDIUM":   ORANGE,
    "LOW":      TEAL,
}
SEV_TEXT = {
    "CRITICAL": WHITE, "MAJOR": WHITE, "MINOR": BLACK,
    "INFO": WHITE, "BLOCKER": WHITE, "ERROR": WHITE,
    "WARNING": WHITE, "HIGH": WHITE, "MEDIUM": WHITE, "LOW": WHITE,
}
TYPE_COLORS = {
    "VULNERABILITY": RED,
    "BUG":           ORANGE,
    "CODE_SMELL":    BLUE,
}

# ── Section color mapping ─────────────────────────────────────────────────────
SECTION_COLORS = {
    "sonar":      BLUE,
    "semgrep":    colors.HexColor("#1E6E3C"),
    "trufflehog": RED,
    "pipeline":   PURPLE,
}

# ── Helpers ───────────────────────────────────────────────────────────────────
def parse_effort(e):
    if not e or e.strip() in ("0min", ""):
        return 0
    e = e.strip().lower() # Ensure lowercase for consistency
    total = 0
    
    # Handle days (1 day = 8 hours = 480 minutes based on your effort_str logic)
    if "d" in e:
        parts = e.split("d")
        total += int(parts[0]) * 8 * 60
        e = parts[1]
        
    # Handle hours
    if "h" in e:
        parts = e.split("h")
        total += int(parts[0]) * 60
        e = parts[1]
        
    # Handle minutes
    if "min" in e:
        total += int(e.replace("min", ""))
        
    return total

def effort_str(minutes):
    if minutes == 0:
        return "0min"
    days = minutes // (8 * 60)
    rem  = minutes % (8 * 60)
    hours = rem // 60
    mins  = rem % 60
    parts = []
    if days:  parts.append(f"{days}d")
    if hours: parts.append(f"{hours}h")
    if mins:  parts.append(f"{mins}min")
    return " ".join(parts)

def short_component(c):
    parts = c.split(":")
    return parts[-1] if parts else c

def make_file_link(repo_url, file_path, line, platform, display_text, branch="HEAD", commit=None):
    """Retourne du markup ReportLab avec un lien cliquable vers le fichier dans GitLab/GitHub.
    Si repo_url est absent, retourne le texte sans lien."""
    if not repo_url or not file_path or file_path == "—":
        return display_text
    repo_base = repo_url.rstrip("/").removesuffix(".git")
    plat = (platform or "").lower()
    clean_path = file_path.lstrip("/")
    ref = commit if commit else (branch if branch and branch not in ("", "HEAD") else "HEAD")
    if "gitlab" in plat or "gitlab" in repo_base:
        url = f"{repo_base}/-/blob/{ref}/{clean_path}"
        if line and line != "—":
            url += f"#L{line}"
    else:
        # GitHub (défaut)
        url = f"{repo_base}/blob/{ref}/{clean_path}"
        if line and line != "—":
            url += f"#L{line}"
    return f'<link href="{url}"><u><font color="#005191">{display_text}</font></u></link>'

def parse_sonar_csv(file_path):
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

def load_metrics(metrics_input):
    stripped = metrics_input.strip().lstrip("\ufeff")
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        with open(stripped, "r", encoding="utf-8") as f:
            return json.load(f)

# ── Styles ────────────────────────────────────────────────────────────────────
def make_styles():
    s = {}
    s["cover_title"]    = ParagraphStyle("cover_title", fontName="Helvetica-Bold",
        fontSize=28, textColor=BLUE, leading=36, alignment=TA_LEFT)
    s["cover_subtitle"] = ParagraphStyle("cover_subtitle", fontName="Helvetica",
        fontSize=14, textColor=TEAL, leading=20, alignment=TA_LEFT)
    s["cover_meta"]     = ParagraphStyle("cover_meta", fontName="Helvetica",
        fontSize=10, textColor=GRAY_DARK, leading=15, alignment=TA_LEFT)
    s["h1"]  = ParagraphStyle("h1",  fontName="Helvetica-Bold", fontSize=14,
        textColor=BLUE, leading=20, spaceBefore=10, spaceAfter=4)
    s["h2"]  = ParagraphStyle("h2",  fontName="Helvetica-Bold", fontSize=11,
        textColor=BLUE, leading=16, spaceBefore=8,  spaceAfter=3)
    s["normal"]    = ParagraphStyle("normal",    fontName="Helvetica", fontSize=9,
        textColor=BLACK, leading=13)
    s["small"]     = ParagraphStyle("small",     fontName="Helvetica", fontSize=7.5,
        textColor=GRAY_DARK, leading=11)
    s["th"]        = ParagraphStyle("th",        fontName="Helvetica-Bold", fontSize=8,
        textColor=WHITE, leading=11, alignment=TA_CENTER)
    s["th_left"]   = ParagraphStyle("th_left",   fontName="Helvetica-Bold", fontSize=8,
        textColor=WHITE, leading=11, alignment=TA_LEFT)
    s["td"]        = ParagraphStyle("td",        fontName="Helvetica",      fontSize=8,
        textColor=BLACK, leading=11)
    s["td_center"] = ParagraphStyle("td_center", fontName="Helvetica",      fontSize=8,
        textColor=BLACK, leading=11, alignment=TA_CENTER)
    s["td_mono"]   = ParagraphStyle("td_mono",   fontName="Courier",        fontSize=7.5,
        textColor=BLACK, leading=11)
    s["td_bold"]   = ParagraphStyle("td_bold",   fontName="Helvetica-Bold", fontSize=8,
        textColor=BLACK, leading=11)
    s["footer"]    = ParagraphStyle("footer",    fontName="Helvetica",      fontSize=7.5,
        textColor=GRAY_DARK, alignment=TA_CENTER)
    s["bullet"]    = ParagraphStyle("bullet",    fontName="Helvetica",      fontSize=9,
        textColor=BLACK, leading=13, leftIndent=10, spaceBefore=2)
    s["kpi_label"] = ParagraphStyle("kpi_label", fontName="Helvetica-Bold", fontSize=7,
        textColor=GRAY_DARK, leading=10, alignment=TA_CENTER)
    s["kpi_value"] = ParagraphStyle("kpi_value", fontName="Helvetica-Bold", fontSize=20,
        textColor=BLUE, leading=26, alignment=TA_CENTER)
    s["toc_entry"] = ParagraphStyle("toc_entry", fontName="Helvetica",      fontSize=10,
        textColor=BLACK, leading=18, leftIndent=10)
    s["toc_title"] = ParagraphStyle("toc_title", fontName="Helvetica-Bold", fontSize=13,
        textColor=BLUE, leading=20, spaceBefore=4, spaceAfter=2)
    return s

# ── Header / Footer ───────────────────────────────────────────────────────────
def _draw_header(canvas, doc, first=False, project_name="", section_color=BLUE):
    W, H = A4
    margin = 15 * mm
    if first:
        canvas.setFillColor(BEIGE_BG)
        canvas.rect(0, H - 75 * mm, W, 75 * mm, fill=1, stroke=0)
        canvas.setFillColor(BLUE)
        canvas.rect(margin, H - 66 * mm, 2 * mm, 54 * mm, fill=1, stroke=0)
    else:
        canvas.setFillColor(section_color)
        canvas.rect(0, H - 12 * mm, W, 12 * mm, fill=1, stroke=0)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(WHITE)
        canvas.drawString(margin, H - 8 * mm, project_name)
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(W - margin, H - 8 * mm, "Rapport d'analyse — KunKun")

def _draw_footer(canvas, doc):
    W, H = A4
    margin = 15 * mm
    canvas.setFillColor(GRAY_LIGHT)
    canvas.rect(0, 0, W, 10 * mm, fill=1, stroke=0)
    canvas.setFillColor(BLUE)
    canvas.rect(0, 10 * mm, W, 0.8 * mm, fill=1, stroke=0)
    canvas.setFillColor(BLUE_LIGHT)
    p = canvas.beginPath()
    p.moveTo(W - 20 * mm, 0)
    p.lineTo(W, 0)
    p.lineTo(W, 20 * mm)
    p.close()
    canvas.drawPath(p, fill=1, stroke=0)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.setFillColor(BLUE)
    canvas.drawRightString(W - 2 * mm, 6 * mm, str(doc.page))
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(GRAY_DARK)
    canvas.drawString(margin, 3.5 * mm,
        f"KunKun  —  Généré le {now.strftime('%d/%m/%Y %H:%M')}")

# ── Table base style factory ──────────────────────────────────────────────────
def table_base(header_color=BLUE):
    return TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), header_color),
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

TABLE_BASE = table_base(BLUE)

def section_heading(title, s, level=1, color=BLUE):
    h_style = ParagraphStyle(f"h{level}_col", fontName="Helvetica-Bold",
        fontSize=14 if level == 1 else 11,
        textColor=color, leading=20 if level == 1 else 16,
        spaceBefore=10 if level == 1 else 8, spaceAfter=4 if level == 1 else 3)
    hr_color = color if level == 1 else TEAL
    thickness = 1.5 if level == 1 else 0.5
    return [Paragraph(title, h_style),
            HRFlowable(width="100%", thickness=thickness, color=hr_color, spaceAfter=4)]

def kpi_card(label, value, color=BLUE, s=None):
    rows = [
        [Paragraph(label, s["kpi_label"])],
        [Paragraph(str(value), ParagraphStyle("kpiv", fontName="Helvetica-Bold",
            fontSize=18, textColor=color, leading=24, alignment=TA_CENTER))],
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

# ── SONAR section ─────────────────────────────────────────────────────────────
def build_sonar_section(story, metrics, s, usable):
    sonar = metrics["sonar"]
    project_name = sonar.get("name", sonar.get("key", "N/A"))
    csv_file = sonar.get("csvFile", "")
    sonar_status = sonar.get("status", "NONE")

    # Read measures
    measures = {m["metric"]: m["value"] for m in sonar.get("measures", [])}
    alert_status = measures.get("alert_status", sonar_status)

    # Quality gate badge
    qg_color = GREEN if alert_status == "OK" else RED
    qg_label = "PASSED" if alert_status == "OK" else "FAILED"

    for el in section_heading("SonarQube — Analyse statique", s, level=1, color=BLUE):
        story.append(el)
    story.append(Spacer(1, 2 * mm))

    # Quality gate + project info row
    qg_style = ParagraphStyle("qg", fontName="Helvetica-Bold", fontSize=11,
        textColor=WHITE, leading=14, alignment=TA_CENTER)
    proj_style = ParagraphStyle("proj", fontName="Helvetica-Bold", fontSize=9,
        textColor=BLUE, leading=12)

    qg_cell = Table([[Paragraph(f"Quality Gate: {qg_label}", qg_style)]],
                    colWidths=[usable * 0.3])
    qg_cell.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), qg_color),
        ("TOPPADDING",    (0,0),(-1,-1), 8),
        ("BOTTOMPADDING", (0,0),(-1,-1), 8),
        ("LEFTPADDING",   (0,0),(-1,-1), 8),
        ("RIGHTPADDING",  (0,0),(-1,-1), 8),
    ]))

    info_data = [
        [Paragraph("Projet :", proj_style), Paragraph(project_name, s["td_mono"])],
        [Paragraph("Fiabilité :", proj_style), Paragraph(
            "A" if measures.get("reliability_rating","1.0") == "1.0" else measures.get("reliability_rating","—"), s["td"])],
        [Paragraph("Securité :", proj_style), Paragraph(
            "A" if measures.get("security_rating","1.0") == "1.0" else measures.get("security_rating","—"), s["td"])],
        [Paragraph("Maintenabilité :", proj_style), Paragraph(
            "A" if measures.get("sqale_rating","1.0") == "1.0" else measures.get("sqale_rating","—"), s["td"])],
    ]
    info_cell = Table(info_data, colWidths=[usable * 0.2, usable * 0.48])
    info_cell.setStyle(TableStyle([
        ("TOPPADDING",    (0,0),(-1,-1), 3),
        ("BOTTOMPADDING", (0,0),(-1,-1), 3),
        ("LEFTPADDING",   (0,0),(-1,-1), 5),
        ("RIGHTPADDING",  (0,0),(-1,-1), 5),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ]))

    header_row = Table([[qg_cell, info_cell]], colWidths=[usable * 0.32, usable * 0.68])
    header_row.setStyle(TableStyle([
        ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
        ("LEFTPADDING",  (0,0),(-1,-1), 0),
        ("RIGHTPADDING", (0,0),(-1,-1), 0),
        ("BOX",          (0,0),(-1,-1), 0.5, GRAY_MID),
    ]))
    story.append(header_row)
    story.append(Spacer(1, 5 * mm))

    # KPI row from measures
    nb_file   = measures.get("files",          "0")
    nb_line  = measures.get("lines","0")
    dup_val    = measures.get("duplicated_lines_density", "—")
    cov_val    = measures.get("coverage",       "—")

    kpi_data = [[
        kpi_card("NB FICHIERS", nb_file,  BLUE, s=s),
        kpi_card("NB LIGNES", nb_line,  BLUE,    s=s),
        kpi_card("DUPLICATION", f"{dup_val}%", BLUE, s=s),
        kpi_card("COUVERTURE", f"{cov_val}%", BLUE, s=s),
    ]]
    kpi_row = Table(kpi_data, colWidths=[(usable / 4)+4] * 4, hAlign="LEFT")
    kpi_row.setStyle(TableStyle([
        ("LEFTPADDING",  (0,0),(-1,-1), 2),
        ("RIGHTPADDING", (0,0),(-1,-1), 2),
        ("VALIGN",       (0,0),(-1,-1), "TOP"),
    ]))
    story.append(kpi_row)
    story.append(Spacer(1, 5 * mm))

    # Detailed issues from CSV if available
    repo_url = metrics.get("info", {}).get("repoUrl") or metrics.get("sonar", {}).get("repoUrl") or ""
    platform = metrics.get("info", {}).get("platform") or ""
    branch   = metrics.get("info", {}).get("branch") or "HEAD"
    if csv_file and os.path.exists(csv_file):
        issues = parse_sonar_csv(csv_file)
        _build_sonar_issues(story, issues, s, usable, repo_url=repo_url, platform=platform, branch=branch)
    else:
        story.append(Paragraph(
            f"Fichier CSV d'issues non trouvé : {csv_file}", s["small"]))
    story.append(Spacer(1, 4 * mm))

def _build_sonar_issues(story, issues, s, usable, repo_url="", platform="", branch="HEAD"):
    total       = len(issues)
    by_type     = defaultdict(int)
    by_file     = defaultdict(int)
    total_effort = 0

    for iss in issues:
        by_type[iss["type"]] += 1
        by_file[iss["_file"]] += 1
        total_effort += iss["_effort_min"]

    # Summary KPIs
    vuln_c  = by_type.get("VULNERABILITY", 0)
    bug_c   = by_type.get("BUG", 0)
    smell_c = by_type.get("CODE_SMELL", 0)
    h_str   = effort_str(total_effort)

    for el in section_heading("Resumé des issues", s, level=2, color=BLUE):
        story.append(el)

    kpi_data = [[
        kpi_card("TOTAL",          total,    BLUE,   s=s),
        kpi_card("VULNERABILITÉS", vuln_c,   RED,    s=s),
        kpi_card("BUGS",           bug_c,    ORANGE, s=s),
        kpi_card("CODE SMELLS",    smell_c,  TEAL,   s=s),
        kpi_card("EFFORT TOTAL",   h_str,    BLUE,   s=s),
    ]]
    kpi_row = Table(kpi_data, colWidths=[(usable / 5)-3] * 5, hAlign="LEFT")
    kpi_row.setStyle(TableStyle([
        ("LEFTPADDING",  (0,0),(-1,-1), 2),
        ("RIGHTPADDING", (0,0),(-1,-1), 2),
        ("VALIGN",       (0,0),(-1,-1), "TOP"),
    ]))
    story.append(kpi_row)
    story.append(Spacer(1, 4 * mm))

    # Cross-table severity × type
    sev_order  = ["INFO", "MINOR", "MAJOR", "CRITICAL", "BLOCKER"]
    type_order = ["BUG", "VULNERABILITY", "CODE_SMELL"]
    cross = defaultdict(lambda: defaultdict(int))
    for iss in issues:
        cross[iss["type"]][iss["severity"]] += 1

    for el in section_heading("Répartition par sévérité et type", s, level=2, color=BLUE):
        story.append(el)

    cross_header = [Paragraph("Type / Criticite", s["th_left"])] + \
        [Paragraph(sv, s["th"]) for sv in sev_order]
    cross_rows = [cross_header]
    for tp in type_order:
        row = [Paragraph(tp.replace("_", " "), s["td"])]
        for sv in sev_order:
            v = cross[tp][sv]
            cell_style = s["td_center"]
            if v > 0 and sv in ("CRITICAL", "BLOCKER"):
                cell_style = ParagraphStyle("hot", fontName="Helvetica-Bold",
                    fontSize=8, textColor=RED, leading=11, alignment=TA_CENTER)
            row.append(Paragraph(str(v) if v > 0 else "—", cell_style))
        cross_rows.append(row)

    col_ws = [usable * 0.28] + [usable * 0.72 / len(sev_order)] * len(sev_order)
    ctable = Table(cross_rows, colWidths=col_ws)
    ctable.setStyle(TABLE_BASE)
    story.append(ctable)
    story.append(Spacer(1, 4 * mm))

    # Top files
    for el in section_heading("Fichiers les plus affectés (Top 8)", s, level=2, color=BLUE):
        story.append(el)

    top_files = sorted(by_file.items(), key=lambda x: -x[1])[:8]
    max_f = top_files[0][1] if top_files else 1
    file_rows = [[
        Paragraph("Fichier", s["th_left"]),
        Paragraph("Issues", s["th"]),
        Paragraph("Proportion", s["th_left"]),
    ]]
    for fname, cnt in top_files:
        bar_len = int((cnt / max_f) * 20)
        bar = "█" * bar_len
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
    story.append(Spacer(1, 15 * mm))

    # Grouped issues list
    for el in section_heading("Liste des issues par règles", s, level=2, color=BLUE):
        story.append(el)

    rule_summary = {}
    for iss in issues:
        key = (
            xml_escape(iss.get("rule", "")).replace(":","<br/>:"),
            xml_escape(iss.get("message", "").strip('"'))[:1000],
            iss.get("type", "").replace("VULNERABILITY", "VULN"),
            iss.get("severity", ""),
        )
        if key not in rule_summary:
            rule_summary[key] = {"count": 0, "effort": 0}
        rule_summary[key]["count"] += 1
        rule_summary[key]["effort"] += iss["_effort_min"]

    type_priority = {"VULN": 0, "BUG": 1, "CODE_SMELL": 2}
    sev_sort = {"BLOCKER": 0, "CRITICAL": 1, "MAJOR": 2, "MINOR": 3, "INFO": 4}
    sorted_rules = sorted(rule_summary.items(),
        key=lambda x: (
            type_priority.get(x[0][2], 3), 
            sev_sort.get(x[0][3], 5)
        ))

    list_rows = [[
        Paragraph("Criticité", s["th"]),
        Paragraph("Type",      s["th"]),
        Paragraph("Règle",     s["th_left"]),
        Paragraph("Message",   s["th_left"]),
        Paragraph("Nb",        s["th"]),
    ]]
    list_style_cmds = list(TABLE_BASE._cmds)
    for (rule, msg, tp, sev), info in sorted_rules:
        sev_c = SEV_COLORS.get(sev, GRAY_MID)
        sev_t = SEV_TEXT.get(sev, BLACK)
        badge_s = ParagraphStyle("bs", fontName="Helvetica-Bold", fontSize=7,
            textColor=sev_t, leading=9, alignment=TA_CENTER)
        list_rows.append([
            Paragraph(sev, badge_s),
            Paragraph(tp.replace("_", " "), s["td_center"]),
            Paragraph(rule, s["td_mono"]),
            Paragraph(msg, s["td"]),
            Paragraph(str(info["count"]), s["td_center"]),
        ])

    for i, ((rule, msg, tp, sev), info) in enumerate(sorted_rules, start=1):
        sev_c = SEV_COLORS.get(sev, GRAY_MID)
        list_style_cmds.append(("BACKGROUND", (0, i), (0, i), sev_c))

    list_col_ws = [usable * 0.10, usable * 0.10, usable * 0.12, usable * 0.59, usable * 0.08]
    ltable = Table(list_rows, colWidths=list_col_ws, repeatRows=1)
    ltable.setStyle(TableStyle(list_style_cmds))
    story.append(ltable)
    story.append(Spacer(1, 4 * mm))

    # Detailed issues
    for el in section_heading("Détail des problèmes", s, level=2, color=BLUE):
        story.append(el)

    det_rows = [[
        Paragraph("Criticité",       s["th"]),
        Paragraph("Type",            s["th"]),
        Paragraph("Règle",           s["th_left"]),
        Paragraph("Message",         s["th_left"]),
        Paragraph("Fichier / Ligne", s["th_left"]),
        Paragraph("Effort",          s["th"]),
    ]]
    type_priority = {"VULNERABILITY": 0, "BUG": 1, "CODE_SMELL": 2}
    sorted_issues = sorted(issues,
        key=lambda x: (
            type_priority.get(x.get("type", ""), 3),
            sev_sort.get(x.get("severity", ""), 5)
        ))
    det_style_cmds = list(TABLE_BASE._cmds)

    for i, iss in enumerate(sorted_issues, start=1):
        sev  = iss.get("severity", "")
        tp   = iss.get("type", "").replace("VULNERABILITY", "VULN")
        rule    = xml_escape(iss.get("rule", "")).replace(":","<br/>:")
        try:
            line = int(float(iss.get("line", 0)))
        except Exception:
            line = 0
        file_path = iss['_file']
        loc_display = f"{xml_escape(file_path)} <b>L.{line}</b>"
        loc = make_file_link(repo_url, file_path, line, platform, loc_display, branch=branch)
        raw_msg = xml_escape(iss.get("message", "").strip('"').replace('""', '"'))
        msg     = (raw_msg[:22] + "…") if len(raw_msg) > 22 else raw_msg
        eff     = iss.get("effort", "—")
        sev_c   = SEV_COLORS.get(sev, GRAY_MID)
        sev_t   = SEV_TEXT.get(sev, BLACK)
        badge_s = ParagraphStyle("bs2", fontName="Helvetica-Bold", fontSize=7,
            textColor=sev_t, leading=9, alignment=TA_CENTER)
        det_rows.append([
            Paragraph(sev,                  badge_s),
            Paragraph(tp.replace("_", " "), s["td_center"]),
            Paragraph(rule,                 s["td_mono"]),
            Paragraph(msg,                  s["td"]),
            Paragraph(loc,                  s["td_mono"]),
            Paragraph(eff,                  s["td_center"]),
        ])
        det_style_cmds.append(("BACKGROUND", (0, i), (0, i), sev_c))

    det_col_ws = [usable * 0.10, usable * 0.10, usable * 0.12, usable * 0.14, usable * 0.45, usable * 0.08]
    dtable = Table(det_rows, colWidths=det_col_ws, repeatRows=1)
    dtable.setStyle(TableStyle(det_style_cmds))
    story.append(dtable)


# ── SEMGREP section ───────────────────────────────────────────────────────────
def build_semgrep_section(story, metrics, s, usable):
    SGREP_COLOR = SECTION_COLORS["semgrep"]
    semgrep_raw = metrics["semgrep"]
    if isinstance(semgrep_raw, str):
        semgrep_data = json.loads(semgrep_raw)
    else:
        semgrep_data = semgrep_raw

    results = semgrep_data.get("results", [])
    version = semgrep_data.get("version", "—")
    repo_url = metrics.get("info", {}).get("repoUrl") or ""
    platform = metrics.get("info", {}).get("platform") or ""
    branch   = metrics.get("info", {}).get("branch") or "HEAD"

    for el in section_heading("Semgrep — Analyse SAST", s, level=1, color=SGREP_COLOR):
        story.append(el)
    story.append(Spacer(1, 2 * mm))

    # KPIs
    sev_counts = defaultdict(int)
    by_cat = defaultdict(int)
    for r in results:
        sev = r.get("extra", {}).get("metadata", {}).get("severity",
              r.get("extra", {}).get("severity", "ERROR")).upper()
        sev_counts[sev] += 1
        by_cat[r.get("extra", {}).get("metadata", {}).get("category", "unknown")] += 1

    total_findings = len(results)
    kpi_items = [[
        kpi_card("TOTAL",     total_findings,          SGREP_COLOR, s=s),
        kpi_card("ERREURS",   sev_counts.get("ERROR",0),  RED,     s=s),
        kpi_card("WARNINGS",  sev_counts.get("WARNING",0), ORANGE, s=s),
        kpi_card("VERSION",   version,                  GRAY_DARK, s=s),
    ]]
    kpi_row = Table(kpi_items, colWidths=[(usable / 4)+5] * 4, hAlign="LEFT")
    kpi_row.setStyle(TableStyle([
        ("LEFTPADDING",  (0,0),(-1,-1), 2),
        ("RIGHTPADDING", (0,0),(-1,-1), 2),
        ("VALIGN",       (0,0),(-1,-1), "TOP"),
    ]))
    story.append(kpi_row)
    story.append(Spacer(1, 4 * mm))

    if not results:
        story.append(Paragraph("Aucune vulnerabilité detectée par Semgrep.", s["normal"]))
        story.append(Spacer(1, 4 * mm))
        return

    # Findings table
    for el in section_heading("Vulnérabilités détectées", s, level=2, color=SGREP_COLOR):
        story.append(el)

    sev_priority = {"ERROR": 0, "WARNING": 1}
    sorted_semgrep = sorted(results, 
        key=lambda x: sev_priority.get(x.get("extra", {}).get("severity", "WARNING"), 2)
    )

    tbase = table_base(SGREP_COLOR)
    rows = [[
        Paragraph("Sévérité", s["th"]),
        Paragraph("Règle", s["th_left"]),
        Paragraph("OWASP", s["th"]),
        Paragraph("CWE", s["th"]),
        Paragraph("Description", s["th_left"]),
        Paragraph("Fichier / Ligne", s["th_left"]),
    ]]
    
    style_cmds = list(tbase._cmds)
    for i, r in enumerate(sorted_semgrep, start=1):
        path    = r.get("path", "—").replace("/repo/", "")
        line    = r.get("start", {}).get("line", "—")
        loc_display = f"{path} <b>L.{line}</b>"
        loc     = make_file_link(repo_url, path, line, platform, loc_display, branch=branch)
        rule_id = r.get("check_id", "—").split(".")[-1]
        meta    = r.get("extra", {}).get("metadata", {})
        sev     = meta.get("severity", r.get("extra", {}).get("severity", "ERROR")).upper()
        
        # Extraction CWE et OWASP
        cwe_list = meta.get("cwe", [])
        cwe_str = cwe_list[0].split(":")[0] if cwe_list else "—"
        owasp_list = meta.get("owasp", [])
        owasp_str = owasp_list[0] if owasp_list else "—"
        
        msg     = r.get("extra", {}).get("message", "—")[:1000] 
        sev_c   = SEV_COLORS.get(sev, GRAY_MID)
        sev_t   = SEV_TEXT.get(sev, BLACK)
        
        badge_s = ParagraphStyle("sgbadge", fontName="Helvetica-Bold", fontSize=7,
                                textColor=sev_t, leading=9, alignment=TA_CENTER)
                
        rows.append([
            Paragraph(sev, badge_s),
            Paragraph(rule_id, s["td_mono"]),
            Paragraph(owasp_str, s["td_center"]),
            Paragraph(cwe_str, s["td_center"]),
            Paragraph(msg, s["td"]),
            Paragraph(loc, s["td_mono"]),
        ])
        style_cmds.append(("BACKGROUND", (0, i), (0, i), sev_c))

    col_ws = [usable * p for p in [0.10, 0.15, 0.10, 0.10, 0.33, 0.22]]
    t = Table(rows, colWidths=col_ws, repeatRows=1)
    t.setStyle(TableStyle(style_cmds))
    story.append(t)
    story.append(Spacer(1, 4 * mm))

# ── TRUFFLEHOG section ────────────────────────────────────────────────────────
def build_trufflehog_section(story, metrics, s, usable):
    TH_COLOR = SECTION_COLORS["trufflehog"]
    findings = metrics["trufflehog"]
    repo_url = metrics.get("info", {}).get("repoUrl") or ""
    platform = metrics.get("info", {}).get("platform") or ""
    branch   = metrics.get("info", {}).get("branch") or "HEAD"

    for el in section_heading("TruffleHog — Secrets détectés", s, level=1, color=TH_COLOR):
        story.append(el)
    story.append(Spacer(1, 2 * mm))

    # Récupération des données sources pour déterminer si c'est un repo git ou filesystem
    has_commit = metrics.get("info", {}).get("commit", {}) or "Non"

    # Statistiques basées sur les données déjà dédoublonnées (findings)
    by_detector = defaultdict(int)
    for f in findings:
        by_detector[f.get("DetectorName", "Unknown")] += 1

    kpi_items = [[
        kpi_card("TOTAL DÉTECTIONS", len(findings), TH_COLOR, s=s),
        kpi_card("TYPES UNIQUES", len(by_detector), PURPLE, s=s),
        kpi_card("AVEC COMMIT", has_commit, BLUE, s=s), # Ajout ici
    ]]
    
    kpi_row = Table(kpi_items, colWidths=[usable / 3, usable / 3, usable / 3], hAlign="CENTER")
    kpi_row.setStyle(TableStyle([
        ("LEFTPADDING", (0,0), (-1,-1), 2), 
        ("RIGHTPADDING", (0,0), (-1,-1), 2),
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
    ]))
    story.append(kpi_row)
    story.append(Spacer(1, 4 * mm))

    if not findings:
        story.append(Paragraph("Aucun secret détecté par TruffleHog.", s["normal"]))
        return

    # Note de contexte sur les faux positifs potentiels
    story.append(Paragraph(
        "<b>Note :</b> Certains secrets peuvent provenir de fichiers de librairies tiers "
        "(ex: .jar), ce qui peut générer des faux positifs. Il est recommandé de vérifier l'emplacement et le contexte de chaque détection.",
        s["small"]))
    story.append(Spacer(1, 3 * mm))

    # Findings table
    for el in section_heading("Liste des secrets", s, level=2, color=TH_COLOR):
        story.append(el)

    tbase = table_base(TH_COLOR)
    rows = [[
        Paragraph("Valeur (anonymisée)", s["th_left"]),
        Paragraph("Type", s["th_left"]),
        Paragraph("Description du détecteur", s["th_left"]),
        Paragraph("Emplacement (Fichier/Ligne)", s["th_left"]),
    ]]
    
    for f in findings:
        data = f.get("SourceMetadata", {}).get("Data", {})
        git_data = data.get("Git")
        fs_data = data.get("Filesystem")
        fs = git_data or fs_data or {}        

        # Logique d'anonymisation
        raw = f.get("Raw", "")
        display = f.get("Redacted")
        if not display and raw:
            display = raw[:4] + "*" * 8 + raw[-4:] if len(raw) > 8 else "****"
            
        path = fs.get("file", "—").replace("/repo/", "")
        line = str(fs.get("line", "—"))
        loc_display = f"{path} <b>L.{line}</b>"
        
        commit = git_data.get("commit") if git_data else None
        loc = make_file_link(repo_url, path, line, platform, loc_display, branch=branch, commit=commit)
        
        rows.append([
            Paragraph(display, s["td_mono"]),
            Paragraph(f.get("DetectorName", "—"), s["td"]),
            Paragraph(f.get("DetectorDescription", "—"), s["td"]),
            Paragraph(loc, s["td_mono"]),
        ])

    col_ws = [usable * p for p in [0.20, 0.12, 0.38, 0.30]]
    t = Table(rows, colWidths=col_ws, repeatRows=1)
    t.setStyle(TableStyle(tbase._cmds))
    story.append(t)
    story.append(Spacer(1, 4 * mm))


# ── PIPELINE section ──────────────────────────────────────────────────────────
def _fmt_dt(iso_str):
    """Formate une date ISO 8601 en 'DD/MM/YYYY HH:MM'. Retourne '—' si invalide."""
    if not iso_str:
        return "—"
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y %H:%M")
    except (ValueError, AttributeError):
        return iso_str[:16].replace("T", " ")

def _short_sha(sha):
    """Retourne les 7 premiers caractères d'un SHA de commit."""
    if not sha:
        return "—"
    return sha[:7]

def build_pipeline_section(story, metrics, s, usable):
    PL_COLOR = SECTION_COLORS["pipeline"]
    pipeline = metrics["pipeline"]
    findings_raw = pipeline.get("findings", [])
    stats        = pipeline.get("stats", {})

    for el in section_heading("Pipeline CI — Secrets dans les logs", s, level=1, color=PL_COLOR):
        story.append(el)
    story.append(Spacer(1, 2 * mm))

    # Deduplicate by (runName, jobName, line, secretType, preview)
    seen = set()
    findings = []
    for f in findings_raw:
        key = (f.get("runName",""), f.get("jobName",""),
               f.get("line",0), f.get("secretType",""), f.get("preview",""))
        if key not in seen:
            seen.add(key)
            findings.append(f)

    # ── Infos plateforme ──────────────────────────────────────────────────────
    first_f  = findings[0] if findings else findings_raw[0] if findings_raw else {}
    platform = (stats.get("platform") or first_f.get("platform") or "—").upper()
    repo_url = stats.get("repoUrl") or first_f.get("repoUrl") or ""

    label_style = ParagraphStyle("pl_label", fontName="Helvetica-Bold", fontSize=8,
        textColor=PL_COLOR, leading=11)
    value_style = ParagraphStyle("pl_value", fontName="Helvetica", fontSize=8,
        textColor=BLACK, leading=11)
    mono_style  = ParagraphStyle("pl_mono",  fontName="Courier",   fontSize=7.5,
        textColor=GRAY_DARK, leading=11)

    platform_badge_style = ParagraphStyle("pl_badge", fontName="Helvetica-Bold",
        fontSize=11, textColor=WHITE, leading=14, alignment=TA_CENTER)
    badge_cell = Table(
        [[Paragraph(platform, platform_badge_style)]],
        colWidths=[usable * 0.18],
    )
    badge_cell.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), PL_COLOR),
        ("TOPPADDING",    (0,0),(-1,-1), 8),
        ("BOTTOMPADDING", (0,0),(-1,-1), 8),
        ("LEFTPADDING",   (0,0),(-1,-1), 8),
        ("RIGHTPADDING",  (0,0),(-1,-1), 8),
    ]))

    repo_display = repo_url if repo_url else "—"
    platform_info_data = [
        [Paragraph("Plateforme :", label_style), Paragraph(platform, value_style)],
        [Paragraph("Dépôt :",      label_style), Paragraph(repo_display, mono_style)],
    ]
    platform_info_cell = Table(platform_info_data,
        colWidths=[usable * 0.16, usable * 0.62])
    platform_info_cell.setStyle(TableStyle([
        ("TOPPADDING",    (0,0),(-1,-1), 3),
        ("BOTTOMPADDING", (0,0),(-1,-1), 3),
        ("LEFTPADDING",   (0,0),(-1,-1), 6),
        ("RIGHTPADDING",  (0,0),(-1,-1), 6),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ]))

    platform_row = Table(
        [[badge_cell, platform_info_cell]],
        colWidths=[usable * 0.20, usable * 0.80],
    )
    platform_row.setStyle(TableStyle([
        ("VALIGN",       (0,0),(-1,-1), "MIDDLE"),
        ("LEFTPADDING",  (0,0),(-1,-1), 0),
        ("RIGHTPADDING", (0,0),(-1,-1), 0),
        ("BOX",          (0,0),(-1,-1), 0.5, GRAY_MID),
    ]))
    story.append(platform_row)
    story.append(Spacer(1, 4 * mm))

    # ── KPIs ─────────────────────────────────────────────────────────────────
    runs_scanned = stats.get("runsScanned", "—")
    jobs_scanned = stats.get("jobsScanned", "—")

    by_type = defaultdict(int)
    for f in findings:
        by_type[f.get("secretType", "Unknown")] += 1

    kpi_items = [[
        kpi_card("RUNS SCANNÉS",    runs_scanned,  PL_COLOR, s=s),
        kpi_card("JOBS SCANNÉS",    jobs_scanned,  PL_COLOR, s=s),
        kpi_card("SECRETS (dedup)", len(findings), RED,      s=s),
        kpi_card("TYPES DISTINCTS", len(by_type),  ORANGE,   s=s),
    ]]
    kpi_row = Table(kpi_items, colWidths=[usable / 4] * 4, hAlign="LEFT")
    kpi_row.setStyle(TableStyle([
        ("LEFTPADDING",  (0,0),(-1,-1), 2),
        ("RIGHTPADDING", (0,0),(-1,-1), 2),
        ("VALIGN",       (0,0),(-1,-1), "TOP"),
    ]))
    story.append(kpi_row)
    story.append(Spacer(1, 4 * mm))

    if not findings:
        story.append(Paragraph("Aucun secret detecté dans les logs de pipeline.", s["normal"]))
        story.append(Spacer(1, 4 * mm))
        return

    # ── Répartition par type ──────────────────────────────────────────────────
    for el in section_heading("Répartition par type", s, level=2, color=PL_COLOR):
        story.append(el)

    tbase = table_base(PL_COLOR)
    type_rows = [[
        Paragraph("Type de secret", s["th_left"]),
        Paragraph("Nombre", s["th"]),
    ]]
    for secret_type, cnt in sorted(by_type.items(), key=lambda x: -x[1]):
        type_rows.append([
            Paragraph(secret_type, s["td"]),
            Paragraph(str(cnt), s["td_center"]),
        ])
    tt = Table(type_rows, colWidths=[usable * 0.7, usable * 0.3])
    tt.setStyle(tbase)
    story.append(tt)
    story.append(Spacer(1, 4 * mm))

    # ── Détail des findings ───────────────────────────────────────────────────
    for el in section_heading("Détail des secrets détectés", s, level=2, color=PL_COLOR):
        story.append(el)

    det_rows = [[
        Paragraph("Pipeline / Branch", s["th_left"]),
        Paragraph("Job", s["th_left"]),
        Paragraph("Date / Heure", s["th_left"]),
        Paragraph("Commit", s["th_left"]),
        Paragraph("Ligne", s["th"]),
        Paragraph("Type", s["th_left"]),
        Paragraph("Aperçu", s["th_left"]),
    ]]
    style_cmds = list(tbase._cmds)

    SECRET_COLORS = {
        "AWS Access Key":  RED,
        "AWS Secret Key":  RED,
        "Stripe Key":      ORANGE,
        "Private Key":     DARK_RED,
        "Generic Token":   PURPLE,
    }

    for i, f in enumerate(findings, start=1):
        run_url    = f.get("runUrl") or ""
        f_platform = (f.get("platform") or "").lower()
        job_id     = f.get("jobId")
        run_name   = f.get("runName", "—")
        branch     = f.get("branch", "")
        job_name   = f.get("jobName", "—")
        job_status = f.get("jobStatus", "")

        # ── Lien sur le nom du pipeline (run) ────────────────────────────────
        if run_url:
            pipeline_info = (
                f'<link href="{run_url}">{run_name}</link>'
                f"<br/><font size='7' color='grey'>{branch}</font>"
            )
        else:
            pipeline_info = (
                f"{run_name}"
                f"<br/><font size='7' color='grey'>{branch}</font>"
            )

        # ── Lien sur le nom du job, affiché en bleu souligné ─────────────────
        if run_url and job_id:
            if f_platform == "github":
                job_url = f"{run_url}/job/{job_id}"
            elif f_platform == "gitlab":
                repo_base = f.get("repoUrl", "").rstrip("/").removesuffix(".git")
                job_url = f"{repo_base}/-/jobs/{job_id}"
            else:
                job_url = run_url
            job_info = (
                f'<link href="{job_url}"><u><font color="#005191">{job_name}</font></u></link>'
                f"<br/><font size='7'>{job_status}</font>"
            )
        else:
            job_info = (
                f"{job_name}"
                f"<br/><font size='7'>{job_status}</font>"
            )

        # Date/heure : priorité jobStartedAt, sinon createdAt du run
        dt_str = _fmt_dt(f.get("jobStartedAt") or f.get("createdAt"))

        # Commit : SHA court + message tronqué sur une 2e ligne
        sha       = _short_sha(f.get("commitSha"))
        msg_raw   = f.get("commitMessage") or ""
        msg_trunc = (msg_raw[:38] + "…") if len(msg_raw) > 38 else msg_raw
        commit_info = (
            f"<font name='Courier' size='7'>{sha}</font>"
            + (f"<br/><font size='6.5' color='grey'>{msg_trunc}</font>" if msg_trunc else "")
        )

        line        = str(f.get("line", "—"))
        secret_type = f.get("secretType", "—")
        preview     = f.get("preview", "—")
        row_color   = SECRET_COLORS.get(secret_type, TEAL)

        det_rows.append([
            Paragraph(pipeline_info, s["td"]),
            Paragraph(job_info,      s["td"]),
            Paragraph(dt_str,        s["td"]),
            Paragraph(commit_info,   s["td"]),
            Paragraph(line,          s["td_center"]),
            Paragraph(secret_type,   s["td"]),
            Paragraph(preview,       s["td_mono"]),
        ])
        style_cmds.append(("TEXTCOLOR", (5, i), (5, i), row_color))
        style_cmds.append(("FONTNAME",  (5, i), (5, i), "Helvetica-Bold"))

    col_ws = [usable * p for p in [0.20, 0.10, 0.13, 0.18, 0.07, 0.18, 0.14]]
    dt = Table(det_rows, colWidths=col_ws, repeatRows=1)
    dt.setStyle(TableStyle(style_cmds))
    story.append(dt)
    story.append(Spacer(1, 4 * mm))


# ── COVER PAGE ─────────────────────────────────────────────────────────────────
def build_cover(story, metrics, s, usable, sections_present):
    W, H = A4
    story.append(Spacer(1, 70 * mm))

    # Global KPI summary across all present tools
    total_findings = 0
    critical_count = 0

    if "sonar" in sections_present:
        sonar_m = metrics["sonar"]
        ms = {m["metric"]: m["value"] for m in sonar_m.get("measures", [])}
        total_findings += int(float(ms.get("bugs","0"))) + \
                          int(float(ms.get("vulnerabilities","0"))) + \
                          int(float(ms.get("code_smells","0")))

    if "semgrep" in sections_present:
        sraw = metrics["semgrep"]
        sdata = json.loads(sraw) if isinstance(sraw, str) else sraw
        total_findings += len(sdata.get("results", []))
        for r in sdata.get("results", []):
            sev = r.get("extra",{}).get("metadata",{}).get("severity","").upper()
            if sev in ("ERROR", "CRITICAL"):
                critical_count += 1

    if "trufflehog" in sections_present:
        th = metrics["trufflehog"]
        seen_th = set()
        for f in th:
            data = f.get("SourceMetadata",{}).get("Data",{})
            fs = data.get("Git", {}) or data.get("Filesystem", {})
            key = (fs.get("file",""), fs.get("line",0), f.get("DetectorName",""), f.get("Raw",""))
            if key not in seen_th:
                seen_th.add(key)
                total_findings += 1
                if f.get("Verified", False):
                    critical_count += 1

    if "pipeline" in sections_present:
        pl = metrics["pipeline"]
        seen_pl = set()
        for f in pl.get("findings",[]):
            key = (f.get("runName",""), f.get("jobName",""),
                   f.get("line",0), f.get("secretType",""), f.get("preview",""))
            if key not in seen_pl:
                seen_pl.add(key)
                total_findings += 1
                if "AWS" in f.get("secretType","") or "Private" in f.get("secretType",""):
                    critical_count += 1

    kpi_items = [[
        kpi_card("OUTILS ANALYSÉS", len(sections_present), BLUE,   s=s),
        kpi_card("TOTAL FINDINGS",  total_findings,         ORANGE if total_findings > 0 else GREEN, s=s),
        kpi_card("CRITIQUES",       critical_count,         RED if critical_count > 0 else GREEN, s=s),
    ]]
    kpi_row = Table(kpi_items, colWidths=[(usable / 3)+28] * 3, hAlign="LEFT")
    kpi_row.setStyle(TableStyle([
        ("LEFTPADDING",  (0,0),(-1,-1), 3),
        ("RIGHTPADDING", (0,0),(-1,-1), 3),
        ("VALIGN",       (0,0),(-1,-1), "TOP"),
    ]))
    story.append(kpi_row)
    story.append(Spacer(1, 10 * mm))

    # Table of contents
    for el in section_heading("Sommaire", s, level=1, color=BLUE):
        story.append(el)

    section_labels = {
        "sonar":      ("SonarQube", "Analyse statique du code (qualité, dette technique, issues)", BLUE),
        "semgrep":    ("Semgrep", "Analyse SAST : vulnerabilités de securité", SECTION_COLORS["semgrep"]),
        "trufflehog": ("TruffleHog", "Détection de secrets exposés dans les fichiers", SECTION_COLORS["trufflehog"]),
        "pipeline":   ("Pipeline CI", "Secrets detectés dans les logs de CI/CD", SECTION_COLORS["pipeline"]),
    }

    toc_rows = []
    idx = 1
    for key in ["sonar", "semgrep", "trufflehog", "pipeline"]:
        if key in sections_present:
            label, desc, color = section_labels[key]
            num_style = ParagraphStyle("toc_num", fontName="Helvetica-Bold", fontSize=11,
                textColor=color, leading=16, alignment=TA_CENTER)
            name_style = ParagraphStyle("toc_name", fontName="Helvetica-Bold", fontSize=10,
                textColor=color, leading=14)
            desc_style = ParagraphStyle("toc_desc", fontName="Helvetica", fontSize=8.5,
                textColor=GRAY_DARK, leading=12)
            toc_rows.append([
                Paragraph(str(idx), num_style),
                Paragraph(label, name_style),
                Paragraph(desc, desc_style),
            ])
            idx += 1

    toc_table = Table(toc_rows, colWidths=[usable * 0.07, usable * 0.25, usable * 0.68])
    toc_table.setStyle(TableStyle([
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,0),(-1,-1), 8),
        ("BOTTOMPADDING", (0,0),(-1,-1), 8),
        ("LEFTPADDING",   (0,0),(-1,-1), 6),
        ("RIGHTPADDING",  (0,0),(-1,-1), 6),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, GRAY_ROW]),
        ("GRID",          (0,0),(-1,-1), 0.3, GRAY_MID),
    ]))
    story.append(toc_table)
    story.append(PageBreak())


# ── Main PDF builder ───────────────────────────────────────────────────────────
def build_pdf(metrics_path, output_pdf):
    metrics = load_metrics(metrics_path)

    # Detect which sections are present
    sections_present = []
    for key in ["sonar", "semgrep", "trufflehog", "pipeline"]:
        if key in metrics:
            sections_present.append(key)

    if not sections_present:
        print("Erreur : aucune section reconnue dans le fichier metrics (sonar/semgrep/trufflehog/pipeline).")
        sys.exit(1)

    print(f"Sections detectées : {', '.join(sections_present)}")

    # Derive project name
    project_name = metrics["info"].get("name")

    # ── Inférer repoUrl, platform et branch depuis les données disponibles ──────
    info = metrics.setdefault("info", {})
    # Priorité 1 : pipeline stats/findings (source la plus fiable pour repoUrl)
    if not info.get("repoUrl") and "pipeline" in metrics:
        pl = metrics["pipeline"]
        stats_pl = pl.get("stats", {})
        findings_pl = pl.get("findings", [])
        first_f = findings_pl[0] if findings_pl else {}
        ru = stats_pl.get("repoUrl") or first_f.get("repoUrl") or ""
        pf = (stats_pl.get("platform") or first_f.get("platform") or "").lower()
        if ru:
            info["repoUrl"] = ru.rstrip("/").removesuffix(".git")
        if pf:
            info["platform"] = pf
    # Priorité 2 : inférer depuis le nom (format "github-owner-repo[-branch]")
    # Le nom peut contenir la branche : "gitlab-owner-repo-branch"
    # On ne peut pas distinguer repo de branch via le nom seul => on utilise info["branch"]
    if not info.get("repoUrl"):
        raw_name = info.get("name", "")
        branch_suffix = ("-" + info["branch"]) if info.get("branch") and info["branch"] != "HEAD" else ""
        # Retirer le suffixe de branche du nom pour isoler platform-owner-repo
        clean_name = raw_name
        if branch_suffix and clean_name.endswith(branch_suffix):
            clean_name = clean_name[:-len(branch_suffix)]
        parts = clean_name.split("-")
        print(f"[DEBUG] raw_name={info.get('name')!r}, clean_name={clean_name!r}, parts={parts}, repoUrl={info.get('repoUrl')!r}")
        if len(parts) >= 3:
            plat_key = parts[0].lower()
            owner    = parts[1]
            repo     = "-".join(parts[2:])
            if "gitlab" in plat_key:
                info["repoUrl"]  = f"https://gitlab.com/{owner}/{repo}"
                info["platform"] = "gitlab"
            else:
                info["repoUrl"]  = f"https://github.com/{owner}/{repo}"
                info["platform"] = "github"

    s = make_styles()
    W, H = A4
    margin = 15 * mm
    usable = W - 2 * margin

    doc = SimpleDocTemplate(
        output_pdf, pagesize=A4,
        topMargin=20 * mm, bottomMargin=18 * mm,
        leftMargin=margin, rightMargin=margin,
    )

    story = []

    # Cover page
    build_cover(story, metrics, s, usable, sections_present)

    # Each section
    section_builders = {
        "sonar":      build_sonar_section,
        "semgrep":    build_semgrep_section,
        "trufflehog": build_trufflehog_section,
        "pipeline":   build_pipeline_section,
    }

    for i, key in enumerate(sections_present):
        section_builders[key](story, metrics, s, usable)
        # Page break between sections (not after last)
        if i < len(sections_present) - 1:
            story.append(PageBreak())

    # Page callbacks
    # Track current section color per page using a mutable container
    page_colors = {"current": BLUE, "idx": [0]}
    # We'll use a simple approach: first page is cover, subsequent pages cycle through section colors

    def first_page(c, d):
        _draw_header(c, d, first=True, project_name=project_name)
        script_dir = os.path.dirname(os.path.abspath(__file__))
        logo_path = os.path.join(script_dir, "logo.png")
        
        # Paramètres de position en haut à droite
        logo_size = 40 * mm
        margin_right = 15 * mm
        x_pos = W - margin_right - logo_size
        y_pos = H - 58 * mm
        
        if os.path.exists(logo_path):
            c.saveState()  
            path = c.beginPath()
            path.circle(x_pos + logo_size/2, y_pos + logo_size/2, logo_size/2)
            c.clipPath(path, stroke=0, fill=0) 
            c.drawImage(logo_path, x_pos, y_pos, width=logo_size, height=logo_size, mask='auto')
            c.restoreState()  
        
        c.setFont("Helvetica-Bold", 42)
        c.setFillColor(BLUE)
        c.drawString(margin + 6 * mm, H - 31 * mm, "Rapport d'Analyse")
        repo_url = metrics.get("info", {}).get("repoUrl") or metrics.get("sonar", {}).get("repoUrl") or ""
        platform = metrics.get("info", {}).get("platform") or ""
        repo_base = repo_url.rstrip("/").removesuffix(".git")
        plat = (platform or "").lower()
        branch   = metrics.get("info", {}).get("branch")
        if "gitlab" in plat or "gitlab" in repo_base:
            url = f"{repo_base}/-/blob/{branch}"
        else:
            url = f"{repo_base}/blob/{branch}"
        name_display = project_name.replace(":", "/")

        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(TEAL)
        x_pos = margin + 6 * mm
        y_pos = H - 43 * mm
        c.drawString(x_pos, y_pos, f"Lien : {name_display}")

        text_to_measure = f"Lien : {name_display}"
        text_width = c.stringWidth(text_to_measure, "Helvetica-Bold", 10)

        c.linkURL(url, (x_pos, y_pos, x_pos + text_width, y_pos + 10), relative=1)

        c.setFont("Helvetica", 10)
        c.setFillColor(GRAY_DARK)
        outils = " | ".join(k.capitalize() for k in sections_present)
        c.drawString(margin + 6 * mm, H - 51 * mm,
            f"Outils : {outils}")
        c.setFont("Helvetica", 10)
        c.drawString(margin + 6 * mm, H - 59 * mm,
            f"Généré le : {now.strftime('%d %B %Y à %H:%M')}")
        _draw_footer(c, d)

    def later_page(c, d):
        _draw_header(c, d, first=False, project_name=project_name)
        _draw_footer(c, d)

    doc.build(story, onFirstPage=first_page, onLaterPages=later_page)
    print(f"PDF généré : {output_pdf}")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Générer un rapport PDF multi-outils depuis un fichier metrics JSON.")
    parser.add_argument("metrics",     help="metrics JSON")
    parser.add_argument("pdfBasename", help="Nom de base du PDF de sortie (sans extension)")
    args = parser.parse_args()

    output_path = args.pdfBasename
    if not output_path.endswith(".pdf"):
        output_path += ".pdf"

    build_pdf(args.metrics, output_path)