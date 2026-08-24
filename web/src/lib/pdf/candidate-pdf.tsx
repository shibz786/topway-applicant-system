import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Svg,
  Defs,
  LinearGradient,
  Stop,
  Rect,
  renderToBuffer,
} from "@react-pdf/renderer";
import { registerPdfFonts } from "./fonts";
import { join } from "node:path";
import type { WorkerCategory } from "@prisma/client";

const TOPWAY_LOGO_PATH = join(process.cwd(), "public/logo.png");

/**
 * Exact port of the legacy app's candidate PDF — index.html's #pdf-layout
 * (HTML captured via html2canvas + jsPDF) and its styling in the repo
 * root's style.css (search "#pdf-layout", ".pdf-*"). The user asked for
 * this format back verbatim after a redesign pass changed it — every
 * color/size/weight below is copied from that CSS, not reinvented. px
 * values in the original (794×1123 CSS px, i.e. A4 at 96dpi) are converted
 * to pt at ×0.75 (react-pdf's unit); values already in pt in the source
 * CSS are kept as-is.
 *
 * KNOWN GAP: the legacy flat-JSON record carried several fields the
 * current Candidate schema has no column for — job role/position (e.g.
 * "HOUSEMAID", shown as the big title in the role box), reference number,
 * height, weight, marital status, children count, passport issue
 * date/place, and education grade/year. Rather than invent data or
 * silently drop the layout rows that show them, this renders the exact
 * same rows the legacy template did with blank values — the same
 * graceful-empty behavior the legacy template already had when a field
 * was unset. "Role" defaults to HOUSEMAID (the agency's actual worker
 * category, confirmed against the real migrated data — every one of the
 * legacy profiles had f-role: "HOUSEMAID"). Flagged in CLAUDE.md as a
 * schema decision for the user, not resolved unilaterally here.
 */

