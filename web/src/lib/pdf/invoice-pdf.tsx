import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { Prisma } from "@prisma/client";
import type { CompanySettingsData } from "@/lib/actions/company-settings";
import { registerPdfFonts } from "./fonts";
import { join } from "node:path";

/**
 * Exact port of the legacy app's invoice PDF — invoice.html's
 * buildPrintTemplate() (an inline-styled HTML string, captured via
 * html2canvas + jsPDF). The user asked for this format back verbatim
 * after a redesign pass changed it — every color/size/weight below is
 * copied from that function, not reinvented. px values (that template was
 * hand-styled at 794×1123 CSS px, A4 at 96dpi) are converted to pt at
 * ×0.75.
 *
 * KNOWN GAP: the legacy invoice record carried a few fields the current
 * Invoice/Agent schema has no column for — the "Bill To" block's
 * title/purpose/license-number, a free-text service type, payment method,
 * bank details, and company contact footer. migrate-legacy-data.ts
 * deliberately preserved all of these as a JSON blob appended to
 * Invoice.notes (marked with MIGRATION_MARKER below) rather than
 * inventing schema or dropping them. This file parses that blob back out
 * for migrated invoices so the PDF shows the *real* historical values
 * (bank details in particular genuinely varied invoice-to-invoice — two
 * different accounts show up across the 4 migrated invoices, so this
 * can't just be flattened into one constant) — never render invoice.notes
 * raw, or that JSON leaks onto the page as visible text. For invoices
 * created in the new app (no migrated blob), bank details + company
 * footer fall back to the CompanySettings singleton (Phase 2, admin-
 * editable), and billTo/serviceType/paymentMethod fall back to the same
 * defaults the legacy template used for an empty field (e.g. "HOUSEMAID
 * WORKERS", "REMITTANCE").
 */

const MIGRATION_MARKER = "[MIGRATED FROM LEGACY — fields with no home in the new schema, preserved verbatim]";

type MigratedInvoiceData = {
  billTo?: { title?: string; company?: string; purpose?: string; licenseNo?: string };
  serviceType?: string;
  paymentMethod?: string;
  bankDetails?: { bankName?: string; accountNo?: string; accountName?: string; swiftCode?: string };
  companyFooter?: { email?: string; phone?: string; fax?: string; address?: string; website?: string };
};

function parseMigratedInvoiceData(notes: string | null): MigratedInvoiceData | null {
  if (!notes) return null;
  const markerIdx = notes.indexOf(MIGRATION_MARKER);
  if (markerIdx === -1) return null;
  const jsonStart = notes.indexOf("{", markerIdx);
  if (jsonStart === -1) return null;
  try {
    return JSON.parse(notes.slice(jsonStart).trim()) as MigratedInvoiceData;
  } catch {
    return null;
  }
}

// The genuine admin-written free text (if any) precedes the marker; the
// JSON payload itself is internal migration bookkeeping and must never be
// shown to whoever receives the invoice.
function humanNotes(notes: string | null): string | null {
  if (!notes) return null;
  const markerIdx = notes.indexOf(MIGRATION_MARKER);
  const human = markerIdx === -1 ? notes : notes.slice(0, markerIdx).trim();
  return human || null;
}

const TOPWAY_LOGO_PATH = join(process.cwd(), "public/logo.png");

