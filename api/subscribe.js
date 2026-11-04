// PatchWatch newsletter signup endpoint (Vercel serverless function).
// Receives a signup from the site form, emails a notification to the
// PatchWatch inbox, and sends the subscriber the approved welcome email.
// The Resend API key lives in the RESEND_API_KEY environment variable
// (Vercel project settings), never in this file.

const RESEND_URL = "https://api.resend.com/emails";
const FROM = "PatchWatch SMB <hello@patchwatchsmb.com>";
const NOTIFY_TO = "hello@patchwatchsmb.com";

const WELCOME_SUBJECT = "Welcome to PatchWatch";
const WELCOME_TEXT = [
  "Hi, and thanks for signing up.",
  "",
  "PatchWatch tracks patch deadlines, actively exploited vulnerabilities, and end of life dates for small businesses, in plain English. You will get a short email when something important changes, and the weekly roundup on Mondays.",
  "",
  "The live tracker: https://www.patchwatchsmb.com",
  "",
  "No spam, ever. To stop these emails, just reply and say so, or use the unsubscribe link in any email.",
  "",
  "Questions or a product you want tracked? Reply to this email.",
  "",
  "PatchWatch SMB",
].join("\n");

async function sendEmail(apiKey, payload) {
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error("Resend send failed (" + res.status + "): " + detail);
  }
  return res.json().catch(() => ({}));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  body = body || {};

  // Honeypot: real visitors never fill the hidden "website" field.
  // If it has content, quietly pretend success and send nothing.
  if (body.website) {
    res.status(200).json({ ok: true });
    return;
  }

  const email = String(body.email || "").trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
  if (!emailOk) {
    res.status(400).json({ ok: false, error: "Please enter a valid email address." });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(500).json({ ok: false, error: "Signup is not configured yet." });
    return;
  }

  try {
    // Notification to the PatchWatch inbox.
    await sendEmail(apiKey, {
      from: FROM,
      to: [NOTIFY_TO],
      subject: "New PatchWatch signup",
      text:
        "New subscriber for the Weekly SMB Security Brief.\n\nEmail: " +
        email +
        "\nTime: " +
        new Date().toISOString() +
        "\nSource: patchwatchsmb.com newsletter form",
    });

    // Welcome email to the subscriber (wording approved 2026-11-04).
    await sendEmail(apiKey, {
      from: FROM,
      to: [email],
      reply_to: NOTIFY_TO,
      subject: WELCOME_SUBJECT,
      text: WELCOME_TEXT,
      headers: {
        "List-Unsubscribe":
          "<mailto:hello@patchwatchsmb.com?subject=Unsubscribe>",
      },
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res
      .status(502)
      .json({ ok: false, error: "Could not complete the signup. Please try again." });
  }
};