const COLOR = {
  ink: "#1a2830",
  muted: "#5d7d8c",
  line: "#dce8ec",
  lineStrong: "#b5cdd6",
  soft: "#f2f7f9",
  accent: "#284e5a",
  accent2: "#3a6e7e",
  accentLight: "#eaf4f7",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: { fontFamily: "Inter", color: COLOR.ink, backgroundColor: COLOR.white },

  topbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 13.5,
    backgroundColor: COLOR.white,
    borderBottomWidth: 2.25,
    borderBottomColor: COLOR.accent,
  },
  logoSlot: { flex: 1, minHeight: 43.5, justifyContent: "center" },
  logoSlotRight: { flex: 1, minHeight: 43.5, justifyContent: "center", alignItems: "flex-end" },
  logoImg: { maxHeight: 43.5, maxWidth: 150, objectFit: "contain" },
  logoEmpty: { fontSize: 8.5, color: COLOR.muted, fontStyle: "italic" },
  headerCenter: {
    flex: 1.5,
    textAlign: "center",
    paddingHorizontal: 10.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: COLOR.lineStrong,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: COLOR.accent,
  },
  headerSub: {
    marginTop: 2.25,
    fontSize: 7.5,
    fontWeight: 600,
    color: COLOR.muted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  body: { padding: "7.5 10.5 9", flexDirection: "column", gap: 5.25 },

  topgrid: { flexDirection: "row", gap: 5.25 },
  box: { borderWidth: 0.75, borderColor: COLOR.lineStrong, borderRadius: 2.25, backgroundColor: COLOR.white },
  boxTitle: {
    padding: "3.75 7.5",
    fontWeight: 800,
    letterSpacing: 0.75,
    textTransform: "uppercase",
    fontSize: 7.5,
    backgroundColor: COLOR.accent,
    color: COLOR.white,
  },

  skillRow: { flexDirection: "row", borderTopWidth: 0.75, borderTopColor: COLOR.line, paddingVertical: 4.1, paddingHorizontal: 7.5 },
  skillRowFirst: { borderTopWidth: 0 },
  skillRowEven: { backgroundColor: COLOR.accentLight },
  skillLabel: { flex: 1, fontWeight: 600, color: COLOR.ink, fontSize: 9.5 },
  skillCheckWrap: { width: 28, alignItems: "center" },
  checkbox: {
    width: 11.25,
    height: 11.25,
    borderWidth: 1.125,
    borderColor: COLOR.ink,
    borderRadius: 2.25,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxMark: { fontSize: 8, fontWeight: 900, lineHeight: 1 },

  roleBox: { flex: 1, overflow: "hidden", position: "relative" },
  roleBoxInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    paddingHorizontal: 7.5,
    gap: 7.5,
  },
  roleTitle: {
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: 0.6,
    color: COLOR.white,
    textTransform: "uppercase",
    textAlign: "center",
  },
  contractBadge: {
    fontSize: 8.5,
    fontWeight: 700,
    color: COLOR.accent,
    paddingVertical: 3,
    paddingHorizontal: 10.5,
    borderRadius: 999,
    backgroundColor: COLOR.white,
    letterSpacing: 0.3,
  },

  headshotBoxPad: { padding: 6 },
  headshotFrame: {
    width: "100%",
    height: 116,
    borderWidth: 0.75,
    borderColor: COLOR.lineStrong,
    borderRadius: 2.25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLOR.soft,
    overflow: "hidden",
  },
  headshotImg: { width: "100%", height: "100%", objectFit: "cover" },
  placeholderText: { fontSize: 8.5, color: COLOR.muted },

  maingrid: { flexDirection: "row", gap: 5.25 },
  leftwide: { flex: 2.05, borderWidth: 0.75, borderColor: COLOR.lineStrong, borderRadius: 2.25, overflow: "hidden" },
  rightphoto: { flex: 0.9, borderWidth: 0.75, borderColor: COLOR.lineStrong, borderRadius: 2.25, flexDirection: "column" },

  infoRow: { flexDirection: "row", borderTopWidth: 0.75, borderTopColor: COLOR.line, paddingVertical: 4.1, paddingHorizontal: 7.5 },
  infoRowFirst: { borderTopWidth: 0 },
  infoRowEven: { backgroundColor: COLOR.accentLight },
  infoLbl: { width: "40%", fontWeight: 700, color: COLOR.ink, fontSize: 9.5 },
  infoVal: { flex: 1, fontWeight: 500, color: COLOR.ink, fontSize: 9.5 },
  sectionRow: { backgroundColor: COLOR.accent2, padding: "3.75 7.5" },
  sectionRowText: { fontWeight: 800, color: COLOR.white, fontSize: 7.5, letterSpacing: 0.6, textTransform: "uppercase" },

  fullphoto: { flex: 1, backgroundColor: COLOR.soft, alignItems: "center", justifyContent: "center", minHeight: 210 },
  fullphotoImg: { width: "100%", height: "100%", objectFit: "contain" },
  refUnder: { padding: "6 7.5", alignItems: "center", backgroundColor: COLOR.accent },
  refNo: { fontWeight: 600, color: "rgba(255,255,255,0.7)", fontSize: 7.5, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 1.5 },
  refName: { fontWeight: 900, color: COLOR.white, letterSpacing: 0.2, fontSize: 10.5 },

  empBlock: { borderWidth: 0.75, borderColor: COLOR.lineStrong, borderRadius: 2.25, overflow: "hidden" },
  empTitle: {
    fontWeight: 800,
    padding: "3.75 7.5",
    backgroundColor: COLOR.accent,
    color: COLOR.white,
    fontSize: 7.5,
    letterSpacing: 0.75,
    textTransform: "uppercase",
  },
  tableHeaderRow: { flexDirection: "row", backgroundColor: COLOR.soft, borderTopWidth: 0.75, borderTopColor: COLOR.line },
  th: { padding: "3.75 7.5", fontWeight: 700, fontSize: 7.5, letterSpacing: 0.5, textTransform: "uppercase", color: COLOR.accent },
  tableBodyRow: { flexDirection: "row", borderTopWidth: 0.75, borderTopColor: COLOR.line },
  tableBodyRowEven: { backgroundColor: COLOR.accentLight },
  td: { padding: "4.1 7.5", fontSize: 9.5 },

  footer: { backgroundColor: COLOR.accent, color: COLOR.white, textAlign: "center", padding: "6.75 10.5", fontSize: 9.5 },
});