const styles = StyleSheet.create({
  page: {
    fontFamily: "Inter",
    color: "#333333",
    backgroundColor: "#ffffff",
    padding: "33 39 27",
  },

  headerRow: { flexDirection: "row", marginBottom: 7.5 },
  headerLogoCol: { width: "50%", paddingRight: 15 },
  logo: { height: 52.5, maxWidth: 150, objectFit: "contain" },
  billToCol: { width: "50%" },
  billToLabel: { fontSize: 9, fontWeight: 700, color: "#555555", marginBottom: 3 },
  billToTitle: { fontSize: 10, fontWeight: 800, color: "#274650", lineHeight: 1.3 },
  billToCompany: { fontSize: 10.5, fontWeight: 800, color: "#1a2b35", lineHeight: 1.3 },
  billToPurpose: { fontSize: 8.6, color: "#555555", marginTop: 3, lineHeight: 1.5 },
  billToLicense: { fontSize: 8.25, color: "#777777", marginTop: 1.5 },

  dateBadgeRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 13.5 },
  dateBadge: { backgroundColor: "#2b7a8c", color: "#ffffff", paddingVertical: 6, paddingHorizontal: 13.5, borderRadius: 4.5, alignItems: "center" },
  dateBadgeLabel: { fontSize: 7.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", opacity: 0.85 },
  dateBadgeValue: { fontSize: 9.75, fontWeight: 700, marginTop: 1.5 },

  titleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 13.5,
    borderBottomWidth: 1.5,
    borderBottomColor: "#e0eaee",
    paddingBottom: 9,
  },
  titleText: { fontSize: 18, fontWeight: 900, color: "#1a2b35" },
  invoiceNoLabel: { fontSize: 9.75, fontWeight: 700, color: "#555555" },
  invoiceNoValue: { color: "#888888", fontWeight: 600 },

  table: { width: "100%" },
  theadRow: { flexDirection: "row", backgroundColor: "#274650" },
  th: { padding: "8.25 10.5", fontSize: 8.6, fontWeight: 700, color: "#ffffff", letterSpacing: 0.55, textTransform: "uppercase" },
  serviceTypeRow: { backgroundColor: "#eef4f7", borderBottomWidth: 0.75, borderBottomColor: "#dce8ed" },
  serviceTypeText: { padding: "7.5 10.5", fontSize: 9.75, fontWeight: 800, color: "#1a2b35", textTransform: "uppercase", letterSpacing: 0.3 },
  workerRow: { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: "#e8eef1" },
  tdName: { padding: "6.75 10.5", fontSize: 9, color: "#333333" },
  tdDash: { color: "#888888" },
  tdEmpty: { padding: "6.75 10.5", fontSize: 9 },
  tdQty: { padding: "6.75 10.5", fontSize: 9, color: "#555555", textAlign: "center" },
  tdTotal: { padding: "6.75 10.5", fontSize: 9.4, fontWeight: 700, color: "#274650", textAlign: "right" },

  footerRow: { flexDirection: "row", marginTop: 7.5 },
  bankCol: { width: "55%", paddingRight: 15, justifyContent: "flex-end" },
  bankName: { fontSize: 9, fontWeight: 800, color: "#1a2b35", marginBottom: 3.75 },
  bankLine: { fontSize: 9, color: "#444444", fontWeight: 600 },
  notesText: { marginTop: 4.5, fontSize: 7.9, color: "#777777" },

  amountCol: { width: "45%", justifyContent: "flex-end" },
  amountBox: { backgroundColor: "#274650", padding: "9 13.5", borderTopLeftRadius: 4.5, borderTopRightRadius: 4.5, alignItems: "center" },
  amountLabel: { fontSize: 8.25, fontWeight: 600, letterSpacing: 0.55, textTransform: "uppercase", color: "#ffffff", opacity: 0.8 },
  amountValue: { fontSize: 13.5, fontWeight: 900, color: "#ffffff" },
  paymentBox: { backgroundColor: "#2b7a8c", padding: "6.75 13.5", borderBottomLeftRadius: 4.5, borderBottomRightRadius: 4.5, alignItems: "center" },
  paymentLabel: { fontSize: 7.9, fontWeight: 700, letterSpacing: 0.55, textTransform: "uppercase", color: "#ffffff", opacity: 0.85 },
  paymentValue: { fontSize: 9, fontWeight: 800, color: "#ffffff", letterSpacing: 0.3 },

  thankYouWrap: { textAlign: "center", marginTop: 21, paddingTop: 12, borderTopWidth: 0.75, borderTopColor: "#e8eef1" },
  thankYouText: { fontFamily: "Times-Italic", fontSize: 16.5, color: "#355b66", marginBottom: 3 },
  thankYouSub: { fontSize: 8.25, color: "#888888" },

  contactRow: {
    marginTop: 12,
    paddingTop: 7.5,
    borderTopWidth: 2.25,
    borderTopColor: "#355b66",
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 16.5,
  },
  contactItem: { fontSize: 7.5, color: "#666666" },
  websiteText: { textAlign: "center", marginTop: 6, fontSize: 7.5, color: "#aaaaaa" },
});

export type InvoiceForPdf = {
  number: string;
  status: string;
  currency: string;
  totalAmount: Prisma.Decimal | number;
  notes: string | null;
  issuedAt: Date | null;
  dueAt: Date | null;
  items: { id: string; description: string; amount: Prisma.Decimal | number; quantity: number }[];
};

