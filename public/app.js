const form = document.getElementById("lead-form");
const button = document.getElementById("confirm-button");
const errorBox = document.getElementById("form-error");

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  errorBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) return;

  errorBox.hidden = true;
  errorBox.textContent = "";

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Submitting...";

  const payload = Object.fromEntries(new FormData(form).entries());

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      if (result.code === "SUPABASE_NOT_CONFIGURED") {
        throw new Error(
          "Local server setup is incomplete. Add your Supabase secret to .dev.vars, restart npm run dev, then try again."
        );
      }

      throw new Error(result.error || `Registration failed (${response.status}).`);
    }

    // The registration is complete once Supabase accepted it. Email delivery is
    // allowed to fail independently and is shown on the thank-you page.
    if (!result.email_sent) {
      console.warn("Catalogue email was not sent:", result.email_error || "Unknown SMTP error.");
    }

    const emailFlag = result.email_sent ? "sent" : "failed";
    window.location.assign(`/thank-you.html?email=${emailFlag}`);
  } catch (error) {
    console.error(error);

    const message = error?.message || "Registration failed.";
    const isNetworkError = /failed to fetch|networkerror|load failed/i.test(message);

    showError(
      isNetworkError
        ? "The server could not be reached. Please check that npm run dev is still running and try again."
        : message
    );
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});