function Checkbox({ checked }: { checked: boolean }) {
  // Legacy (index.html's pdf-boxcb) uses "✕" (U+2715), rendered fine
  // in-browser via html2canvas' font fallback. Inter has no glyph for it —
  // react-pdf/fontkit has no fallback mechanism, so it silently draws
  // nothing and every checked box looked empty. Plain "X" is in Inter and
  // is visually indistinguishable at this size/weight.
  return (
    <View style={styles.checkbox}>
      {checked && <Text style={styles.checkboxMark}>X</Text>}
    </View>
  );
}

function InfoRow({ label, value, first, even }: { label: string; value: string; first?: boolean; even?: boolean }) {
  return (
    <View style={[styles.infoRow, first ? styles.infoRowFirst : undefined, even ? styles.infoRowEven : undefined]}>
      <Text style={styles.infoLbl}>{label}</Text>
      <Text style={styles.infoVal}>{value}</Text>
    </View>
  );
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function calcAge(dob: Date): string {
  const diff = Date.now() - new Date(dob).getTime();
  return String(Math.max(0, Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))));
}

export type CandidateForPdf = {
  fullName: string;
  nationality: string;
  dateOfBirth: Date;
  passportNumber: string;
  passportExpiry: Date;
  religion: string | null;
  category: WorkerCategory;
  skills: string[];
  languages: string[];
  contractDuration: number;
};

const SKILL_ROWS = [
  { key: "Cleaning", label: "Cleaning" },
  { key: "Washing", label: "Washing" },
  { key: "Babysitting", label: "Baby Sitting" },
  { key: "Cooking", label: "Arabic Cooking" },
  { key: "Driving", label: "Driving" },
];

