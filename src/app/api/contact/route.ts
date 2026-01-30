import { Resend } from "resend";

export const runtime = "nodejs";

function badRequest(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    const to = process.env.CONTACT_TO_EMAIL;
    const from = process.env.CONTACT_FROM_EMAIL;

    if (!resendKey) return badRequest("Missing RESEND_API_KEY", 500);
    if (!to) return badRequest("Missing CONTACT_TO_EMAIL", 500);
    if (!from) return badRequest("Missing CONTACT_FROM_EMAIL", 500);

    const body = await req.json().catch(() => null);
    const email = String(body?.email ?? "").trim().toLowerCase();
    const name = String(body?.name ?? "").trim();
    const message = String(body?.message ?? "").trim();

    // minimal validation
    if (!email) return badRequest("Email is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest("Invalid email");

    const resend = new Resend(resendKey);

    const subject = `The Bureau — Request Access${name ? ` (${name})` : ""}`;

    const text = [
      `New Request Access submission`,
      ``,
      `Email: ${email}`,
      name ? `Name: ${name}` : null,
      message ? `Message: ${message}` : null,
      ``,
      `Sent: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n");

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      text,
      replyTo: email, // so you can reply directly
    });

    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true, id: data?.id ?? null });
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
