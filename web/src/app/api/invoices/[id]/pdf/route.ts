import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/authorize";
import { toErrorResponse } from "@/lib/api-error";
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf";

// Same render function backs both "view/print" (inline) and "download"
// (attachment) — CLAUDE.md: "Download and print both use the same PDF."
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession();
    requirePermission(user, "invoices");

    const { id } = await params;
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: { items: { include: { candidate: { select: { id: true, fullName: true } } } } },
    });
    if (!invoice) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const [agent, company] = await Promise.all([
      invoice.agentId
        ? db.agent.findUnique({ where: { id: invoice.agentId }, select: { companyName: true, country: true } })
        : Promise.resolve(null),
      db.companySettings.findUnique({ where: { id: "singleton" } }),
    ]);

    const pdfBuffer = await renderInvoicePdf({
      invoice,
      agent,
      company: company ?? {
        id: "singleton",
        bankName: null,
        accountNo: null,
        accountName: null,
        swiftCode: null,
        email: null,
        phone: null,
        fax: null,
        address: null,
        website: null,
        updatedAt: new Date(0),
      },
    });

    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="invoice-${invoice.number}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