export function CandidatePdfDocument({
  candidate,
  headshotDataUri,
  fullPhotoDataUri,
  agentLogoDataUri,
}: {
  candidate: CandidateForPdf;
  headshotDataUri: string | null;
  fullPhotoDataUri: string | null;
  agentLogoDataUri: string | null;
}) {
  const hasEn = candidate.languages.includes("English");
  const hasAr = candidate.languages.includes("Arabic");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEADER */}
        <View style={styles.topbar}>
          <View style={styles.logoSlot}>
            {agentLogoDataUri ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, no alt prop
              <Image src={agentLogoDataUri} style={styles.logoImg} />
            ) : (
              <Text style={styles.logoEmpty}>Foreign agency logo</Text>
            )}
          </View>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Candidate Profile</Text>
            <Text style={styles.headerSub}>Applicant Information Sheet</Text>
          </View>
          <View style={styles.logoSlotRight}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, no alt prop */}
            <Image src={TOPWAY_LOGO_PATH} style={styles.logoImg} />
          </View>
        </View>

        {/* BODY */}
        <View style={styles.body}>
          {/* TOP GRID: Skills | Role/Contract | Headshot */}
          <View style={styles.topgrid}>
            <View style={[styles.box, { flex: 1.1 }]}>
              <Text style={styles.boxTitle}>Skills</Text>
              {SKILL_ROWS.map((s, i) => (
                <View
                  key={s.key}
                  style={[
                    styles.skillRow,
                    i === 0 ? styles.skillRowFirst : undefined,
                    i % 2 === 1 ? styles.skillRowEven : undefined,
                  ]}
                >
                  <Text style={styles.skillLabel}>{s.label}</Text>
                  <View style={styles.skillCheckWrap}>
                    <Checkbox checked={candidate.skills.includes(s.key)} />
                  </View>
                </View>
              ))}
            </View>

            <View style={[styles.box, styles.roleBox, { flex: 1 }]}>
              <Svg
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <Defs>
                  <LinearGradient id="roleGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={COLOR.accent} />
                    <Stop offset="1" stopColor={COLOR.accent2} />
                  </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={100} height={100} fill="url(#roleGrad)" />
              </Svg>
              <View style={styles.roleBoxInner}>
                <Text style={styles.roleTitle}>Housemaid</Text>
                <Text style={styles.contractBadge}>Contract: {contractLabel(candidate.contractDuration)}</Text>
              </View>
            </View>

            <View style={[styles.box, { flex: 0.95 }, styles.headshotBoxPad]}>
              <View style={styles.headshotFrame}>
                {headshotDataUri ? (
                  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, no alt prop
                  <Image src={headshotDataUri} style={styles.headshotImg} />
                ) : (
                  <Text style={styles.placeholderText}>Headshot</Text>
                )}
              </View>
            </View>
          </View>

          {/* MAIN GRID: Info tables | Full photo */}
          <View style={styles.maingrid}>
            <View style={styles.leftwide}>
              <InfoRow label="Nationality" value={candidate.nationality} first even={false} />
              <InfoRow label="Religion" value={candidate.religion ?? ""} even />
              <InfoRow label="D.O.B" value={fmtDate(candidate.dateOfBirth)} even={false} />
              <InfoRow label="Age" value={calcAge(candidate.dateOfBirth)} even />
              <InfoRow label="Height" value="" even={false} />
              <InfoRow label="Weight" value="" even />
              <InfoRow label="Marital Status" value="" even={false} />
              <InfoRow label="Children (No.)" value="" even />

              <InfoRow label="Passport No." value={candidate.passportNumber} first even={false} />
              <InfoRow label="Date of Issue" value="" even />
              <InfoRow label="Date of Expiry" value={fmtDate(candidate.passportExpiry)} even={false} />
              <InfoRow label="Place of Issue" value="" even />

              <View style={styles.sectionRow}>
                <Text style={styles.sectionRowText}>Educational Qualification</Text>
              </View>
              <InfoRow label="Grade" value="" first even={false} />
              <InfoRow label="Year" value="" even />
            </View>

            <View style={styles.rightphoto}>
              <View style={styles.fullphoto}>
                {fullPhotoDataUri ? (
                  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, no alt prop
                  <Image src={fullPhotoDataUri} style={styles.fullphotoImg} />
                ) : (
                  <Text style={styles.placeholderText}>Full Photo</Text>
                )}
              </View>
              <View style={styles.refUnder}>
                <Text style={styles.refNo}>Ref No.</Text>
                <Text style={styles.refName}>{candidate.fullName}</Text>
              </View>
            </View>
          </View>

          {/* EMPLOYMENT + LANGUAGE */}
          <View style={styles.empBlock}>
            <Text style={styles.empTitle}>Employment Record &amp; Language Skills</Text>

            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, { flex: 1 }]}>Language</Text>
              <Text style={[styles.th, { width: 58.5, textAlign: "center" }]}>Speaking</Text>
              <Text style={[styles.th, { width: 58.5, textAlign: "center" }]}>Writing</Text>
            </View>
            <View style={styles.tableBodyRow}>
              <Text style={[styles.td, { flex: 1 }]}>English</Text>
              <View style={[styles.td, { width: 58.5, alignItems: "center" }]}>
                <Checkbox checked={hasEn} />
              </View>
              <View style={[styles.td, { width: 58.5, alignItems: "center" }]}>
                <Checkbox checked={hasEn} />
              </View>
            </View>
            <View style={styles.tableBodyRow}>
              <Text style={[styles.td, { flex: 1 }]}>Arabic</Text>
              <View style={[styles.td, { width: 58.5, alignItems: "center" }]}>
                <Checkbox checked={hasAr} />
              </View>
              <View style={[styles.td, { width: 58.5, alignItems: "center" }]}>
                <Checkbox checked={hasAr} />
              </View>
            </View>

            <View style={styles.tableHeaderRow}>
              <Text style={[styles.th, { flex: 1 }]}>Position</Text>
              <Text style={[styles.th, { flex: 1 }]}>Country</Text>
              <Text style={[styles.th, { flex: 1 }]}>Period</Text>
            </View>
            <View style={styles.tableBodyRow}>
              <Text style={[styles.td, { flex: 1, textAlign: "center", color: COLOR.lineStrong }]}>—</Text>
              <Text style={[styles.td, { flex: 1 }]} />
              <Text style={[styles.td, { flex: 1 }]} />
            </View>
          </View>
        </View>

        {/* FOOTER */}
        <Text style={styles.footer}> </Text>
      </Page>
    </Document>
  );
}

function contractLabel(months: number): string {
  if (months % 12 === 0) {
    const years = months / 12;
    return `${years} Year${years === 1 ? "" : "s"}`;
  }
  return `${months} Months`;
}

export async function renderCandidatePdf(props: {
  candidate: CandidateForPdf;
  headshotDataUri: string | null;
  fullPhotoDataUri: string | null;
  agentLogoDataUri: string | null;
}): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<CandidatePdfDocument {...props} />);
}