function fmtAmount(v: Prisma.Decimal | number): string {
  const n = typeof v === "number" ? v : v.toNumber();
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function InvoicePdfDocument({
  invoice,
  agent,
  company,
}: {
  invoice: InvoiceForPdf;
  agent: { companyName: string; country: string } | null;
  company: CompanySettingsData;
}) {
  const migrated = parseMigratedInvoiceData(invoice.notes);
  const noteText = humanNotes(invoice.notes);

  const billToTitle = migrated?.billTo?.title ?? "";
  const billToCompany = migrated?.billTo?.company || agent?.companyName || "";
  const billToPurpose = migrated?.billTo?.purpose || "For Recruitment of Domestic Manpower";
  const billToLicense = migrated?.billTo?.licenseNo ?? "";
  const serviceType = migrated?.serviceType || "HOUSEMAID WORKERS";
  const paymentMethod = migrated?.paymentMethod || "REMITTANCE";

  const bankName = migrated?.bankDetails?.bankName || company.bankName || "";
  const accountNo = migrated?.bankDetails?.accountNo || company.accountNo || "";
  const accountName = migrated?.bankDetails?.accountName || company.accountName || "";
  const swiftCode = migrated?.bankDetails?.swiftCode || company.swiftCode || "";

  const footer = migrated?.companyFooter;
  // Legacy rendered these with ✉/☎/📠/📍 glyphs (html2canvas paints them via
  // the browser's own emoji font, independent of the page's declared
  // font-family). Inter has no emoji/dingbat coverage, and react-pdf/
  // fontkit has no font-fallback mechanism for missing glyphs the way a
  // browser does — the plain symbols (✉ ☎) silently vanish and the
  // supplementary-plane ones (📠 📍) render as corrupted overlapping
  // glyphs. Plain-text labels are the closest fallback that stays legible
  // without bundling a whole emoji font just for four characters.
  const contactItems = [
    (footer?.email || company.email) && `Email: ${footer?.email || company.email}`,
    (footer?.phone || company.phone) && `Tel: ${footer?.phone || company.phone}`,
    (footer?.fax || company.fax) && `Fax: ${footer?.fax || company.fax}`,
    (footer?.address || company.address) && `Address: ${footer?.address || company.address}`,
  ].filter(Boolean) as string[];
  const website = footer?.website || company.website || "";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* HEADER: logo | bill-to */}
        <View style={styles.headerRow}>
          <View style={styles.headerLogoCol}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, no alt prop */}
            <Image src={TOPWAY_LOGO_PATH} style={styles.logo} />
          </View>
          <View style={styles.billToCol}>
            <Text style={styles.billToLabel}>Bill to:</Text>
            {billToTitle ? <Text style={styles.billToTitle}>{billToTitle}</Text> : null}
            <Text style={styles.billToCompany}>{billToCompany}</Text>
            <Text style={styles.billToPurpose}>{billToPurpose}</Text>
            <Text style={styles.billToLicense}>License Number: {billToLicense}</Text>
          </View>
        </View>

        {/* DATE BADGE */}
        <View style={styles.dateBadgeRow}>
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeLabel}>Invoiced Date:</Text>
            <Text style={styles.dateBadgeValue}>{fmtDate(invoice.issuedAt)}</Text>
          </View>
        </View>

        {/* TITLE ROW */}
        <View style={styles.titleRow}>
          <Text style={styles.titleText}>Payment Invoice:</Text>
          <Text style={styles.invoiceNoLabel}>
            <Text style={styles.invoiceNoValue}>Invoice No: </Text>
            {invoice.number}
          </Text>
        </View>

        {/* SERVICES TABLE */}
        <View style={styles.table}>
          <View style={styles.theadRow}>
            <Text style={[styles.th, { width: "50%" }]}>Service</Text>
            <Text style={[styles.th, { width: "20%" }]}>Cost ({invoice.currency})</Text>
            <Text style={[styles.th, { width: "14%", textAlign: "center" }]}>Qty</Text>
            <Text style={[styles.th, { width: "16%", textAlign: "right" }]}>Total</Text>
          </View>

          <View style={styles.serviceTypeRow}>
            <Text style={styles.serviceTypeText}>{serviceType}</Text>
          </View>

          {invoice.items.map((item, i) => (
            <View key={item.id} style={[styles.workerRow, { backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8fbfc" }]}>
              <Text style={[styles.tdName, { width: "50%" }]}>
                <Text style={styles.tdDash}>— </Text>
                {item.description}
              </Text>
              <Text style={[styles.tdEmpty, { width: "20%" }]} />
              <Text style={[styles.tdQty, { width: "14%" }]}>{String(item.quantity).padStart(2, "0")}</Text>
              <Text style={[styles.tdTotal, { width: "16%" }]}>
                {invoice.currency} {fmtAmount(item.amount)}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ flex: 1, minHeight: 21 }} />

        {/* FOOTER: bank details | amount + payment method */}
        <View style={styles.footerRow}>
          <View style={styles.bankCol}>
            <Text style={styles.bankName}>{bankName}</Text>
            <Text style={styles.bankLine}>{accountNo}</Text>
            <Text style={styles.bankLine}>{accountName}</Text>
            <Text style={styles.bankLine}>SWIFT CODE: {swiftCode}</Text>
            {noteText && <Text style={styles.notesText}>{noteText}</Text>}
          </View>
          <View style={styles.amountCol}>
            <View style={styles.amountBox}>
              <Text>
                <Text style={styles.amountLabel}>Amount: </Text>
                <Text style={styles.amountValue}>
                  {invoice.currency} {fmtAmount(invoice.totalAmount)}/-
                </Text>
              </Text>
            </View>
            <View style={styles.paymentBox}>
              <Text>
                <Text style={styles.paymentLabel}>Payment Method: </Text>
                <Text style={styles.paymentValue}>{paymentMethod}</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* THANK YOU */}
        <View style={styles.thankYouWrap}>
          <Text style={styles.thankYouText}>Thank you</Text>
          <Text style={styles.thankYouSub}>for considering our services</Text>
        </View>

        {/* CONTACT FOOTER */}
        {contactItems.length > 0 && (
          <View style={styles.contactRow}>
            {contactItems.map((item) => (
              <Text key={item} style={styles.contactItem}>
                {item}
              </Text>
            ))}
          </View>
        )}
        {website && <Text style={styles.websiteText}>{website}</Text>}
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(props: {
  invoice: InvoiceForPdf;
  agent: { companyName: string; country: string } | null;
  company: CompanySettingsData;
}): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<InvoicePdfDocument {...props} />);
}
